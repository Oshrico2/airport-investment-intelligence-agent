const nf = new Intl.NumberFormat('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const int = (n: number) => nf.format(Math.round(n));

/** Values arrive already rounded by the server; we only add the unit. */
export const pct = (n: number | null | undefined, digits?: number) =>
  n === null || n === undefined ? '—' : `${digits === undefined ? n : n.toFixed(digits)}%`;

export const signedPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`);

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  return int(n);
}

export const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
export const monthLabel = (ym: string) => `${monthName(ym)} ${ym.slice(0, 4)}`;

export function coverageLabel(c: { from: string; to: string }): string {
  if (!c.from) return '';
  return c.from.slice(0, 4) === c.to.slice(0, 4) ? `${monthName(c.from)}–${monthLabel(c.to)}` : `${monthLabel(c.from)} – ${monthLabel(c.to)}`;
}

export const dateLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : n >= 10 ? `${Math.round(n)} ms` : `${n.toFixed(1)} ms`);

export const direction = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');
