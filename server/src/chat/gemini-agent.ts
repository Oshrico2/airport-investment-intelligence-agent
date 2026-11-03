import { ApiError, FunctionCallingConfigMode, ThinkingLevel, type Content, type GenerateContentParameters, type GenerateContentResponse, type Part, type ThinkingConfig } from '@google/genai';
import { Logger } from '@nestjs/common';
import type { ChatEvent, ToolResult } from '../../../shared/api';
import type { ToolContext } from '../tools/registry';
import type { ChatAgent, ChatTurnInput } from './chat-agent';
import { ModelBudget } from './model-budget';
import { MemorySessionStore, type SessionStore } from './sessions';
import { systemInstruction } from './system-prompt';
import { functionDeclarations } from './tool-declarations';
import { MAX_ROUNDS, roundStatus, SLOW_NOTICE_MS, toolsStatus, TurnRecorder } from './turn-recorder';

/** The slice of the SDK the agent uses; tests substitute a scripted fake. */
export interface GeminiModels {
  generateContentStream(params: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
}

export interface GeminiAgentOptions {
  /** Ordered: primary first, then the fallback. Each carries its own free-tier quota guard (never pooled). */
  budgets: ModelBudget[];
  thinkingLevel?: ThinkingLevel;
  thinkingBudget?: number;
  /** Abandon the primary attempt (and fall back) when no chunk arrives within this time. */
  firstChunkTimeoutMs?: number;
  /** Same for the fallback model (shorter: when it is overloaded, fail fast). */
  fallbackFirstChunkTimeoutMs?: number;
}

const COOL_DOWN_SECONDS = 60; // after a 503 or a first-chunk timeout, skip that model for a minute

/** Gemini 2.5 takes a token budget (0 = no thinking, lowest latency); Gemini 3 takes a level. */
export function thinkingConfigFor(model: string, level: ThinkingLevel, budget: number): ThinkingConfig | undefined {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: budget };
  if (/^gemini-3/.test(model)) return { thinkingLevel: level };
  return undefined;
}

/** Classifies a Gemini failure for the fallback decision. Quota details come from the 429 body. */
export function classifyApiError(e: unknown): { retryable: boolean; quota?: 'minute' | 'day'; retryAfterSeconds?: number; freeTier: boolean } {
  if (!(e instanceof ApiError)) return { retryable: false, freeTier: false };
  const text = e.message ?? '';
  const delay = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(text)?.[1];
  const freeTier = /free_?tier/i.test(text);
  if (e.status === 429) return { retryable: true, quota: /PerDay/i.test(text) ? 'day' : 'minute', ...(delay ? { retryAfterSeconds: Math.ceil(Number(delay)) } : {}), freeTier };
  if (e.status === 503 || e.status === 500) return { retryable: true, freeTier };
  return { retryable: false, freeTier };
}

class FirstChunkTimeout extends Error {}

export class GeminiAgent implements ChatAgent {
  readonly mode = 'ai' as const;
  readonly provider = 'gemini' as const;
  private readonly logger = new Logger('Gemini');
  private readonly declarations = functionDeclarations();
  private readonly instruction: string;
  private readonly thinkingLevel: ThinkingLevel;
  private readonly thinkingBudget: number;

  constructor(
    private readonly models: GeminiModels,
    private readonly ctx: ToolContext,
    private readonly options: GeminiAgentOptions,
    private readonly sessions: SessionStore<Content> = new MemorySessionStore(),
    private readonly evidence: SessionStore<ToolResult> = new MemorySessionStore(), // verified tool results, same window as the history
  ) {
    this.instruction = systemInstruction(ctx.index);
    this.thinkingLevel = options.thinkingLevel ?? ThinkingLevel.LOW;
    this.thinkingBudget = options.thinkingBudget ?? 0;
  }

  /** The primary model; the fallback is tried only when it fails. */
  get model(): string {
    return this.options.budgets[0]?.model ?? 'unknown';
  }

  quotaStatus() {
    return this.options.budgets.map((b) => b.status());
  }

  async run({ sessionId, message }: ChatTurnInput, emit: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
    const rec = new TurnRecorder(this.ctx, emit, (await this.evidence.load(sessionId)).items);
    const history = (await this.sessions.load(sessionId)).items;
    const turn: Content[] = [{ role: 'user', parts: [{ text: message }] }];
    const fallbackNotes = new Set<string>();

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      emit(roundStatus(round));
      const roundStart = performance.now();
      const parts: Part[] = [];
      const calls: NonNullable<Part['functionCall']>[] = [];
      const model = await this.streamRound(
        [...history, ...turn],
        round < MAX_ROUNDS ? FunctionCallingConfigMode.AUTO : FunctionCallingConfigMode.NONE,
        signal,
        fallbackNotes,
        emit,
        (part) => {
          parts.push(part); // kept verbatim: carries thought signatures for the next request
          if (part.functionCall) calls.push(part.functionCall);
          else if (part.text && !part.thought) rec.text(part.text);
        },
      );
      if (model === null) return; // aborted by the client
      rec.round(model, roundStart);
      turn.push({ role: 'model', parts });
      if (!calls.length) break;

      emit(toolsStatus(calls.map((c) => c.name ?? '')));
      const responses: Part[] = calls.map((call, i) => {
        const name = call.name ?? '';
        const r = rec.callTool(call.id ?? `r${round}-${i}`, name, call.args ?? {});
        return { functionResponse: { ...(call.id ? { id: call.id } : {}), name, response: 'error' in r ? { error: r.error } : { output: r.output } } };
      });
      turn.push({ role: 'user', parts: responses });
    }

