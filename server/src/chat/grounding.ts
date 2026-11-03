/**
 * Grounding check: every figure in the model's narrative must be traceable to the
 * conversation's tool results. A figure counts as grounded when some tool number rounds to it at the precision it
 * was written with (so "21.1 million" matches 21,143,295 and "2.8%" matches 2.77). Years and small counts are exempt.
 * Decade expressions ("80s", "low 80s", "mid-to-high 80s") are ranges: grounded only when a tool value lies inside.
 */
const NUMBER = /(?<![\w.])[-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])[-−]?\d+(?:\.\d+)?/g;
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

export interface WrittenNumber {
  raw: string;
  value: number;
  tolerance: number; // half a unit in the last written place
  range?: [number, number]; // decade expressions: [min, max), matched against tool values only
}

// Where within a decade "low", "mid" and "high" fall (offsets from the decade start, max exclusive; they overlap).
const PART: Record<string, [number, number]> = { low: [0, 5], lower: [0, 5], mid: [3, 8], middle: [3, 8], high: [5, 10], upper: [5, 10] };
const QUALIFIER = /\b(low|lower|mid|middle|high|upper)(?:[\s-]+to[\s-]+(low|lower|mid|middle|high|upper))?[\s-]*(?:the\s+)?$/;

/** "80s", "low 80s", "mid-to-high 80s" → the span of values they describe; null for anything else. */
function decade(raw: string, before: string, after: string): WrittenNumber | null {
  if (!/^[1-9]0$/.test(raw) || !/^s(?![a-z])/.test(after)) return null;
  const start = Number(raw);
  const q = QUALIFIER.exec(before);
  const [from, to] = q ? [PART[q[1]!]![0], PART[q[2] ?? q[1]!]![1]] : [0, 10];
  return { raw: `${q ? `${q[0].trim()} ` : ''}${raw}s`, value: start, tolerance: 0, range: [start + from, start + to] };
}

export function extractNumbers(text: string): WrittenNumber[] {
  const out: WrittenNumber[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const raw = m[0];
    const after = text.slice((m.index ?? 0) + raw.length, (m.index ?? 0) + raw.length + 10).toLowerCase();
    const span = decade(raw, text.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0).toLowerCase(), after);
    if (span) {
      out.push(span);
      continue;
    }
    const scaleWord = /^\s?(k|m|b|thousand|million|billion)\b/.exec(after)?.[1];
    const scale = scaleWord ? (SCALE[scaleWord] ?? 1) : 1;
    const digits = raw.replace(/,/g, '').replace('−', '-');
    const decimals = digits.includes('.') ? digits.split('.')[1]!.length : 0;
    out.push({ raw: scaleWord ? `${raw} ${scaleWord}` : raw, value: Number(digits) * scale, tolerance: (0.5 * scale) / 10 ** decimals });
  }
  return out;
}

/** All numbers in a tool result, including those embedded in strings ("437,565 departing passengers"). */
export function collectNumbers(value: unknown, into: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) into.push(value);
  else if (typeof value === 'string') for (const n of extractNumbers(value)) into.push(n.value);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectNumbers(v, into);
  return into;
}

const exempt = (n: WrittenNumber) => (Number.isInteger(n.value) && Math.abs(n.value) <= 12) || (Number.isInteger(n.value) && n.value >= 1990 && n.value <= 2035);

/**
 * Approved methodology constants the model may quote without a tool echoing them:
 * weights 60/40 %, the 500,000 threshold, 3,000 statute miles, and the score breakpoints.
 */
export const METHOD_CONSTANTS = [60, 40, 500_000, 3_000, 20, 50, 75, 90, 100];

/** Returns the written figures that no tool result supports (empty = grounded). */
export function ungroundedNumbers(answer: string, toolResults: unknown[]): string[] {
  const measured = collectNumbers(toolResults);
  const known = [...measured, ...METHOD_CONSTANTS];
  // A range is grounded only by measured values: a methodology constant (e.g. 50) never vouches for "low 50s".
  const grounded = (n: WrittenNumber) =>
    n.range
      ? measured.some((k) => Math.abs(k) >= n.range![0] && Math.abs(k) < n.range![1])
      : known.some((k) => Math.abs(k - n.value) <= n.tolerance + 1e-9 || Math.abs(Math.abs(k) - Math.abs(n.value)) <= n.tolerance + 1e-9);
  return extractNumbers(answer)
    .filter((n) => !exempt(n))
    .filter((n) => !grounded(n))
    .map((n) => n.raw);
}
