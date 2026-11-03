import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { ChatEvent } from '../../../shared/api';
import { AppModule } from '../app.module';
import { CHAT_AGENTS, type ChatAgent } from '../chat/chat-agent';
import { AccessControl, exhaustedMessage } from './access';
import { ACCESS } from './access.controller';
import { MemoryRedis } from './redis';

process.env.LIVE_CHECK = 'off';
process.env.CHAT_RATE_LIMIT_PER_MIN = '1000'; // the in-memory per-IP limiter is not what these tests measure

/** A Claude stand-in: answers, fails, or waits until the client goes away, as each test asks. */
let behaviour: 'answer' | 'fail' | 'hang' = 'answer';
let runs = 0;
const fakeClaude: ChatAgent = {
  provider: 'claude',
  mode: 'ai',
  model: 'claude-test',
  async run(_input, emit, signal) {
    runs++;
    if (behaviour === 'fail') throw new Error('Claude is overloaded right now.');
    if (behaviour === 'hang') {
      await new Promise((resolve) => (signal.aborted ? resolve(null) : signal.addEventListener('abort', resolve)));
      return;
    }
    emit({ type: 'text_delta', text: 'answer' });
    emit({ type: 'done', timings: { modelRounds: [1], toolsMs: 0, totalMs: 1, firstTextMs: 1 } });
  },
};

const events = (text: string): ChatEvent[] => text.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)) as ChatEvent);