    if (fallbackNotes.size) emit({ type: 'warning', message: `Answered with the fallback model ${rec.models.filter((m) => m !== this.model).at(-1) ?? ''}: ${[...fallbackNotes].join('; ')}.` });
    await this.sessions.append(sessionId, turn);
    await this.evidence.append(sessionId, rec.results);
    rec.finish();
  }

  /**
   * One model request, streamed. Tries the primary, then the fallback, only when the local quota guard blocks a
   * model or Google answers 429/503 before any text was streamed. One attempt per model, no retry loops.
   * Returns the model that answered, or null when the client aborted.
   */
  private async streamRound(contents: Content[], mode: FunctionCallingConfigMode, signal: AbortSignal, notes: Set<string>, emit: (e: ChatEvent) => void, onPart: (p: Part) => void): Promise<string | null> {
    const skipped: string[] = [];
    for (const [i, budget] of this.options.budgets.entries()) {
      const model = budget.model;
      if (!budget.tryTake()) {
        skipped.push(`${model} is cooling down after an error or at its local free-tier limit`);
        continue;
      }
      let streamedAny = false;
      const attempt = new AbortController();
      const onClientAbort = () => attempt.abort();
      signal.addEventListener('abort', onClientAbort, { once: true });
      const windowMs = i === 0 ? (this.options.firstChunkTimeoutMs ?? 25000) : (this.options.fallbackFirstChunkTimeoutMs ?? 10000);
      const timer = setTimeout(() => attempt.abort(new FirstChunkTimeout()), windowMs);
      const slow = setTimeout(() => emit({ type: 'status', stage: 'thinking', label: `${model} is responding slowly (Google-side), still waiting` }), Math.min(SLOW_NOTICE_MS, windowMs / 2));
      const t0 = performance.now();
      try {
        const thinkingConfig = thinkingConfigFor(model, this.thinkingLevel, this.thinkingBudget);
        const stream = await this.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: this.instruction,
            tools: [{ functionDeclarations: this.declarations }],
            toolConfig: { functionCallingConfig: { mode } },
            ...(thinkingConfig ? { thinkingConfig } : {}),
            abortSignal: attempt.signal,
          },
        });
        for await (const chunk of stream) {
          clearTimeout(timer);
          clearTimeout(slow);
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            streamedAny = true;
            onPart(part);
          }
        }
        this.logger.log(`${model}: ok in ${Math.round(performance.now() - t0)} ms`);
        if (i > 0) skipped.forEach((s) => notes.add(s));
        return model;
      } catch (e) {
        if (signal.aborted) return null;
        const timedOut = attempt.signal.aborted && attempt.signal.reason instanceof FirstChunkTimeout;
        const c = timedOut ? { retryable: true, freeTier: false } : classifyApiError(e);
        this.logger.warn(`${model}: ${timedOut ? 'no first chunk within timeout' : `HTTP ${(e as ApiError).status ?? '?'}`} after ${Math.round(performance.now() - t0)} ms`);
        if ('quota' in c && c.quota) budget.markExhausted(c.quota, c.retryAfterSeconds);
        else if (c.retryable) budget.markExhausted('minute', COOL_DOWN_SECONDS); // overloaded: cool down, do not retry it this minute
        const next = this.options.budgets[i + 1];
        if (c.retryable && next && !streamedAny) {
          skipped.push(timedOut ? `${model} sent nothing within ${windowMs / 1000} s` : `${model} returned ${(e as ApiError).status}${'quota' in c && c.quota ? ` (${c.quota === 'day' ? 'daily' : 'per-minute'} quota)` : ''}`);
          continue;
        }
        throw new Error(timedOut ? `Gemini is overloaded right now: ${[...skipped, `${model} sent nothing within ${windowMs / 1000} s`].join('; ')}. Try again shortly; Rankings and Method & sources work without Gemini.` : skipped.length ? `${describeApiError(e, model)} Also tried: ${skipped.join('; ')}.` : describeApiError(e, model));
      } finally {
        clearTimeout(timer);
        clearTimeout(slow);
        signal.removeEventListener('abort', onClientAbort);
      }
    }
    throw new Error(`Gemini free-tier quota is used up for now: ${skipped.join('; ')}. Daily quotas reset at midnight Pacific time; the BTS cards in Rankings and Method still work.`);
  }
}

/** Short, user-facing explanations; no retries (keeps chat responsive and the free-tier quota safe). */
export function describeApiError(e: unknown, model: string): string {
  if (e instanceof ApiError) {
    const c = classifyApiError(e);
    if (e.status === 429) return c.quota === 'day' ? `Gemini daily free-tier quota for ${model} is used up; it resets at midnight Pacific time.` : `Gemini free-tier rate limit reached for ${model}${c.retryAfterSeconds ? `; retry in about ${c.retryAfterSeconds} s` : '. Wait a minute and try again'}.`;
    if (e.status === 401 || e.status === 403) return 'Gemini rejected the API key. Check GEMINI_API_KEY in server/.env.';
    if (e.status === 404) return `Gemini model "${model}" is not available for this key (${googleMessage(e)}). Check GEMINI_MODEL in server/.env.`;
    if (e.status === 400) return `Gemini rejected the request (${googleMessage(e)}).`;
    if (e.status >= 500) return 'Gemini is temporarily unavailable. Try again shortly.';
  }
  return `Could not reach Gemini (${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}).`;
}

/** Google's own error text (innermost "message", which may be nested as escaped JSON), without echoing anything else. */
export function googleMessage(e: ApiError): string {
  const matches = [...e.message.matchAll(/\\?"message\\?"\s*:\s*\\?"((?:[^"\\]|\\[^"])+)/g)].map((m) => m[1] ?? '');
  const m = matches.filter((x) => !x.startsWith('{')).at(-1);
  return (m ?? e.message.slice(0, 200)).replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED]').slice(0, 240);
}
