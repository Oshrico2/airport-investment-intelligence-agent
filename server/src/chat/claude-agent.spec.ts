import Anthropic from '@anthropic-ai/sdk';
import type { ChatEvent } from '../../../shared/api';
import { DataService } from '../data/data.service';
import { fakeClaude, text, use } from '../testing/fake-claude';
import { ClaudeAgent, describeClaudeError, withoutThinking } from './claude-agent';
import { claudeTools } from './tool-declarations';

process.env.LIVE_CHECK = 'off';
const data = new DataService();
const MODEL = 'claude-haiku-5-5';

async function runAgent(agent: ClaudeAgent, message: string, sessionId = 's1', signal = new AbortController().signal) {
  const events: ChatEvent[] = [];
  await agent.run({ sessionId, message }, (e) => events.push(e), signal);
  return events;
}

const headers = (h: Record<string, string> = {}) => new Headers(h);
const body = (type: string, message: string) => ({ type: 'error', error: { type, message } });

describe('ClaudeAgent', () => {
  it('runs the tools Claude chooses, streams the answer and sends tool_result blocks back', async () => {
    const claude = fakeClaude([
      { content: [use('rank_airports', { region: 'New England' })] },
      { content: [text('HVN leads New England with an overall score of 80.3 (growth 25.21%).')] },
    ]);
    const events = await runAgent(new ClaudeAgent(claude, data, MODEL), 'Rank New England airports');
    expect(events.map((e) => e.type)).toEqual(['status', 'status', 'tool_call', 'tool_result', 'status', 'text_delta', 'text_delta', 'done']);
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ callId: 'toolu_rank_airports', result: { kind: 'ranking', eligibleCount: 7 } });

    const [first, second] = claude.requests;
    expect(first).toMatchObject({ model: MODEL, tool_choice: { type: 'auto' }, tools: claudeTools(), system: expect.stringContaining('BTS'), cache_control: { type: 'ephemeral' } });
    const msgs = second!.messages;
    expect(msgs.at(-2)).toEqual({ role: 'assistant', content: [use('rank_airports', { region: 'New England' })] }); // verbatim
    const result = (msgs.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_rank_airports' });
    expect(JSON.parse(result.content as string)).toMatchObject({ eligibleCount: 7 });

    expect(events.at(-1)).toMatchObject({ type: 'done', timings: { models: [MODEL, MODEL], modelRounds: [expect.any(Number), expect.any(Number)], firstTextMs: expect.any(Number) } });
    expect(events.some((e) => e.type === 'warning')).toBe(false); // every figure is grounded
  });

  it('returns all results of parallel tool calls in one user message', async () => {
    const claude = fakeClaude([
      { content: [text('Checking both.'), use('compare_delays', { airports: ['LAX', 'SNA'], period: '2026-ytd' }, 'a'), use('compare_delays', { airports: ['LAX', 'SNA'], period: '2025-same-months' }, 'b')] },
      { content: [text('Done.')] },
    ]);
    await runAgent(new ClaudeAgent(claude, data, MODEL), 'LAX vs SNA delays recently');
    const results = claude.requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['a', 'b']);
  });

  it('returns invalid or failing tool calls to Claude as is_error results instead of failing the turn', async () => {
    const claude = fakeClaude([{ content: [use('get_airport_profile', { airport: 'ZZZ' }, 'x'), use('get_airport_profile', { airport: 42 }, 'y')] }, { content: [text('I could not find that airport.')] }]);
    const events = await runAgent(new ClaudeAgent(claude, data, MODEL), 'Profile ZZZ');
    expect(events.filter((e) => e.type === 'tool_result')).toEqual([
      expect.objectContaining({ result: { kind: 'error', message: expect.stringMatching(/No airport/) } }),
      expect.objectContaining({ result: { kind: 'error', message: expect.stringMatching(/Invalid arguments/) } }),
    ]);
    expect(claude.requests[1]!.messages.at(-1)!.content).toEqual([
      expect.objectContaining({ tool_use_id: 'x', is_error: true }),
      expect.objectContaining({ tool_use_id: 'y', is_error: true }),
    ]);
  });

  it('caps the loop at 3 rounds and forbids tools in the last one', async () => {
    const claude = fakeClaude([{ content: [use('resolve_airport', { query: 'Boston' }, 'r1')] }, { content: [use('resolve_airport', { query: 'Logan' }, 'r2')] }, { content: [text('Done.')] }]);
    const events = await runAgent(new ClaudeAgent(claude, data, MODEL), 'loop');
    expect(claude.requests.map((r) => r.tool_choice)).toEqual([{ type: 'auto' }, { type: 'auto' }, { type: 'none' }]);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('keeps conversation history, including tool exchanges, for follow-up questions', async () => {
    const claude = fakeClaude([
      { content: [use('get_airport_profile', { airport: 'BOS' })] },
      { content: [text('BOS is ranked.')] },
      { content: [text('Compared with BOS, BDL is smaller.')] },
    ]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    await runAgent(agent, 'Profile Boston', 'follow');
    await runAgent(agent, 'And Hartford Bradley?', 'follow');
    const third = claude.requests[2]!.messages;
    expect(third.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(third[0]).toEqual({ role: 'user', content: 'Profile Boston' });
    expect(third.at(-1)).toEqual({ role: 'user', content: 'And Hartford Bradley?' });
  });

  it('warns when the narrative contains figures not found in tool results', async () => {
    const claude = fakeClaude([{ content: [use('get_long_haul_share', { airport: 'ANC' })] }, { content: [text('ANC long-haul share is 9.4%.')] }]);
    const events = await runAgent(new ClaudeAgent(claude, data, MODEL), 'ANC long-haul?');
    expect(events.find((e) => e.type === 'warning')).toMatchObject({ message: expect.stringContaining('9.4') });
  });

  it('on a refusal runs no tools, warns, and keeps the turn out of the history', async () => {
    const claude = fakeClaude([{ content: [use('rank_airports', {})], stop_reason: 'refusal' }, { content: [text('Hello.')] }]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    const events = await runAgent(agent, 'something off-topic', 'r');
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
    expect(events.find((e) => e.type === 'warning')).toMatchObject({ message: expect.stringMatching(/declined/) });
    expect(events.at(-1)?.type).toBe('done');
    await runAgent(agent, 'hi', 'r');
    expect(claude.requests[1]!.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('does not run a tool call cut off by max_tokens', async () => {
    const claude = fakeClaude([{ content: [use('rank_airports', { region: 'New' })], stop_reason: 'max_tokens' }]);
    const events: ChatEvent[] = [];
    await expect(new ClaudeAgent(claude, data, MODEL).run({ sessionId: 's', message: 'x' }, (e) => events.push(e), new AbortController().signal)).rejects.toThrow(/cut off/);
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
  });

  it('turns API failures into short messages, makes one request, and stores nothing', async () => {
    const claude = fakeClaude([new Anthropic.RateLimitError(429, body('rate_limit_error', 'Number of requests has exceeded your rate limit'), undefined, headers({ 'retry-after': '12' })), { content: [text('ok')] }]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    await expect(runAgent(agent, 'hi', 'e')).rejects.toThrow(/rate limit reached for claude-haiku-5-5; retry in about 12 s/);
    expect(claude.requests).toHaveLength(1);
    await runAgent(agent, 'again', 'e');
    expect(claude.requests[1]!.messages).toEqual([{ role: 'user', content: 'again' }]);
  });

  it('stops quietly when the client aborts', async () => {
    const abort = new AbortController();
    abort.abort();
    const events = await runAgent(new ClaudeAgent(fakeClaude([{ content: [text('never')] }]), data, MODEL), 'hi', 's', abort.signal);
    expect(events.map((e) => e.type)).toEqual(['status']);
  });
});

describe('conversational continuity (acceptance review F2 and reset check)', () => {
  const warnings = (events: ChatEvent[]) => events.filter((e) => e.type === 'warning').map((e) => (e as { message: string }).message);

  it('grounds a follow-up against the tool results of earlier turns, so carried-over figures raise no warning', async () => {
    const claude = fakeClaude([
      { content: [use('get_long_haul_share', { airport: 'ANC' })] },
      { content: [text("2.77% of ANC's 2025 passenger departures (1,050 of 37,966) were long-haul; 31.03% with cargo.")] },
      { content: [use('get_long_haul_share', { airport: 'ANC', year: 2024 })] },
      // the live F2 answer: 2024 figures from this turn, 2025 figures carried over from the previous turn
      { content: [text('The share rose from 2.34% in 2024 (993 of 42,509) to 2.77% in 2025 (1,050 of 37,966). ATL passengers rose from 18,827 to 25,834; with cargo the share went from 29.88% to 31.03%, cargo-only departures 51,145 to 49,820.')] },
    ]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    expect(warnings(await runAgent(agent, "What percentage of ANC's departing flights are long-haul?", 'anc'))).toEqual([]);
    const followUp = await runAgent(agent, 'What changed compared with the previous year?', 'anc');
    expect(followUp.find((e) => e.type === 'tool_call')).toMatchObject({ name: 'get_long_haul_share', args: { airport: 'ANC', year: 2024 } });
    expect(warnings(followUp)).toEqual([]);
  });

  it('accepts approximate wording backed by the real SFO tool result, and still flags an invented figure', async () => {
    const claude = fakeClaude([
      { content: [use('get_capacity_pressure', { airport: 'SFO' })] },
      { content: [text('Load factors stayed in the low 80s (82.1% in 2019, 83.2% in 2024, 82.3% in 2025), with a June 2025 peak in the high 80s (89.4%).')] },
      { content: [use('get_capacity_pressure', { airport: 'SFO' })] },
      { content: [text('Load factors stayed in the low 80s, peaking at 93.5%.')] },
    ]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    expect(warnings(await runAgent(agent, 'Is there unmet flight demand at SFO?', 'sfo'))).toEqual([]);
    expect(warnings(await runAgent(agent, 'Is there unmet flight demand at SFO?', 'sfo2'))).toEqual([expect.stringMatching(/: 93\.5\./)]);
  });

  it('still flags figures that no tool result of the conversation supports', async () => {
    const claude = fakeClaude([
      { content: [use('get_long_haul_share', { airport: 'ANC' })] },
      { content: [text('2.77% (1,050 of 37,966).')] },
      { content: [text('In 2024 it was 9.4%, from 2.77% now.')] },
    ]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    await runAgent(agent, 'ANC long-haul?', 'anc');
    expect(warnings(await runAgent(agent, 'And before?', 'anc'))).toEqual([expect.stringMatching(/^Some figures .* this conversation: 9\.4\./)]);
  });

  it('a new conversation starts with no history and no earlier evidence', async () => {
    const claude = fakeClaude([
      { content: [use('get_capacity_pressure', { airport: 'SFO' })] },
      { content: [text('SFO load factor was 82.3% in 2025.')] },
      // reset: the same implicit question in a new session; the model asks instead of guessing (no tools)
      { content: [text('Which airport, region or measure do you want to compare with the previous year? For example: "How did SFO passengers change vs 2024?"')] },
      // and a figure from the old conversation is not grounded in the new one
      { content: [text('Its load factor was 82.3%.')] },
    ]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    await runAgent(agent, 'Is there unmet flight demand at SFO?', 'old');

    const reset = await runAgent(agent, 'What changed compared with the previous year?', 'new');
    expect(claude.requests[2]!.messages).toEqual([{ role: 'user', content: 'What changed compared with the previous year?' }]);
    expect(reset.some((e) => e.type === 'tool_call')).toBe(false);
    expect(warnings(reset)).toEqual([]);

    expect(warnings(await runAgent(agent, 'And its load factor?', 'new2'))).toEqual([expect.stringContaining('82.3')]);
  });

  // Live regression (final QA): a system prompt that differed on the first message made Claude reject every
  // follow-up with HTTP 400, because thinking blocks are bound to the exact system + tools + earlier messages.
  it('sends a byte-identical system prompt and tool list on every request of a conversation', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig-1' } as Anthropic.ThinkingBlock;
    const claude = fakeClaude([
      { content: [thinking, use('get_long_haul_share', { airport: 'ANC' })] },
      { content: [text('2.77% (1,050 of 37,966).')] },
      { content: [use('get_long_haul_share', { airport: 'ANC', year: 2024 })] },
      { content: [text('2.34% in 2024.')] },
    ]);
    const agent = new ClaudeAgent(claude, data, MODEL);
    await runAgent(agent, 'ANC long-haul?', 'c');
    await runAgent(agent, 'What changed compared with the previous year?', 'c');
    expect(new Set(claude.requests.map((r) => JSON.stringify([r.system, r.tools]))).size).toBe(1);
    expect(claude.requests[2]!.messages[1]).toEqual({ role: 'assistant', content: [thinking, use('get_long_haul_share', { airport: 'ANC' })] }); // replayed verbatim
  });

  it('once the 8-turn window drops old turns, replays the retained history without thinking blocks', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' } as Anthropic.ThinkingBlock;
    const claude = fakeClaude(Array.from({ length: 10 }, (_, i) => ({ content: [thinking, text(`Answer ${i + 1}.`)] })));
    const agent = new ClaudeAgent(claude, data, MODEL);
    for (let i = 1; i <= 10; i++) await runAgent(agent, `Question ${i}`, 'long');
    const blocks = (n: number) => claude.requests[n]!.messages.flatMap((m) => (typeof m.content === 'string' ? [] : m.content.map((b) => b.type)));
    expect(blocks(8)).toContain('thinking'); // turn 9: the window still starts at question 1
    expect(claude.requests[8]!.messages[0]).toEqual({ role: 'user', content: 'Question 1' });
    expect(claude.requests[9]!.messages[0]).toEqual({ role: 'user', content: 'Question 2' }); // turn 10: question 1 dropped
    expect(blocks(9)).not.toContain('thinking');
    expect(withoutThinking([{ role: 'assistant', content: [thinking] }, { role: 'user', content: 'q' }])).toEqual([{ role: 'user', content: 'q' }]);
  });
});

describe('describeClaudeError', () => {
  it('maps each SDK error class to an actionable message without leaking the key', () => {
    expect(describeClaudeError(new Anthropic.AuthenticationError(401, body('authentication_error', 'invalid x-api-key'), undefined, headers()), MODEL)).toMatch(/Check ANTHROPIC_API_KEY/);
    expect(describeClaudeError(new Anthropic.NotFoundError(404, body('not_found_error', 'model: nope'), undefined, headers()), 'nope')).toMatch(/"nope" is not available.*ANTHROPIC_MODEL/);
    expect(describeClaudeError(new Anthropic.RateLimitError(429, body('rate_limit_error', 'slow down'), undefined, headers()), MODEL)).toMatch(/wait a minute/);
    expect(describeClaudeError(new Anthropic.InternalServerError(529, body('overloaded_error', 'Overloaded'), undefined, headers(), 'overloaded_error'), MODEL)).toMatch(/overloaded right now.*switch to Gemini/);
    expect(describeClaudeError(new Anthropic.InternalServerError(500, body('api_error', 'boom'), undefined, headers()), MODEL)).toMatch(/temporarily unavailable/);
    expect(describeClaudeError(new Anthropic.BadRequestError(400, body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'), undefined, headers()), MODEL)).toMatch(/credit balance is too low/);
    expect(describeClaudeError(new Anthropic.APIConnectionError({ message: 'fetch failed' }), MODEL)).toMatch(/Could not reach the Anthropic API/);
    expect(describeClaudeError(new Anthropic.PermissionDeniedError(403, body('permission_error', 'key sk-ant-api03-SECRET not allowed'), undefined, headers()), MODEL)).not.toContain('SECRET');
  });
});

describe('Claude tool definitions', () => {
  it('are JSON Schema objects derived from the zod schemas, one per registry tool', () => {
    const tools = claudeTools();
    expect(tools).toHaveLength(9);
    for (const t of tools) {
      expect(t.input_schema).toMatchObject({ type: 'object' });
      expect(JSON.stringify(t)).not.toContain('$schema');
      expect(t.description).toBeTruthy();
    }
  });
});