describe('production access over HTTP', () => {
  let app: INestApplication;
  let access: AccessControl;
  let reviewer: string;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const used = async () => (await access.list()).find((r) => r.label === 'reviewer-1')!.used;
  const chat = (questionId: string = randomUUID(), c = cookie) => http().post('/api/chat').set('Cookie', c).send({ message: 'Rank New England airports', questionId });

  beforeAll(async () => {
    access = new AccessControl(new MemoryRedis(), 'test-secret-that-is-long-enough-0123456789', 'aia:test:');
    reviewer = await access.issue('reviewer-1', 'reviewer', 20);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ACCESS).useValue(access).overrideProvider(CHAT_AGENTS).useValue(new Map([['claude', fakeClaude]])).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    behaviour = 'answer';
  });

  it('requires a code for the whole API, except health and the access check', async () => {
    await http().get('/api/health').expect(200);
    expect((await http().get('/api/access').expect(200)).body).toEqual({ required: true, granted: false });
    expect((await http().get('/api/rankings').expect(401)).body).toMatchObject({ code: 'access_required' });
    expect((await http().get('/api/chat/providers').expect(401)).body.code).toBe('access_required');
    expect((await http().post('/api/chat').send({ message: 'hi', questionId: randomUUID() }).expect(401)).body.code).toBe('access_required');
    await http().get('/api/rankings').set('Cookie', 'aia_access=forged.token').expect(401);
    expect(runs).toBe(0);
  });

  it('rejects a wrong code and grants a right one with an HttpOnly cookie that does not carry the code', async () => {
    expect((await http().post('/api/access').send({ code: 'AIA-0000-0000-0000-0000' }).expect(401)).body).toMatchObject({ code: 'access_required', error: expect.stringMatching(/not valid/) });
    const res = await http().post('/api/access').send({ code: reviewer }).expect(201);
    expect(res.body).toEqual({ required: true, granted: true, used: 0, limit: 20, remaining: 20 });
    const set = res.headers['set-cookie']![0]!;
    expect(set).toMatch(/^aia_access=[0-9a-f]{32}\.[\w-]+; Path=\/api; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);
    expect(set).not.toContain(reviewer.replace(/-/g, '').slice(3));
    cookie = set.split(';')[0]!;
    expect((await http().get('/api/access').set('Cookie', cookie).expect(200)).body.remaining).toBe(20);
    await http().get('/api/rankings').set('Cookie', cookie).expect(200);
  });

  it('offers Claude only, and needs a questionId per question', async () => {
    expect((await http().get('/api/chat/providers').set('Cookie', cookie).expect(200)).body).toEqual({ providers: [{ id: 'claude', label: 'Claude', available: true, model: 'claude-test' }], default: 'claude' });
    await http().post('/api/chat').set('Cookie', cookie).send({ message: 'hi' }).expect(400);
    await http().post('/api/chat').set('Cookie', cookie).send({ message: 'hi', questionId: randomUUID(), provider: 'gemini' }).expect(400);
  });

  it('does not charge a question the model failed to answer, and never charges a duplicate', async () => {
    behaviour = 'fail';
    const failed = events((await chat().expect(200)).text);
    expect(failed.map((e) => e.type)).toEqual(['session', 'error']);
    expect(await used()).toBe(0);

    behaviour = 'answer';
    const qid = randomUUID();
    expect(events((await chat(qid).expect(200)).text)[0]).toMatchObject({ type: 'session', quota: { used: 1, limit: 20 } });
    expect((await chat(qid).expect(409)).body).toMatchObject({ code: 'duplicate_question' });
    expect(await used()).toBe(1);
  });

  it('does not charge a question the client left mid-answer (Stop, refresh), and frees the code', async () => {
    behaviour = 'hang';
    const server = app.getHttpServer().listen(0);
    const port = (server.address() as AddressInfo).port;
    const abort = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ message: 'x', questionId: randomUUID() }), signal: abort.signal });
    expect(res.status).toBe(200);
    expect(await used()).toBe(1); // accepted, not charged while it runs
    abort.abort();
    await new Promise((r) => setTimeout(r, 100));
    server.close();
    expect(await used()).toBe(1);
    behaviour = 'answer';
    expect((await chat().expect(200)).status).toBe(200); // and the code is not left locked
    expect(await used()).toBe(2);
  });

  it('runs one question at a time per code: a parallel burst is charged once', async () => {
    behaviour = 'hang';
    const server = app.getHttpServer().listen(0);
    const port = (server.address() as AddressInfo).port;
    const abort = new AbortController();
    const post = () => fetch(`http://127.0.0.1:${port}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ message: 'x', questionId: randomUUID() }), signal: abort.signal });
    const first = await post();
    const rest = await Promise.all([post(), post(), post(), post()]);
    expect(first.status).toBe(200);
    expect(rest.map((r) => r.status)).toEqual([409, 409, 409, 409]);
    expect(((await rest[0]!.json()) as { code: string }).code).toBe('question_running');
    abort.abort();
    await new Promise((r) => setTimeout(r, 100));
    server.close();
  });

  it('allows exactly 20 answered questions, then shows the friendly message without calling the model', async () => {
    await access.setUsed('reviewer-1', 0);
    const before = runs;
    for (let i = 1; i <= 20; i++) expect(events((await chat().expect(200)).text)[0]).toMatchObject({ quota: { used: i, limit: 20 } });
    const res = await chat().expect(403);
    expect(res.body).toEqual({ code: 'quota_exhausted', error: exhaustedMessage(20) });
    expect(res.body.error).toBe('You have used all 20 questions for this access code. Please contact the developer for additional access.');
    expect(runs - before).toBe(20);
    expect((await http().get('/api/access').set('Cookie', cookie).expect(200)).body).toEqual({ required: true, granted: true, used: 20, limit: 20, remaining: 0, message: exhaustedMessage(20) });
    expect(exhaustedMessage(20, 'reviews@example.com')).toMatch(/additional access \(reviews@example\.com\)\.$/);
  });

  it('a new session or browser does not reset the quota, and revoking takes effect on the next request', async () => {
    const again = (await http().post('/api/access').send({ code: reviewer }).expect(201)).headers['set-cookie']![0]!.split(';')[0]!;
    expect((await chat(randomUUID(), again).expect(403)).body.code).toBe('quota_exhausted');
    await access.revoke('reviewer-1');
    expect((await http().get('/api/rankings').set('Cookie', cookie).expect(403)).body.code).toBe('access_revoked');
    expect((await http().post('/api/access').send({ code: reviewer }).expect(403)).body.code).toBe('access_revoked');
    expect((await http().get('/api/access').set('Cookie', cookie).expect(200)).body).toEqual({ required: true, granted: false });
  });

  it('signs out by clearing the cookie', async () => {
    expect((await http().delete('/api/access').expect(200)).headers['set-cookie']![0]).toMatch(/^aia_access=; .*Max-Age=0$/);
  });
});

describe('production wiring (real agent factory)', () => {
  let app: INestApplication;
  const saved = { ...process.env };
  afterAll(async () => {
    await app.close();
    process.env = saved;
  });

  it('offers Claude only, never Gemini or Demo, with no setup hints for the providers it hides', async () => {
    Object.assign(process.env, { ANTHROPIC_API_KEY: 'test-key-not-real', GEMINI_API_KEY: 'test-key-not-real', VERCEL_ENV: 'production' });
    const access = new AccessControl(new MemoryRedis(), 'test-secret-that-is-long-enough-0123456789', 'aia:test:');
    const code = await access.issue('owner-test', 'test', 20);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ACCESS).useValue(access).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    const login = await request(app.getHttpServer()).post('/api/access').send({ code }).expect(201);
    const res = await request(app.getHttpServer()).get('/api/chat/providers').set('Cookie', login.headers['set-cookie']![0]!.split(';')[0]!).expect(200);
    expect(res.body).toEqual({ providers: [{ id: 'claude', label: 'Claude', available: true, model: 'claude-haiku-5-5' }], default: 'claude' });
  });
});
