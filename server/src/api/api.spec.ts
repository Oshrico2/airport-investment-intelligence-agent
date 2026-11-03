import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { ChatEvent } from '../../../shared/api';
import { AppModule } from '../app.module';
import { CHAT_AGENTS, type ChatAgent } from '../chat/chat-agent';
import { DataService } from '../data/data.service';
import { runTool } from '../tools/registry';

process.env.LIVE_CHECK = 'off';
process.env.CHAT_RATE_LIMIT_PER_MIN = '4';

const fakeAgent: ChatAgent = {
  provider: 'gemini',
  mode: 'ai',
  model: 'gemini-test',
  async run(input, emit) {
    emit({ type: 'status', stage: 'thinking', label: 'Understanding the question' });
    emit({ type: 'tool_call', callId: 'c1', name: 'rank_airports', args: { region: 'New England' } });
    emit({ type: 'text_delta', text: `echo: ${input.message}` });
    emit({ type: 'done', timings: { modelRounds: [1], toolsMs: 0, totalMs: 1, firstTextMs: 1 } });
  },
};

const fakeDemo: ChatAgent = {
  provider: 'demo',
  mode: 'demo',
  async run(_input, emit) {
    emit({ type: 'done', timings: { modelRounds: [], toolsMs: 0, totalMs: 1, firstTextMs: null } });
  },
};

const parseSse = (text: string): ChatEvent[] => text.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)) as ChatEvent);

describe('HTTP API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CHAT_AGENTS).useValue(new Map([['gemini', fakeAgent], ['demo', fakeDemo]])).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());
  const http = () => request(app.getHttpServer());

  it('GET /api/rankings returns the national board', async () => {
    const res = await http().get('/api/rankings').expect(200);
    expect(res.body).toMatchObject({ kind: 'ranking', nationalEligibleCount: 144, region: { id: 'us' } });
    expect(res.body.rows).toHaveLength(25);
  });

  it('GET /api/rankings filters by region and validates input', async () => {
    const ne = await http().get('/api/rankings').query({ region: 'New England' }).expect(200);
    expect(ne.body.rows).toHaveLength(7);
    expect((await http().get('/api/rankings').query({ region: 'Atlantis' }).expect(400)).body.error).toMatch(/Unknown region/);
    await http().get('/api/rankings').query({ limit: 0 }).expect(400);
    expect((await http().get('/api/rankings').query({ limit: 200 }).expect(200)).body.rows).toHaveLength(144);
  });

  it('GET /api/airports/:code returns a profile or 404', async () => {
    const bos = await http().get('/api/airports/bos').expect(200);
    expect(bos.body).toMatchObject({ kind: 'airportProfile', airport: { code: 'BOS', state: 'MA' }, ranking: { eligible: true } });
    expect((await http().get('/api/airports/ZZZ').expect(404)).body.error).toMatch(/No airport/);
  });

  it('GET /api/airports/search resolves ambiguous names', async () => {
    const res = await http().get('/api/airports/search').query({ q: 'Hartford' }).expect(200);
    expect(res.body.status).toBe('ambiguous');
    expect(res.body.matches.map((m: { code: string }) => m.code)).toEqual(expect.arrayContaining(['BDL', 'HFD']));
  });

  it('GET /api/regions and /api/methodology/:topic', async () => {
    const regions = await http().get('/api/regions').expect(200);
    expect(regions.body.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['us', 'new-england', 'territories']));
    expect((await http().get('/api/methodology/scoring').expect(200)).body.title).toMatch(/score/);
    await http().get('/api/methodology/astrology').expect(400);
  });

  it('GET /api/sources reports snapshot freshness', async () => {
    const res = await http().get('/api/sources').expect(200);
    expect(res.body).toMatchObject({ kind: 'sources', snapshotVersion: '2026-11-03', live: { state: 'not-checked' } });
  });

  it('POST /api/chat streams Server-Sent Events in order', async () => {
    const res = await http().post('/api/chat').send({ message: 'Rank New England' }).expect(200).expect('Content-Type', /text\/event-stream/);
    const events = parseSse(res.text);
    expect(events.map((e) => e.type)).toEqual(['session', 'status', 'tool_call', 'text_delta', 'done']);
    expect(events[0]).toMatchObject({ type: 'session', mode: 'ai', provider: 'gemini' }); // Claude is not configured here: falls back to Gemini
  });

  it('GET /api/chat/providers reports availability and models without keys; POST routes by provider', async () => {
    const res = await http().get('/api/chat/providers').expect(200);
    expect(res.body).toEqual({
      default: 'gemini',
      providers: [
        { id: 'claude', label: 'Claude', available: false, reason: 'Set ANTHROPIC_API_KEY in server/.env' },
        { id: 'gemini', label: 'Gemini', available: true, model: 'gemini-test' },
        { id: 'demo', label: 'Demo', available: true },
      ],
    });
    const demo = parseSse((await http().post('/api/chat').send({ message: 'hi', provider: 'demo' }).expect(200)).text);
    expect(demo[0]).toMatchObject({ type: 'session', mode: 'demo', provider: 'demo' });
    const missing = await http().post('/api/chat').send({ message: 'hi', provider: 'claude' }).expect(400);
    expect(missing.body.error).toMatch(/Claude is not configured on this server: Set ANTHROPIC_API_KEY/);
    await http().post('/api/chat').send({ message: 'hi', provider: 'gpt' }).expect(400);
  });

  it('POST /api/chat validates input and rate-limits', async () => {
    expect((await http().post('/api/chat').send({ message: '   ' }).expect(400)).body.error).toMatch(/message is empty/);
    await http().post('/api/chat').send({ message: 'x', sessionId: 'not-a-uuid' }).expect(400);
    // limit is 4 per minute; two requests were used above (rejected providers do not count)
    await http().post('/api/chat').send({ message: 'a' }).expect(200);
    await http().post('/api/chat').send({ message: 'b' }).expect(200);
    const limited = await http().post('/api/chat').send({ message: 'c' }).expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('BTS failure keeps serving the snapshot with a stale-data warning and no retry loop (N8)', async () => {
    const data = app.get(DataService);
    let calls = 0;
    await data.check(async () => { calls++; throw new Error('getaddrinfo ENOTFOUND'); });
    expect(calls).toBe(1);
    expect(data.live()).toMatchObject({ state: 'unreachable', message: expect.stringMatching(/last valid snapshot, retrieved 2026-11-03/) });
    expect((await http().get('/api/rankings').expect(200)).body.nationalEligibleCount).toBe(144);
    await data.check(async () => ({ rowsUpdatedAt: '2026-12-01T00:00:00.000Z' }));
    expect(data.live().state).toBe('newer-available');
  });
});

describe('tool registry', () => {
  const data = new DataService();
  it('validates arguments and reports unknown tools', () => {
    expect(() => runTool(data, 'rank_airports', { limit: 500 })).toThrow(/Invalid arguments for rank_airports/);
    expect(() => runTool(data, 'nope', {})).toThrow(/Unknown tool/);
    expect(() => runTool(data, 'get_long_haul_share', { airport: 'ANC', min_miles: 2750 })).toThrow(/multiple of 500/);
  });
  it('times every run', () => {
    const { result, ms } = runTool(data, 'get_long_haul_share', { airport: 'ANC' });
    expect(result.kind).toBe('longHaul');
    expect(ms).toBeLessThan(50);
  });
});
