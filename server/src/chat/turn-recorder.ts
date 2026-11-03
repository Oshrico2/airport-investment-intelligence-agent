import type { ChatEvent, ToolResult } from '../../../shared/api';
import { runTool, type ToolContext } from '../tools/registry';
import { ToolError } from '../tools/tool-error';
import { compactForModel } from './compact';
import { ungroundedNumbers } from './grounding';

export const MAX_ROUNDS = 3; // typical turns need 2: choose tools, then write

export const SLOW_NOTICE_MS = 6000; // tell the user the model is slow rather than leaving the timeline silent

const TOOL_LABELS: Record<string, string> = {
  rank_airports: 'Ranking airports',
  get_airport_profile: 'Reading airport profile',
  compare_airports: 'Comparing airports',
  get_long_haul_share: 'Measuring long-haul share',
  compare_delays: 'Comparing delays',
  get_capacity_pressure: 'Checking capacity pressure',
  resolve_airport: 'Resolving airport',
  describe_methodology: 'Reading methodology',
  get_data_sources: 'Checking data sources',
};

export const roundStatus = (round: number): ChatEvent => ({ type: 'status', stage: round === 1 ? 'thinking' : 'writing', label: round === 1 ? 'Understanding the question' : 'Writing the answer from BTS results' });

/** One label per tool, with a count when the model calls it several times in parallel ("Comparing delays ×3"). */
export function toolsStatus(names: string[]): ChatEvent {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return { type: 'status', stage: 'tools', label: [...counts].map(([n, c]) => `${TOOL_LABELS[n] ?? n}${c > 1 ? ` ×${c}` : ''}`).join(' · ') };
}

/**
 * Provider-neutral bookkeeping for one AI chat turn: streams text, runs model-chosen tools through the
 * deterministic registry, and finishes with the grounding check and timings. Gemini and Claude share it.
 * `earlier` holds the verified tool results of the conversation's previous turns: a follow-up may quote them.
 */
export class TurnRecorder {
  private readonly started = performance.now();
  readonly results: ToolResult[] = [];
  private readonly modelRounds: number[] = [];
  readonly models: string[] = [];
  private toolsMs = 0;
  private answer = '';
  private firstTextMs: number | null = null;

  constructor(private readonly ctx: ToolContext, private readonly emit: (e: ChatEvent) => void, private readonly earlier: ToolResult[] = []) {
    const live = ctx.live();
    if (live.state === 'unreachable' || live.state === 'newer-available') emit({ type: 'warning', message: live.message });
  }

  text(text: string): void {
    this.firstTextMs ??= Math.round(performance.now() - this.started);
    this.answer += text;
    this.emit({ type: 'text_delta', text });
  }

  round(model: string, startedAt: number): void {
    this.modelRounds.push(Math.round(performance.now() - startedAt));
    this.models.push(model);
  }

  /** Runs one tool call (arguments are zod-validated by the registry) and returns what the model should see. */
  callTool(callId: string, name: string, args: Record<string, unknown>): { output: unknown } | { error: string } {
    this.emit({ type: 'tool_call', callId, name, args });
    try {
      const { result, ms } = runTool(this.ctx, name, args);
      this.toolsMs += ms;
      this.results.push(result);
      this.emit({ type: 'tool_result', callId, name, ms, result });
      return { output: compactForModel(result) };
    } catch (e) {
      const message = e instanceof ToolError ? e.message : 'The tool failed unexpectedly.';
      this.emit({ type: 'tool_result', callId, name, ms: 0, result: { kind: 'error', message } });
      return { error: message };
    }
  }

  finish(): void {
    const unsupported = ungroundedNumbers(this.answer, [...this.earlier, ...this.results]);
    if (unsupported.length) {
      this.emit({ type: 'warning', message: `Some figures in this answer could not be matched to the BTS tool results of this conversation: ${unsupported.slice(0, 6).join(', ')}. Rely on the cards for exact values.` });
    }
    if (!this.answer.trim()) this.emit({ type: 'warning', message: 'The model returned no written answer; the cards above show the BTS results.' });
    const totalMs = Math.max(Math.round((performance.now() - this.started) * 10) / 10, this.toolsMs);
    this.emit({ type: 'done', timings: { modelRounds: this.modelRounds, models: this.models, toolsMs: Math.round(this.toolsMs * 100) / 100, totalMs: Math.round(totalMs * 10) / 10, firstTextMs: this.firstTextMs } });
  }
}
