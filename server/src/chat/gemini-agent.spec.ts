import { ApiError, FunctionCallingConfigMode, type GenerateContentParameters, type GenerateContentResponse, type Part } from '@google/genai';
import type { ChatEvent } from '../../../shared/api';
import { DataService } from '../data/data.service';
import { DemoAgent } from './demo-agent';
import { classifyApiError, describeApiError, GeminiAgent, thinkingConfigFor, type GeminiModels } from './gemini-agent';
import { ModelBudget } from './model-budget';
import { SUGGESTIONS } from './suggestions';
import { compactForModel } from './compact';
import { runTool } from '../tools/registry';
import { functionDeclarations } from './tool-declarations';
import { toolsStatus } from './turn-recorder';

process.env.LIVE_CHECK = 'off';
const data = new DataService();

/** Scripted Gemini: each request pops the next list of streamed chunks (each chunk = parts). */
function fakeModels(script: Part[][][]): GeminiModels & { requests: GenerateContentParameters[] } {
  const requests: GenerateContentParameters[] = [];
  return {
    requests,
    async generateContentStream(params) {
      const { abortSignal: _signal, ...config } = params.config ?? {};
      requests.push(structuredClone({ ...params, config }));
      const chunks = script.shift();
      if (!chunks) throw new Error('unexpected extra model request');
      return (async function* () {
        for (const parts of chunks) yield { candidates: [{ content: { role: 'model', parts } }] } as GenerateContentResponse;
      })();
    },
  };
}

async function runAgent(agent: { run: GeminiAgent['run'] }, message: string, sessionId = 's1') {
  const events: ChatEvent[] = [];
  await agent.run({ sessionId, message }, (e) => events.push(e), new AbortController().signal);
  return events;
}

const agent = (models: GeminiModels, budgets = [new ModelBudget('gemini-2.5-flash', 100, 100)]) => new GeminiAgent(models, data, { budgets });

const call = (name: string, args: Record<string, unknown>, id?: string): Part => ({ functionCall: { name, args, ...(id ? { id } : {}) }, thoughtSignature: 'sig-abc' });

