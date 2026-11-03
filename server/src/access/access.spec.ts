import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatEvent, ToolResult } from '../../../shared/api';
import { createChatAgents, providerInfo } from '../chat/agent.factory';
import { ClaudeAgent } from '../chat/claude-agent';
import { readEnv } from '../config/env';
import { DataService } from '../data/data.service';
import { fakeClaude, text, use } from '../testing/fake-claude';
import { ABANDON_CAP, AccessControl, accessEnabled, createAccess, generateCode, LOCK_SECONDS, normalizeCode } from './access';
import { runCodes } from './codes-cli';
import { MemoryRedis, UpstashRedis, type Redis } from './redis';

process.env.LIVE_CHECK = 'off';
const SECRET = 'test-secret-that-is-long-enough-0123456789';

/** In memory by default; against a real (test) Upstash database when REDIS_TEST_URL and REDIS_TEST_TOKEN are set. */
const real = process.env.REDIS_TEST_URL && process.env.REDIS_TEST_TOKEN;
const newAccess = () => {
  const redis: Redis = real ? new UpstashRedis(process.env.REDIS_TEST_URL!, process.env.REDIS_TEST_TOKEN!) : new MemoryRedis();
  return new AccessControl(redis, SECRET, `aia:test:${randomUUID()}:`);
};

/** One complete question: accept, then complete (answered: charged) or release (failed: not charged). */
async function ask(a: AccessControl, id: string, outcome: 'answered' | 'failed' = 'answered', qid = randomUUID()) {
  const r = await a.reserve(id, qid);
  if (r.ok) await (outcome === 'answered' ? a.complete(id, qid, r.prepaid) : a.release(id));
  return r;
}
const accepted = (used: number, limit = 20, prepaid = false) => ({ ok: true, used, limit, prepaid });

