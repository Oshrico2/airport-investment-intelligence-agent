import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type { ChatEvent, ToolResult } from '../../../shared/api';
import type { ToolContext } from '../tools/registry';
import type { ChatAgent, ChatTurnInput } from './chat-agent';
import { MemorySessionStore, type SessionStore } from './sessions';
import { systemInstruction } from './system-prompt';
import { claudeTools } from './tool-declarations';
import { MAX_ROUNDS, roundStatus, SLOW_NOTICE_MS, toolsStatus, TurnRecorder } from './turn-recorder';

/** The slice of the SDK the agent uses; tests substitute a scripted fake. */
export type ClaudeMessages = Pick<Anthropic['messages'], 'stream'>;

/** Cost ceilings per question. Production lowers maxTokens and caps input (agent.factory). */
export interface ClaudeLimits {
  maxTokens: number; // per round; answers are 2 to 6 sentences, so this bounds cost without truncating them
  maxInputTokens: number; // per question, summed over rounds (uncached + cache read + cache write)
}
const LOCAL_LIMITS: ClaudeLimits = { maxTokens: 8192, maxInputTokens: Infinity };

export interface ClaudeAgentOptions {
  sessions?: SessionStore<Anthropic.MessageParam>;
  evidence?: SessionStore<ToolResult>; // verified tool results, same window as the history
  limits?: ClaudeLimits;
}

/**
 * Claude with native tool use (manual loop, same contract as GeminiAgent): Claude picks tools, the deterministic
 * registry computes every figure, text streams as it is generated. At most 3 rounds; the last one forbids tools.
 */
export class ClaudeAgent implements ChatAgent {
  readonly provider = 'claude' as const;
  readonly mode = 'ai' as const;
  private readonly logger = new Logger('Claude');
  private readonly tools = claudeTools();
  private readonly system: string;
  private readonly sessions: SessionStore<Anthropic.MessageParam>;
  private readonly evidence: SessionStore<ToolResult>;
  private readonly limits: ClaudeLimits;

  constructor(
    private readonly messages: ClaudeMessages,
    private readonly ctx: ToolContext,
    readonly model: string,
    options: ClaudeAgentOptions = {},
  ) {
    this.system = systemInstruction(ctx.index);
    this.sessions = options.sessions ?? new MemorySessionStore();
    this.evidence = options.evidence ?? new MemorySessionStore();
    this.limits = options.limits ?? LOCAL_LIMITS;
  }