describe('GeminiAgent', () => {
  it('runs tools chosen by the model, streams the answer and preserves thought signatures', async () => {
    const models = fakeModels([
      [[call('rank_airports', { region: 'New England' }, 'c1')]],
      [[{ text: 'HVN leads New England with an overall score of ' }], [{ text: '80.3 (growth 25.21%).' }]],
    ]);
    const events = await runAgent(agent(models), 'Rank New England airports');
    expect(events.map((e) => e.type)).toEqual(['status', 'status', 'tool_call', 'tool_result', 'status', 'text_delta', 'text_delta', 'done']);
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ name: 'rank_airports', result: { kind: 'ranking', eligibleCount: 7 } });
    // second request carries the model's function call verbatim (signature included) and our functionResponse
    const second = models.requests[1]!.contents as { role: string; parts: Part[] }[];
    expect(second.at(-2)?.parts[0]).toMatchObject({ thoughtSignature: 'sig-abc', functionCall: { name: 'rank_airports' } });
    expect(second.at(-1)?.parts[0]?.functionResponse).toMatchObject({ id: 'c1', name: 'rank_airports', response: { output: { eligibleCount: 7 } } });
    expect(models.requests[0]!.config?.tools).toEqual([{ functionDeclarations: functionDeclarations() }]);
    const done = events.at(-1);
    expect(done?.type === 'done' && done.timings.modelRounds).toHaveLength(2);
    expect(events.some((e) => e.type === 'warning')).toBe(false); // every figure is grounded
  });

  it('keeps conversation history for follow-up questions', async () => {
    const models = fakeModels([
      [[call('get_airport_profile', { airport: 'BOS' })]],
      [[{ text: 'BOS is ranked.' }]],
      [[call('get_airport_profile', { airport: 'BDL' })]],
      [[{ text: 'BDL too.' }]],
    ]);
    const a = agent(models);
    await runAgent(a, 'Profile Boston', 'follow');
    await runAgent(a, 'And Hartford Bradley?', 'follow');
    const third = models.requests[2]!.contents as { role: string; parts: Part[] }[];
    expect(third[0]?.parts[0]?.text).toBe('Profile Boston');
    expect(third.at(-1)?.parts[0]?.text).toBe('And Hartford Bradley?');
  });

  it('warns when the narrative contains figures not found in tool results', async () => {
    const models = fakeModels([[[call('get_long_haul_share', { airport: 'ANC' })]], [[{ text: 'ANC long-haul share is 9.4%.' }]]]);
    const events = await runAgent(agent(models), 'ANC long-haul?');
    expect(events.find((e) => e.type === 'warning')).toMatchObject({ message: expect.stringContaining('9.4') });
  });

  it('returns tool errors to the model instead of failing the turn', async () => {
    const models = fakeModels([[[call('get_airport_profile', { airport: 'ZZZ' })]], [[{ text: 'I could not find that airport.' }]]]);
    const events = await runAgent(agent(models), 'Profile ZZZ');
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ result: { kind: 'error', message: expect.stringMatching(/No airport/) } });
    const second = models.requests[1]!.contents as { parts: Part[] }[];
    expect(second.at(-1)?.parts[0]?.functionResponse?.response).toMatchObject({ error: expect.stringMatching(/No airport/) });
  });

  it('caps the loop at 3 model rounds and forbids tools in the last one', async () => {
    const models = fakeModels([[[call('resolve_airport', { query: 'Boston' })]], [[call('resolve_airport', { query: 'Logan' })]], [[{ text: 'Done.' }]]]);
    const events = await runAgent(agent(models), 'loop');
    expect(models.requests).toHaveLength(3);
    expect(models.requests[2]!.config?.toolConfig?.functionCallingConfig?.mode).toBe(FunctionCallingConfigMode.NONE);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('turns API failures into short user-facing messages without retrying', async () => {
    let calls = 0;
    const models: GeminiModels = { async generateContentStream() { calls++; throw new ApiError({ message: 'quota', status: 429 }); } };
    await expect(runAgent(agent(models), 'hi')).rejects.toThrow(/free-tier rate limit reached for gemini-2.5-flash/);
    expect(calls).toBe(1);
    expect(describeApiError(new ApiError({ message: 'nf', status: 404 }), 'gemini-x')).toMatch(/gemini-x/);
  });

  it('uses the Gemini 2.5 thinking budget, not the Gemini 3 level', async () => {
    const models = fakeModels([[[{ text: 'Hi.' }]]]);
    await runAgent(agent(models), 'hi');
    expect(models.requests[0]!.config?.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(models.requests[0]!.model).toBe('gemini-2.5-flash');
    expect(thinkingConfigFor('gemini-3.6-flash', 'LOW' as never, 0)).toEqual({ thinkingLevel: 'LOW' });
    expect(thinkingConfigFor('other-model', 'LOW' as never, 0)).toBeUndefined();
  });
});

describe('GeminiAgent conversational continuity', () => {
  it('grounds follow-ups against earlier turns, keeps one system instruction, and resets for a new session', async () => {
    const models = fakeModels([
      [[call('get_long_haul_share', { airport: 'ANC' })]],
      [[{ text: '2.77% (1,050 of 37,966) in 2025.' }]],
      [[call('get_long_haul_share', { airport: 'ANC', year: 2024 })]],
      [[{ text: 'Up from 2.34% in 2024 (993 of 42,509) to 2.77% (1,050 of 37,966).' }]],
      [[{ text: 'Which airport do you mean?' }]],
    ]);
    const a = agent(models);
    await runAgent(a, 'ANC long-haul?', 'anc');
    const followUp = await runAgent(a, 'What changed compared with the previous year?', 'anc');
    expect(followUp.some((e) => e.type === 'warning')).toBe(false);
    await runAgent(a, 'What changed compared with the previous year?', 'fresh');
    expect(new Set(models.requests.map((r) => r.config?.systemInstruction)).size).toBe(1);
    expect(models.requests[4]!.contents).toHaveLength(1);
  });
});

describe('timeline labels', () => {
  it('name each tool once, with a count for parallel calls', () => {
    expect(toolsStatus(['get_capacity_pressure', 'get_capacity_pressure', 'compare_delays', 'compare_delays', 'compare_delays'])).toEqual({ type: 'status', stage: 'tools', label: 'Checking capacity pressure ×2 · Comparing delays ×3' });
    expect(toolsStatus(['get_long_haul_share'])).toMatchObject({ label: 'Measuring long-haul share' });
  });
});

describe('free-tier quota and fallback', () => {
  const quota429 = (perDay: boolean) =>
    new ApiError({ message: `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"${perDay ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'}"}]},{"retryDelay":"27s"}]}}`, status: 429 });

  it('parses quota kind, retry delay and free-tier markers from a 429', () => {
    expect(classifyApiError(quota429(false))).toEqual({ retryable: true, quota: 'minute', retryAfterSeconds: 27, freeTier: true });
    expect(classifyApiError(quota429(true))).toMatchObject({ quota: 'day', freeTier: true });
    expect(classifyApiError(new ApiError({ message: 'bad', status: 400 }))).toEqual({ retryable: false, freeTier: false });
  });

  it('falls back once to the second model on a 429 and says so', async () => {
    const used: string[] = [];
    const models: GeminiModels = {
      async generateContentStream(params) {
        used.push(params.model);
        if (params.model === 'gemini-2.5-flash') throw quota429(false);
        return (async function* () { yield { candidates: [{ content: { role: 'model', parts: [{ text: 'From the fallback.' }] } }] } as GenerateContentResponse; })();
      },
    };
    const primary = new ModelBudget('gemini-2.5-flash', 5, 20);
    const events = await runAgent(agent(models, [primary, new ModelBudget('gemini-2.5-flash-lite', 10, 20)]), 'hi');
    expect(used).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    expect(events.filter((e) => e.type === 'warning')).toEqual([expect.objectContaining({ message: expect.stringMatching(/fallback model gemini-2.5-flash-lite: gemini-2.5-flash returned 429 \(per-minute quota\)/) })]);
    expect(events.at(-1)).toMatchObject({ type: 'done', timings: { models: ['gemini-2.5-flash-lite'] } });
    expect(primary.tryTake()).toBe(false); // blocked for the advised 27 s; the next turn goes straight to the fallback
  });

  it('falls back when the primary sends nothing within the first-chunk timeout, then cools it down', async () => {
    const used: string[] = [];
    const models: GeminiModels = {
      async generateContentStream(params) {
        used.push(params.model);
        if (params.model === 'gemini-3.8-flash') {
          const signal = params.config?.abortSignal;
          return (async function* () {
            await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
            yield {} as GenerateContentResponse;
          })();
        }
        return (async function* () { yield { candidates: [{ content: { role: 'model', parts: [{ text: 'Lite answer.' }] } }] } as GenerateContentResponse; })();
      },
    };
    const a = new GeminiAgent(models, data, { budgets: [new ModelBudget('gemini-3.8-flash', 5, 20), new ModelBudget('gemini-3.5-flash-lite', 10, 20)], firstChunkTimeoutMs: 30 });
    const events = await runAgent(a, 'hi');
    expect(events.find((e) => e.type === 'text_delta')).toMatchObject({ text: 'Lite answer.' });
    expect(events.find((e) => e.type === 'warning')).toMatchObject({ message: expect.stringMatching(/gemini-3.8-flash sent nothing within 0.03 s/) });
    await runAgent(a, 'again');
    expect(used).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']); // primary cooling down
  });

  it('gives each model its own first-reply window, shows a slow notice, and names both models when both stall', async () => {
    const used: { model: string; ms: number }[] = [];
    const t0 = Date.now();
    const models: GeminiModels = {
      async generateContentStream(params) {
        used.push({ model: params.model, ms: Date.now() - t0 });
        const signal = params.config?.abortSignal;
        return (async function* () {
          await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
          yield {} as GenerateContentResponse;
        })();
      },
    };
    const a = new GeminiAgent(models, data, { budgets: [new ModelBudget('gemini-3.5-flash-lite', 10, 20), new ModelBudget('gemini-3.8-flash', 5, 20)], firstChunkTimeoutMs: 120, fallbackFirstChunkTimeoutMs: 40 });
    const events: ChatEvent[] = [];
    await expect(a.run({ sessionId: 's', message: 'hi' }, (e) => events.push(e), new AbortController().signal)).rejects.toThrow(
      /overloaded right now: gemini-3.5-flash-lite sent nothing within 0.12 s; gemini-3.8-flash sent nothing within 0.04 s/,
    );
    expect(used.map((u) => u.model)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
    expect(used[1]!.ms).toBeGreaterThanOrEqual(110); // the primary got its full (longer) window first
    expect(events.some((e) => e.type === 'status' && /responding slowly \(Google-side\)/.test(e.label))).toBe(true);
  });

  it('a slow but working primary answers within its window instead of falling back', async () => {
    const used: string[] = [];
    const models: GeminiModels = {
      async generateContentStream(params) {
        used.push(params.model);
        return (async function* () {
          await new Promise((r) => setTimeout(r, 60)); // slower than the fallback window, inside the primary window
          yield { candidates: [{ content: { role: 'model', parts: [{ text: 'Slow but fine.' }] } }] } as GenerateContentResponse;
        })();
      },
    };
    const a = new GeminiAgent(models, data, { budgets: [new ModelBudget('gemini-3.5-flash-lite', 10, 20), new ModelBudget('gemini-3.8-flash', 5, 20)], firstChunkTimeoutMs: 200, fallbackFirstChunkTimeoutMs: 40 });
    const events = await runAgent(a, 'hi');
    expect(used).toEqual(['gemini-3.5-flash-lite']);
    expect(events.find((e) => e.type === 'text_delta')).toMatchObject({ text: 'Slow but fine.' });
    expect(events.some((e) => e.type === 'warning')).toBe(false);
  });

  it('skips a model whose local budget is spent without calling it', async () => {
    const used: string[] = [];
    const models: GeminiModels = {
      async generateContentStream(params) {
        used.push(params.model);
        return (async function* () { yield { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }] } as GenerateContentResponse; })();
      },
    };
    const spent = new ModelBudget('gemini-2.5-flash', 5, 1);
    spent.tryTake();
    await runAgent(agent(models, [spent, new ModelBudget('gemini-2.5-flash-lite', 10, 20)]), 'hi');
    expect(used).toEqual(['gemini-2.5-flash-lite']);
  });

  it('stops with a clear message when both quotas are used up (no pooling, no loops)', async () => {
    let calls = 0;
    const models: GeminiModels = { async generateContentStream() { calls++; throw quota429(true); } };
    const a = agent(models, [new ModelBudget('gemini-2.5-flash', 5, 20), new ModelBudget('gemini-2.5-flash-lite', 10, 20)]);
    await expect(runAgent(a, 'hi')).rejects.toThrow(/daily free-tier quota for gemini-2.5-flash-lite/);
    expect(calls).toBe(2);
    await expect(runAgent(a, 'again')).rejects.toThrow(/quota is used up for now/);
    expect(calls).toBe(2); // both marked exhausted for the day: no further requests
  });
});

