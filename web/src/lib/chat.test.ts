import type { ChatEvent } from '../../../shared/api';
import { parseSse } from './api';
import { reduceTurn, type Turn } from './useChat';

describe('parseSse', () => {
  it('returns complete events and keeps a partial remainder', () => {
    const a: ChatEvent = { type: 'text_delta', text: 'Hello' };
    const b: ChatEvent = { type: 'status', stage: 'tools', label: 'Ranking airports' };
    const { events, rest } = parseSse(`data: ${JSON.stringify(a)}\n\ndata: ${JSON.stringify(b)}\n\ndata: {"type":"te`);
    expect(events).toEqual([a, b]);
    expect(rest).toBe('data: {"type":"te');
  });
});

describe('reduceTurn', () => {
  const base: Turn = { id: 't', question: 'q', status: 'streaming', mode: null, provider: null, steps: [{ key: 'send', label: 'Sending', state: 'active', startedAt: 0 }], tools: [], text: '', warnings: [] };
  it('builds steps with durations, tool runs, text and timings from the event stream', () => {
    let t = reduceTurn(base, { type: 'session', sessionId: 's', mode: 'ai', provider: 'claude' }, 5);
    t = reduceTurn(t, { type: 'status', stage: 'thinking', label: 'Understanding' }, 10);
    t = reduceTurn(t, { type: 'tool_call', callId: 'c1', name: 'rank_airports', args: { region: 'New England' } }, 900);
    t = reduceTurn(t, { type: 'tool_result', callId: 'c1', name: 'rank_airports', ms: 0.3, result: { kind: 'error', message: 'x' } }, 901);
    t = reduceTurn(t, { type: 'text_delta', text: 'HVN ' }, 1200);
    t = reduceTurn(t, { type: 'text_delta', text: 'leads.' }, 1300);
    t = reduceTurn(t, { type: 'done', timings: { modelRounds: [800, 400], toolsMs: 0.3, totalMs: 1310, firstTextMs: 1200 } }, 1320);
    expect(t).toMatchObject({ mode: 'ai', provider: 'claude' });
    expect(t.steps.map((s) => [s.label, s.state, s.ms])).toEqual([['Sending', 'done', 10], ['Understanding', 'done', 1310]]);
    expect(t.tools[0]).toMatchObject({ name: 'rank_airports', ms: 0.3 });
    expect(t.text).toBe('HVN leads.');
    expect(t.status).toBe('done');
    expect(t.clientMs).toBe(1320);
  });
  it('keeps an error state through done', () => {
    const t = reduceTurn(reduceTurn(base, { type: 'error', message: 'quota' }, 10), { type: 'done', timings: { modelRounds: [], toolsMs: 0, totalMs: 10, firstTextMs: null } }, 11);
    expect(t).toMatchObject({ status: 'error', error: 'quota' });
  });
});