  async run({ sessionId, message }: ChatTurnInput, emit: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
    const rec = new TurnRecorder(this.ctx, emit, (await this.evidence.load(sessionId)).items);
    // Append-only history (preserved thinking): Claude binds each thinking block to the exact system prompt, tools
    // and earlier messages, and rejects edited history with a 400. So `system` never changes within a session, and
    // once the window has dropped old turns the retained thinking blocks are removed (a leading run, which is allowed).
    const stored = await this.sessions.load(sessionId);
    const history = stored.trimmed ? withoutThinking(stored.items) : stored.items;
    const turn: Anthropic.MessageParam[] = [{ role: 'user', content: message }];
    let inputTokens = 0;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      emit(roundStatus(round));
      const roundStart = performance.now();
      const reply = await this.streamRound([...history, ...turn], round < MAX_ROUNDS, signal, emit, (t) => rec.text(t));
      if (reply === null) return; // aborted by the client
      rec.round(this.model, roundStart);
      // A refusal can cut a tool_use off mid-input: never run its tools, and keep the turn out of the history.
      if (reply.stop_reason === 'refusal') {
        emit({ type: 'warning', message: 'Claude declined this request. Rephrase it as a question about U.S. airport traffic or investment.' });
        rec.finish();
        return;
      }
      const uses = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (uses.length && reply.stop_reason === 'max_tokens') throw new Error('Claude was cut off while choosing tools (max_tokens). Try a narrower question.');
      turn.push({ role: 'assistant', content: reply.content }); // verbatim: keeps tool_use ids (and thinking blocks, if the model thinks)
      if (!uses.length) break;
      const u = reply.usage;
      inputTokens += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      if (inputTokens >= this.limits.maxInputTokens) throw new Error('This question reached its size limit before Claude finished. Start a new analysis or ask a narrower question.');

      emit(toolsStatus(uses.map((u) => u.name)));
      // All results of a round go back in one user message, as Claude expects for parallel tool calls.
      const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
        const r = rec.callTool(u.id, u.name, (u.input ?? {}) as Record<string, unknown>);
        return 'error' in r ? { type: 'tool_result', tool_use_id: u.id, is_error: true, content: r.error } : { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r.output) };
      });
      turn.push({ role: 'user', content: results });
    }

    await this.sessions.append(sessionId, turn);
    await this.evidence.append(sessionId, rec.results);
    rec.finish();
  }

  /** One streamed request. The SDK retries 429/5xx/529 itself (maxRetries on the client); returns null when the client aborted. */
  private async streamRound(messages: Anthropic.MessageParam[], allowTools: boolean, signal: AbortSignal, emit: (e: ChatEvent) => void, onText: (t: string) => void): Promise<Anthropic.Message | null> {
    const t0 = performance.now();
    const slow = setTimeout(() => emit({ type: 'status', stage: 'thinking', label: `${this.model} is responding slowly (Anthropic-side), still waiting` }), SLOW_NOTICE_MS);
    try {
      const stream = this.messages.stream(
        {
          model: this.model,
          max_tokens: this.limits.maxTokens,
          system: this.system,
          tools: this.tools,
          tool_choice: allowTools ? { type: 'auto' } : { type: 'none' },
          messages,
          cache_control: { type: 'ephemeral' }, // system + tools + earlier rounds are an identical prefix within a turn
        },
        { signal },
      );
      for await (const event of stream) {
        clearTimeout(slow);
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text);
      }
      const reply = await stream.finalMessage();
      const u = reply.usage;
      this.logger.log(`${this.model}: ${reply.stop_reason} in ${Math.round(performance.now() - t0)} ms · tokens in ${u.input_tokens} out ${u.output_tokens} cache read ${u.cache_read_input_tokens ?? 0} write ${u.cache_creation_input_tokens ?? 0}`);
      return reply;
    } catch (e) {
      if (signal.aborted) return null;
      this.logger.warn(`${this.model}: ${e instanceof Anthropic.APIError ? `HTTP ${e.status ?? 'n/a'} ${e.type ?? ''}` : 'stream failed'} after ${Math.round(performance.now() - t0)} ms`);
      throw new Error(describeClaudeError(e, this.model));
    } finally {
      clearTimeout(slow);
    }
  }
}

/** The history without thinking blocks (all of them, so the removal is a leading run). Empty messages are dropped. */
export function withoutThinking(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.flatMap((m) => {
    if (typeof m.content === 'string') return [m];
    const content = m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    return content.length ? [{ ...m, content } as Anthropic.MessageParam] : [];
  });
}

/** Short, user-facing explanations, most specific error class first. Never echoes the key. */
export function describeClaudeError(e: unknown, model: string): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude rejected the API key. Check ANTHROPIC_API_KEY in server/.env.';
  if (e instanceof Anthropic.PermissionDeniedError) return `This Anthropic key is not allowed to use ${model} (${anthropicMessage(e)}).`;
  if (e instanceof Anthropic.NotFoundError) return `Claude model "${model}" is not available for this key. Check ANTHROPIC_MODEL in server/.env.`;
  if (e instanceof Anthropic.RateLimitError) {
    const after = e.headers.get('retry-after');
    return `Claude rate limit reached for ${model}${after ? `; retry in about ${after} s` : '; wait a minute and try again'}.`;
  }
  if (e instanceof Anthropic.BadRequestError) return `Claude rejected the request (${anthropicMessage(e)}).`;
  if (e instanceof Anthropic.InternalServerError) return e.status === 529 || e.type === 'overloaded_error' ? 'Claude is overloaded right now. Try again shortly, or switch to Gemini.' : 'Claude is temporarily unavailable. Try again shortly.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API (network error or timeout). Try again shortly.';
  if (e instanceof Anthropic.APIError) return `Claude returned an error${e.status ? ` (HTTP ${e.status})` : ''}: ${anthropicMessage(e)}.`;
  return `Claude failed (${e instanceof Error ? redact(e.message).slice(0, 200) : 'unknown error'}).`;
}

/** Anthropic's own error text from the response body, e.g. "Your credit balance is too low ...". */
function anthropicMessage(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = e.error as { error?: { message?: string } } | undefined;
  return redact(body?.error?.message ?? e.message).slice(0, 240);
}

const redact = (s: string) => s.replace(/sk-ant-[\w-]+/g, '[REDACTED]');
