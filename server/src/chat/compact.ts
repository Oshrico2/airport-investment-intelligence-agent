import type { ToolResult } from '../../../shared/api';

const DROP = new Set(['id', 'monthly', 'retrievedAt', 'vintage', 'months', 'aliases', 'states', 'kind']);

/**
 * What the model sees of a tool result: the same values, minus fields it never needs to write an answer
 * (internal IDs, monthly series, retrieval timestamps). Fewer prompt tokens per round means lower latency.
 * The UI still receives the full result, and the grounding check runs against it.
 */
export function compactForModel(result: ToolResult): unknown {
  return JSON.parse(
    JSON.stringify(result, (key, value: unknown) => {
      if (DROP.has(key)) return undefined;
      if (key === 'sources' && Array.isArray(value)) return (value as { name: string; coverage: { from: string; to: string } }[]).map((s) => `${s.name} (${s.coverage.from || 'n/a'} to ${s.coverage.to || 'n/a'})`);
      return value;
    }),
  );
}
