import type { ChatEvent, ToolResult } from '../../../shared/api';
import { runTool, type ToolContext } from '../tools/registry';
import type { ChatAgent, ChatTurnInput } from './chat-agent';
import { SUGGESTIONS, type Suggestion } from './suggestions';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Waits `ms` unless the client aborts first (a stopped Demo answer ends at once). */
const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/**
 * Optional fallback without an AI key, also selectable next to Gemini and Claude: answers exactly the listed
 * suggested questions by running their fixed tool plans. It does not interpret free text and says so. Its summaries
 * are templates over tool results.
 *
 * Pacing: an instant answer reads as broken next to the AI providers, so the Demo spends about
 * `paceMs` in clearly labelled Demo steps and streams its template a few words at a time. It never claims to be AI;
 * 0 turns pacing off (automated tests).
 */
export class DemoAgent implements ChatAgent {
  readonly provider = 'demo' as const;
  readonly mode = 'demo' as const;
  constructor(private readonly ctx: ToolContext, private readonly paceMs = 0) {}

  /** Streams the text in word groups over `ms`; false when the client aborted. */
  private async stream(text: string, ms: number, emit: (e: ChatEvent) => void, signal?: AbortSignal): Promise<boolean> {
    const words = text.split(/(?<=\s)/); // keeps spacing and line breaks
    const chunks = ms > 0 ? Array.from({ length: Math.ceil(words.length / 4) }, (_, i) => words.slice(i * 4, i * 4 + 4).join('')) : [text];
    for (const chunk of chunks) {
      if (signal?.aborted) return false;
      emit({ type: 'text_delta', text: chunk });
      await pause(ms / chunks.length, signal);
    }
    return !signal?.aborted;
  }

  async run({ message }: ChatTurnInput, emit: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
    const started = performance.now();
    const s = SUGGESTIONS.find((x) => norm(x.question) === norm(message) || x.id === message.trim());
    emit({ type: 'status', stage: 'thinking', label: 'Demo mode: matching a listed analysis' });
    await pause(this.paceMs * 0.35, signal);
    if (signal?.aborted) return;
    if (!s) {
      emit({ type: 'status', stage: 'writing', label: 'Demo mode: listing the supported questions' });
      const text = `Demo mode (no AI) answers only the listed questions and does not interpret free text:\n${SUGGESTIONS.map((x) => `- ${x.question}`).join('\n')}\nChoose Gemini or Claude to ask anything (each needs its API key in server/.env).`;
      if (!(await this.stream(text, this.paceMs * 0.4, emit, signal))) return;
      emit({ type: 'done', timings: { modelRounds: [], toolsMs: 0, totalMs: elapsed(started, 0), firstTextMs: null } });
      return;
    }
    emit({ type: 'status', stage: 'tools', label: 'Demo mode: running the fixed analysis for this question' });
    const results: ToolResult[] = [];
    let toolsMs = 0;
    for (const [i, step] of s.demoPlan.entries()) {
      const callId = `demo-${i}`;
      emit({ type: 'tool_call', callId, name: step.name, args: step.args });
      const { result, ms } = runTool(this.ctx, step.name, step.args);
      toolsMs += ms;
      results.push(result);
      emit({ type: 'tool_result', callId, name: step.name, ms, result });
    }
    await pause(this.paceMs * 0.2, signal);
    if (signal?.aborted) return;
    emit({ type: 'status', stage: 'writing', label: 'Demo mode: filling in the template summary' });
    if (!(await this.stream(summarize(s, results), this.paceMs * 0.45, emit, signal))) return;
    emit({ type: 'done', timings: { modelRounds: [], toolsMs: Math.round(toolsMs * 100) / 100, totalMs: elapsed(started, toolsMs), firstTextMs: null } });
  }
}

/** Wall time since `started` in ms (0.1 ms precision), never below the time spent in tools. */
const elapsed = (started: number, toolsMs: number) => Math.max(Math.round((performance.now() - started) * 10) / 10, Math.round(toolsMs * 10) / 10);

const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'n/a' : `${n}%`);
const num = (n: number) => n.toLocaleString('en-US');

function summarize(s: Suggestion, results: ToolResult[]): string {
  const r = results[0];
  const prefix = 'Demo mode summary (template, no AI): ';
  if (!r) return prefix;
  switch (r.kind) {
    case 'ranking': {
      const top = r.rows[0];
      return `${prefix}${r.eligibleCount} airports in ${r.region.label} meet the ranking rules (≥${num(r.method.threshold)} departing passengers in 2025, complete 2024 and 2025 data). ${top ? `${top.airport.code} leads with an overall score of ${top.score.overallScore} (growth ${pct(top.score.growthPercent)}, load factor ${pct(top.score.loadFactorPercent)}).` : ''} ${r.excludedCount} airports are not ranked; the largest exclusions and their reasons are listed.`;
    }
    case 'longHaul':
      return `${prefix}${pct(r.longHaulSharePercent)} of ${r.airport.code}'s ${r.year} passenger-flight departures (${num(r.longHaulPassengerDepartures)} of ${num(r.passengerDepartures)}) flew ${num(r.minMiles)}+ statute miles. Including cargo-only service the share would be ${pct(r.allLongHaulSharePercent)}, which is why cargo is excluded.`;
    case 'delays': {
      const [a, b] = r.airports;
      const line = (x: typeof a) => (x?.metrics ? `${x.airport.code} ${pct(x.metrics.delayedPercent)} of arrivals delayed 15+ min, ${x.metrics.delayMinutesPerArrival} delay minutes per arrival` : `${x?.airport.code ?? '?'}: no delay data`);
      return `${prefix}${r.period.label}: ${line(a)}; ${line(b)}. Delays are a diagnostic, not part of the score, and not a direct measure of terminal congestion.`;
    }
    case 'capacity': {
      const vs19 = r.changes.find((c) => c.vsYear === 2019);
      return `${prefix}${r.airport.code} ${r.current.year} passengers changed ${pct(vs19?.passengersPercent)} vs 2019 and passenger-service departures ${pct(vs19?.passengerServiceDeparturesPercent)}; load factor ${pct(r.current.loadFactorPercent)}. These are capacity-pressure proxies only: BTS data cannot measure unmet demand directly.`;
    }
    case 'airportProfile':
      return `${prefix}${r.airport.code} ${r.airport.name}: ${r.ranking.eligible ? `ranked #${r.ranking.nationalRank} nationally with an overall score of ${r.ranking.score?.overallScore}` : 'not ranked'}; 2025 growth ${pct(r.growthPercent2025)}.`;
    case 'methodology':
      return `${prefix}${r.title}. ${r.points[0] ?? ''}`;
    default:
      return `${prefix}${s.question}`;
  }
}