describe('access codes', () => {
  it('generates 80-bit codes in a readable format and normalizes what people type', () => {
    const codes = new Set(Array.from({ length: 200 }, generateCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^AIA-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(normalizeCode(' aia-7k3m-q9zx-0p1d-v4ht ')).toBe('7K3MQ9ZX0P1DV4HT');
    expect(normalizeCode('7K3M Q9ZX OP1D V4HT')).toBe('7K3MQ9ZX0P1DV4HT'); // O typed for 0, no prefix
    expect(normalizeCode('AIA7K3MQ9ZX0PlDV4HT')).toBe('7K3MQ9ZX0P1DV4HT'); // l typed for 1
  });

  it('is on only on Vercel or when forced, and refuses to start there without storage and secret', () => {
    expect(accessEnabled(readEnv({}))).toBe(false);
    expect(createAccess(readEnv({}))).toBeNull(); // local development: nothing gated
    expect(accessEnabled(readEnv({ VERCEL: '1' }))).toBe(true);
    expect(accessEnabled(readEnv({ ACCESS_CONTROL: 'on' }))).toBe(true);
    expect(() => createAccess(readEnv({ VERCEL: '1' }))).toThrow(/Refusing to start/);
    expect(() => createAccess(readEnv({ VERCEL: '1', KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 't' }))).toThrow(/Refusing to start/);
    expect(() => readEnv({ ACCESS_CODE_SECRET: 'short' })).toThrow(/at least 32/);
    const a = createAccess(readEnv({ VERCEL: '1', VERCEL_ENV: 'production', KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 't', ACCESS_CODE_SECRET: SECRET }));
    expect(a?.prefix).toBe('aia:production:');
  });

  it('stores only an HMAC id and an encrypted copy; the owner can reveal the code', async () => {
    const a = newAccess();
    const code = await a.issue('reviewer-1', 'reviewer', 20);
    expect(await a.reveal('reviewer-1')).toBe(code);
    const [r] = await a.list();
    expect(r).toMatchObject({ label: 'reviewer-1', kind: 'reviewer', limit: 20, used: 0, unfinished: 0, revoked: false });
    expect(r!.id).toBe(a.codeId(code));
    expect(r!.id).not.toContain(normalizeCode(code));
    await expect(a.issue('reviewer-1', 'reviewer', 20)).rejects.toThrow(/already exists/);
    await expect(a.issue('Bad Label', 'reviewer', 20)).rejects.toThrow(/Label/);
  });

  it('logs in with a valid code, rejects forged cookies, and throttles guessing per IP', async () => {
    const a = newAccess();
    const code = await a.issue('reviewer-1', 'reviewer', 20);
    const ok = await a.login(code.toLowerCase(), '1.1.1.1');
    expect(ok).toMatchObject({ ok: true, record: { label: 'reviewer-1' } });
    const token = ok.ok ? ok.token : '';
    expect(token).not.toContain(normalizeCode(code)); // the cookie never carries the code
    expect((await a.fromToken(token))?.label).toBe('reviewer-1');
    const [id, sig] = token.split('.');
    expect(await a.fromToken(`${id}.${sig!.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))}`)).toBeNull();
    expect(await a.fromToken(`${'0'.repeat(32)}.${sig}`)).toBeNull();
    expect(await a.fromToken(undefined)).toBeNull();

    for (let i = 0; i < 10; i++) expect(await a.login(generateCode(), '2.2.2.2')).toEqual({ ok: false, reason: 'invalid' });
    expect(await a.login(code, '2.2.2.2')).toEqual({ ok: false, reason: 'throttled' }); // even the right code, from that IP
    expect((await a.login(code, '3.3.3.3')).ok).toBe(true);
  });

  it('allows exactly 20 completed questions, then refuses without charging', async () => {
    const a = newAccess();
    const id = a.codeId(await a.issue('reviewer-1', 'reviewer', 20));
    for (let i = 1; i <= 20; i++) expect(await ask(a, id)).toEqual(accepted(i));
    expect(await ask(a, id)).toEqual({ ok: false, reason: 'exhausted' });
    expect(await a.record(id)).toMatchObject({ used: 20, limit: 20 });
  });

  it('accepts one question at a time per code: a parallel burst charges once', async () => {
    const a = newAccess();
    const id = a.codeId(await a.issue('reviewer-1', 'reviewer', 20));
    const burst = await Promise.all(Array.from({ length: 10 }, () => a.reserve(id, randomUUID())));
    expect(burst.filter((r) => r.ok)).toHaveLength(1);
    expect(burst.filter((r) => !r.ok && r.reason === 'busy')).toHaveLength(9);
    expect(await a.record(id)).toMatchObject({ used: 0, unfinished: 1 }); // accepted, charged only when answered
  });

  it('never charges the last question twice under a parallel burst at 19/20', async () => {
    const a = newAccess();
    const id = a.codeId(await a.issue('reviewer-1', 'reviewer', 20));
    await a.setUsed('reviewer-1', 19);
    const qids = Array.from({ length: 10 }, () => randomUUID());
    const burst = await Promise.all(qids.map((q) => a.reserve(id, q)));
    const winner = burst.findIndex((r) => r.ok);
    await a.complete(id, qids[winner]!, false);
    expect(burst.filter((r) => r.ok)).toEqual([accepted(20)]);
    expect(await ask(a, id)).toEqual({ ok: false, reason: 'exhausted' });
  });

  it('never charges a duplicate submission of an answered question', async () => {
    const a = newAccess();
    const id = a.codeId(await a.issue('reviewer-1', 'reviewer', 20));
    const qid = randomUUID();
    expect((await ask(a, id, 'answered', qid)).ok).toBe(true);
    expect(await a.reserve(id, qid)).toEqual({ ok: false, reason: 'duplicate' });
    expect((await a.record(id))!.used).toBe(1);
  });

  it('never charges a failed question; after the unfinished-question limit, charges new questions when accepted', async () => {
    const a = newAccess();
    const id = a.codeId(await a.issue('reviewer-1', 'reviewer', 20));
    const qid = randomUUID();
    await ask(a, id, 'failed', qid);
    expect(await a.record(id)).toMatchObject({ used: 0, unfinished: 1 });
    expect(await ask(a, id, 'answered', qid)).toEqual(accepted(1)); // asking it again is charged once
    expect(await a.record(id)).toMatchObject({ used: 1, unfinished: 1 });
    for (let i = 1; i < ABANDON_CAP; i++) await ask(a, id, 'failed');
    expect(await a.record(id)).toMatchObject({ used: 1, unfinished: ABANDON_CAP });
    expect(await ask(a, id, 'failed')).toEqual(accepted(2, 20, true)); // limit reached: charged when accepted
    expect(await a.record(id)).toMatchObject({ used: 2, unfinished: ABANDON_CAP }); // and stays charged
    expect(await ask(a, id)).toEqual(accepted(3, 20, true)); // answered: not charged a second time
    expect((await a.record(id))!.used).toBe(3);
  });

  it('frees a code whose question was cancelled mid-answer (the platform stopped it: no clean-up ran)', async () => {
    let now = 0;
    const a = new AccessControl(new MemoryRedis(() => now), SECRET, 'aia:test:', () => now);
    const id = a.codeId(await a.issue('reviewer-1', 'reviewer', 20));
    expect((await a.reserve(id, randomUUID())).ok).toBe(true); // then nothing: no complete, no release
    now += 60_000;
    await a.touch(id); // it was still streaming at 60 s
    now += (LOCK_SECONDS - 1) * 1000;
    expect(await a.reserve(id, randomUUID())).toEqual({ ok: false, reason: 'busy' });
    now += 2000; // no renewal for LOCK_SECONDS: the code is free again
    expect(await ask(a, id)).toEqual(accepted(1)); // and the cancelled question was never charged
  });

  it('keeps every code independent: the owner-test code never uses reviewer questions', async () => {
    const a = newAccess();
    const reviewers = await Promise.all([1, 2, 3, 4, 5].map((n) => a.issue(`reviewer-${n}`, 'reviewer', 20)));
    const test = a.codeId(await a.issue('owner-test', 'test', 20));
    for (let i = 0; i < 20; i++) await ask(a, test);
    expect(await ask(a, test)).toEqual({ ok: false, reason: 'exhausted' });
    for (const code of reviewers) expect(await ask(a, a.codeId(code))).toEqual(accepted(1));
    expect((await a.list()).map((r) => [r.label, r.kind, r.used])).toEqual([
      ['owner-test', 'test', 20], ['reviewer-1', 'reviewer', 1], ['reviewer-2', 'reviewer', 1], ['reviewer-3', 'reviewer', 1], ['reviewer-4', 'reviewer', 1], ['reviewer-5', 'reviewer', 1],
    ]);
  });

  it('revokes immediately, grants more questions, and rotates to a fresh code', async () => {
    const a = newAccess();
    const code = await a.issue('reviewer-3', 'reviewer', 20);
    const id = a.codeId(code);
    await a.setUsed('reviewer-3', 20);
    expect((await a.grant('reviewer-3', 5)).limit).toBe(25);
    expect((await ask(a, id)).ok).toBe(true);

    await a.revoke('reviewer-3');
    expect(await ask(a, id)).toEqual({ ok: false, reason: 'revoked' });
    expect(await a.login(code, '1.1.1.1')).toEqual({ ok: false, reason: 'revoked' });

    const fresh = await a.rotate('reviewer-3');
    expect(fresh).not.toBe(code);
    expect(await ask(a, a.codeId(fresh))).toEqual(accepted(1, 25));
    expect(await a.reveal('reviewer-3')).toBe(fresh);
    expect((await a.list()).map((r) => [r.label, r.revoked])).toEqual([['reviewer-3', false], ['reviewer-3~rotated', true]]);
  });
});

describe('conversations in Redis', () => {
  const data = new DataService();

  it('continues a conversation on another instance, and keeps each code to its own history', async () => {
    const a = newAccess();
    // Two serverless instances: separate agents and SDK clients, one shared Redis
    const instance = (script: Parameters<typeof fakeClaude>[0]) => {
      const claude = fakeClaude(script);
      const agent = new ClaudeAgent(claude, data, 'claude-haiku-5-5', { sessions: a.sessions<Anthropic.MessageParam>('claude:fp:m'), evidence: a.sessions<ToolResult>('claude:fp:e') });
      return { claude, agent };
    };
    const one = instance([{ content: [use('get_long_haul_share', { airport: 'ANC' })] }, { content: [text('ANC long-haul share is shown in the card.')] }]);
    const two = instance([{ content: [text('In 2024 the share was lower.')] }, { content: [text('No earlier context.')] }]);
    const run = (agent: ClaudeAgent, sessionId: string, message: string) => agent.run({ sessionId, message }, () => undefined, new AbortController().signal);

    await run(one.agent, 'codeA:s1', 'ANC long-haul share?');
    await run(two.agent, 'codeA:s1', 'And the previous year?');
    const followUp = two.claude.requests[0]!.messages;
    expect(followUp[0]).toEqual({ role: 'user', content: 'ANC long-haul share?' });
    expect(followUp).toHaveLength(5); // question, tool_use, tool_result, answer, follow-up

    await run(two.agent, 'codeB:s1', 'And the previous year?'); // same session id, other code: nothing carried over
    expect(two.claude.requests[1]!.messages).toEqual([{ role: 'user', content: 'And the previous year?' }]);
  });

  it('stops a question that exceeds its input-token ceiling before another round', async () => {
    const claude = fakeClaude([{ content: [use('rank_airports', { region: 'New England' })], usage: { input_tokens: 90_000, cache_read_input_tokens: 40_000 } }]);
    const agent = new ClaudeAgent(claude, data, 'claude-haiku-5-5', { limits: { maxTokens: 4096, maxInputTokens: 120_000 } });
    const events: ChatEvent[] = [];
    await expect(agent.run({ sessionId: 's', message: 'x' }, (e) => events.push(e), new AbortController().signal)).rejects.toThrow(/size limit/);
    expect(claude.requests).toHaveLength(1);
    expect(claude.requests[0]!.max_tokens).toBe(4096);
  });
});

describe('codes CLI', () => {
  it('sets up 5 reviewer codes and 1 owner-test code once, and manages them by label', async () => {
    const a = newAccess();
    const out: string[] = [];
    const run = async (...args: string[]) => {
      out.length = 0;
      await runCodes(args, a, (l) => out.push(l));
      return [...out];
    };
    const setup = await run('setup');
    expect(setup.map((l) => l.split(/\s+/)[0])).toEqual(['reviewer-1', 'reviewer-2', 'reviewer-3', 'reviewer-4', 'reviewer-5', 'owner-test']);
    const codes = setup.map((l) => l.split(/\s+/)[1]!);
    expect(new Set(codes).size).toBe(6);
    codes.forEach((c) => expect(c).toMatch(/^AIA-/));
    expect((await run('setup')).every((l) => l.includes('exists'))).toBe(true); // never re-issues
    expect(await run('show', 'reviewer-2')).toEqual([codes[1]]);

    const list = await run('list');
    expect(list).toHaveLength(7);
    expect(list[1]).toMatch(/^owner-test\s+test\s+0 \/ 20\s+20\s+0\s+no\s+-$/);
    expect(list.join('\n')).not.toMatch(/AIA-/); // list never prints codes

    expect((await run('set-used', 'owner-test', '19'))[0]).toMatch(/19 \/ 20\s+1 /);
    expect((await run('grant', 'reviewer-1', '5'))[0]).toMatch(/0 \/ 25/);
    expect(await run('issue', 'reviewer-6', '--limit', '10')).toHaveLength(1);
    expect((await a.list()).find((r) => r.label === 'reviewer-6')?.limit).toBe(10);
    expect(await run('revoke', '--all')).toEqual(['Revoked: owner-test, reviewer-1, reviewer-2, reviewer-3, reviewer-4, reviewer-5, reviewer-6']);
    await expect(run('grant', 'reviewer-1', 'x')).rejects.toThrow(/whole number/);
    await expect(run('nope')).rejects.toThrow(/Unknown command/);
  });
});

describe('production agents', () => {
  const data = new DataService();
  const env = (o: Record<string, string>) => readEnv({ VERCEL: '1', ANTHROPIC_MODEL: 'claude-haiku-5-5', ...o });

  it('offers Claude only, with the production limits; Demo only on a keyless preview; nothing in a keyless production', () => {
    const a = newAccess();
    const prod = createChatAgents(data, env({ VERCEL_ENV: 'production', ANTHROPIC_API_KEY: 'test-key-not-real', GEMINI_API_KEY: 'test-key-not-real' }), a);
    expect([...prod.keys()]).toEqual(['claude']);
    expect((prod.get('claude') as unknown as { limits: unknown }).limits).toEqual({ maxTokens: 4096, maxInputTokens: 120_000 });
    expect(providerInfo(prod, true).providers.map((p) => p.id)).toEqual(['claude']);
    expect([...createChatAgents(data, env({ VERCEL_ENV: 'preview' }), a).keys()]).toEqual(['demo']);
    expect([...createChatAgents(data, env({ VERCEL_ENV: 'production' }), a).keys()]).toEqual([]);
    // Local development is unchanged: every configured provider, local limits
    const local = createChatAgents(data, readEnv({ ANTHROPIC_API_KEY: 'test-key-not-real', GEMINI_API_KEY: 'test-key-not-real' }));
    expect([...local.keys()]).toEqual(['gemini', 'claude', 'demo']);
    expect((local.get('claude') as unknown as { limits: unknown }).limits).toEqual({ maxTokens: 8192, maxInputTokens: Infinity });
  });
});
