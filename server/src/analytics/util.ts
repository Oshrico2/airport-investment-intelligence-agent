export const round = (x: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

/** a / b as a percentage, or null for an invalid denominator (R5′). */
export const percent = (a: number, b: number, digits = 1): number | null => (b > 0 ? round((100 * a) / b, digits) : null);

export const percentChange = (current: number, previous: number, digits = 1): number | null =>
  previous > 0 ? round((100 * (current - previous)) / previous, digits) : null;

export const fmt = (n: number): string => n.toLocaleString('en-US');

export const monthsOf = (year: number, lastMonth = 12): string[] =>
  Array.from({ length: lastMonth }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym: string): string => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? '?'} ${ym.slice(0, 4)}`;
export const monthRangeLabel = (months: string[]): string => {
  const first = months[0];
  const last = months.at(-1);
  if (!first || !last) return '';
  const a = MONTH_NAMES[Number(first.slice(5, 7)) - 1];
  const b = MONTH_NAMES[Number(last.slice(5, 7)) - 1];
  return first === last ? `${a} ${first.slice(0, 4)}` : `${a}–${b} ${last.slice(0, 4)}`;
};