describe('DemoAgent (optional fallback)', () => {
  const demo = new DemoAgent(data); // pacing off

  it('paces its answer through labelled Demo steps and streams the template in word groups (U3)', async () => {
    const question = SUGGESTIONS.find((s) => s.id === 'anc-long-haul')!.question;
    const t0 = performance.now();
    const events = await runAgent(new DemoAgent(data, 300), question);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(250);
    const statuses = events.filter((e) => e.type === 'status').map((e) => (e as { label: string }).label);
    expect(statuses).toEqual(['Demo mode: matching a listed analysis', 'Demo mode: running the fixed analysis for this question', 'Demo mode: filling in the template summary']);
    expect(statuses.every((l) => l.startsWith('Demo mode'))).toBe(true); // never presented as AI
    const deltas = events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text);
    expect(deltas.length).toBeGreaterThan(3);
    const paced = deltas.join('');
    const instant = (await runAgent(demo, question)).find((e) => e.type === 'text_delta') as { text: string };
    expect(paced).toBe(instant.text); // same template, same figures, only delivered gradually
    expect(events.indexOf(events.find((e) => e.type === 'tool_result')!)).toBeLessThan(events.indexOf(events.find((e) => e.type === 'text_delta')!)); // cards before text
    expect(events.at(-1)).toMatchObject({ type: 'done', timings: { modelRounds: [], firstTextMs: null } });
  });

  it('stops a paced answer as soon as the client aborts', async () => {
    const abort = new AbortController();
    const events: ChatEvent[] = [];
    const run = new DemoAgent(data, 2000).run({ sessionId: 's', message: 'anc-long-haul' }, (e) => events.push(e), abort.signal);
    setTimeout(() => abort.abort(), 50);
    const t0 = performance.now();
    await run;
    expect(performance.now() - t0).toBeLessThan(500);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('answers a listed question with its fixed tool plan and labels itself', async () => {
    const events = await runAgent(demo, SUGGESTIONS.find((s) => s.id === 'anc-long-haul')!.question);
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ result: { kind: 'longHaul', longHaulSharePercent: 2.77 } });
    expect(events.find((e) => e.type === 'text_delta')).toMatchObject({ text: expect.stringMatching(/^Demo mode summary \(template, no AI\): 2\.77%/) });
  });
  it('does not pretend to understand free text', async () => {
    const events = await runAgent(demo, 'what about Denver?');
    expect(events.find((e) => e.type === 'text_delta')).toMatchObject({ text: expect.stringMatching(/answers only the listed questions/) });
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
  });
});

describe('compactForModel', () => {
  it('keeps the values but drops IDs, monthly series and timestamps', () => {
    const { result } = runTool(data, 'get_airport_profile', { airport: 'BOS' });
    const compact = JSON.stringify(compactForModel(result));
    expect(compact.length).toBeLessThan(JSON.stringify(result).length * 0.6);
    expect(compact).toContain('21143295');
    expect(compact).not.toContain('"monthly"');
    expect(compact).not.toContain('retrievedAt');
  });
});

describe('function declarations', () => {
  it('are plain JSON Schema objects derived from the zod schemas', () => {
    const decls = functionDeclarations();
    expect(decls.map((d) => d.name)).toContain('compare_delays');
    for (const d of decls) {
      expect(d.parametersJsonSchema).toMatchObject({ type: 'object' });
      expect(JSON.stringify(d.parametersJsonSchema)).not.toContain('$schema');
    }
  });
});

describe('googleMessage', () => {
  it('extracts the innermost message from nested escaped JSON', () => {
    const raw = '{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 404,\\n    \\"message\\": \\"This model models/gemini-2.5-flash is no longer available to new users.\\",\\n    \\"status\\": \\"NOT_FOUND\\"\\n  }\\n}\\n","code":404,"status":"Not Found"}}';
    expect(describeApiError(new ApiError({ message: raw, status: 404 }), 'gemini-2.5-flash')).toMatch(/no longer available to new users/);
  });
});
