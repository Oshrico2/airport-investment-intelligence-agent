/**
 * Chart primitives (dataviz skill): thin marks (≤24px bars, 4px rounded data-end, square at the baseline),
 * 2px surface gaps, recessive hairline grid, text in text tokens (never series color), direct labels used
 * sparingly, a hover/focus readout on every mark, and a table alternative supplied by the parent card.
 */
import { useId, useState, type ReactNode } from 'react';
import { int, monthName } from '../lib/format';
import { Num, VisuallyHidden } from '../styles/shared.styles';
import * as S from './charts.styles';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'] as const;

/** Overall score as two contributions on a 0–100 track: growth × 0.6 then load × 0.4. */
export function ScoreBar({ growth, load, total, label }: { growth: number; load: number; total: number; label: string }) {
  const g = Math.max(0, growth);
  const l = Math.max(0, load);
  return (
    <S.ScoreBar role="img" aria-label={`${label}: overall ${total} = growth ${growth} + load ${l}`} title={`Growth ${growth} + Load ${load} = ${total}`}>
      <S.ScoreTrack>
        <S.ScoreSeg $part="growth" $width={g} />
        {l > 0 && <S.ScoreSeg $part="load" $width={l} />}
      </S.ScoreTrack>
      <S.ScoreValue>{total.toFixed(1)}</S.ScoreValue>
    </S.ScoreBar>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'bar' | 'line' }[] }) {
  return (
    <S.Legend aria-label="Legend">
      {items.map((i) => (
        <li key={i.label}>
          <S.LegendKey $color={i.color} $shape={i.shape ?? 'bar'} />
          {i.label}
        </li>
      ))}
    </S.Legend>
  );
}

/** One row per metric, one bar per entity (fixed entity colors). Values labelled at the bar tip. */
export function PairedBars({ entities, rows }: { entities: string[]; rows: { label: string; values: (number | null)[]; format: (n: number) => string; max?: number }[] }) {
  return (
    <S.Paired>
      {rows.map((r) => {
        const max = r.max ?? Math.max(...r.values.map((v) => v ?? 0), 1e-9);
        return (
          <S.PairedRow key={r.label}>
            <S.PairedLabel>{r.label}</S.PairedLabel>
            <S.PairedBars>
              {r.values.map((v, i) => (
                <S.PairedBar key={entities[i]} title={`${entities[i]}: ${v === null ? 'no data' : r.format(v)}`}>
                  <S.PairedEntity>{entities[i]}</S.PairedEntity>
                  <S.PairedTrack>
                    {v !== null && <S.PairedFill $width={(100 * v) / max} $color={SERIES[i % SERIES.length]!} />}
                  </S.PairedTrack>
                  <S.PairedValue>{v === null ? '—' : r.format(v)}</S.PairedValue>
                </S.PairedBar>
              ))}
            </S.PairedBars>
          </S.PairedRow>
        );
      })}
    </S.Paired>
  );
}

/** Part-to-whole of one total: the emphasised part in series-1, the remainder in the muted tone. */
export function ShareBar({ part, total, partLabel, restLabel }: { part: number; total: number; partLabel: string; restLabel: string }) {
  const share = total > 0 ? (100 * part) / total : 0;
  return (
    <S.ShareBar>
      <S.ShareTrack role="img" aria-label={`${partLabel}: ${int(part)} of ${int(total)}`}>
        <S.SharePart $width={Math.max(share, 0.6)} title={`${partLabel}: ${int(part)}`} />
        <S.ShareRest title={`${restLabel}: ${int(total - part)}`} />
      </S.ShareTrack>
      <S.ShareLabels>
        <span>
          <S.LegendKey $color="var(--series-1)" /> {partLabel} <Num as="b">{int(part)}</Num>
        </span>
        <span>
          <S.LegendKey $color="var(--series-muted)" /> {restLabel} <Num as="b">{int(total - part)}</Num>
        </span>
      </S.ShareLabels>
    </S.ShareBar>
  );
}

/** Columns for a few periods with the current one emphasised (small multiple cell). */
export function MiniColumns({ title, items, format }: { title: string; items: { label: string; value: number | null; emphasis?: boolean }[]; format: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value ?? 0), 1e-9);
  return (
    <S.MiniColumns>
      <figcaption>{title}</figcaption>
      <S.MiniPlot>
        {items.map((i) => (
          <S.MiniCol key={i.label} title={`${i.label}: ${i.value === null ? 'no data' : format(i.value)}`}>
            <S.MiniValue>{i.value === null ? '—' : format(i.value)}</S.MiniValue>
            <S.MiniBar $height={i.value === null ? 0 : Math.max(4, (100 * i.value) / max)} $emphasis={!!i.emphasis} />
            <S.MiniLabel>{i.label}</S.MiniLabel>
          </S.MiniCol>
        ))}
      </S.MiniPlot>
    </S.MiniColumns>
  );
}

interface TrendSeries {
  label: string;
  color: string;
  points: { month: string; value: number }[];
}

/** Month-of-year lines (e.g. 2025 vs 2026 same months) with end labels and a crosshair readout of every series. */
export function TrendChart({ series, format, tableFormat = format, height = 148 }: { series: TrendSeries[]; format: (n: number) => string; tableFormat?: (n: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const firstMonth = Math.min(...series.flatMap((s) => s.points.map((p) => Number(p.month.slice(5, 7)))));
  const lastMonth = Math.max(...series.flatMap((s) => s.points.map((p) => Number(p.month.slice(5, 7)))));
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    setHover((h) => Math.min(lastMonth, Math.max(firstMonth, (h ?? (e.key === 'ArrowRight' ? firstMonth - 1 : lastMonth + 1)) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const W = 560;
  const H = height;
  const pad = { l: 44, r: 40, t: 12, b: 22 };
  const all = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(hi - lo, hi * 0.05, 1);
  const min = Math.max(0, lo - span * 0.15); // lines need no zero baseline; keep the variation readable
  const max = hi + span * 0.15;
  const x = (m: number) => pad.l + ((W - pad.l - pad.r) * (m - 1)) / 11;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const monthIdx = (ym: string) => Number(ym.slice(5, 7));
  const ticks = [lo, hi];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(12, Math.max(1, Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * 11 + 1))));
  };
  const readout = hover
    ? series.map((s) => ({ s, p: s.points.find((p) => monthIdx(p.month) === hover) })).filter((r): r is { s: TrendSeries; p: { month: string; value: number } } => !!r.p)
    : [];
  return (
    <S.Trend>
      <S.TrendSvg viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)} tabIndex={0} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{series.map((s) => s.label).join(' vs ')} monthly departing passengers</title>
        {ticks.map((t) => (
          <g key={t}>
            <S.TrendGrid x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <S.TrendTick x={pad.l - 6} y={y(t) + 3} textAnchor="end">{format(t)}</S.TrendTick>
          </g>
        ))}
        <S.TrendAxis x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
        {Array.from({ length: 12 }, (_, i) => (
          <S.TrendTick key={i} x={x(i + 1)} y={H - 6} textAnchor="middle">
            {monthName(`2000-${String(i + 1).padStart(2, '0')}`)[0]}
          </S.TrendTick>
        ))}
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${x(monthIdx(p.month))},${y(p.value)}`).join(' ')} />
        ))}
        {series.map((s) => {
          const last = s.points.at(-1);
          if (!last) return null;
          const lx = x(monthIdx(last.month));
          const partial = monthIdx(last.month) < 12;
          return (
            <g key={s.label}>
              <circle cx={lx} cy={y(last.value)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
              {partial ? (
                <S.TrendEnd x={lx} y={Math.max(pad.t + 2, y(last.value) - 10)} textAnchor="middle">{s.label}</S.TrendEnd>
              ) : (
                <S.TrendEnd x={lx + 8} y={y(last.value) + 4}>{s.label}</S.TrendEnd>
              )}
            </g>
          );
        })}
        {hover && <S.TrendCross x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} />}
      </S.TrendSvg>
      <S.TrendReadout aria-live="polite">
        {hover && readout.length ? (
          <>
            <S.TrendMonth>{monthName(`2000-${String(hover).padStart(2, '0')}`)}</S.TrendMonth>
            {readout.map(({ s, p }) => (
              <span key={s.label}>
                <S.LegendKey $color={s.color} $shape="line" />
                <Num as="b">{format(p.value)}</Num> {s.label}
              </span>
            ))}
          </>
        ) : (
          <S.TrendHint>Departing passengers by month · hover, or focus and use the arrow keys</S.TrendHint>
        )}
      </S.TrendReadout>
      <S.TrendTable>
        <summary>Monthly values</summary>
        <S.MiniTable>
          <VisuallyHidden as="caption">Monthly departing passengers</VisuallyHidden>
          <thead>
            <tr>
              <th scope="col">Month</th>
              {series.map((s) => <th scope="col" key={s.label}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: lastMonth - firstMonth + 1 }, (_, i) => firstMonth + i).map((m) => (
              <tr key={m}>
                <th scope="row">{monthName(`2000-${String(m).padStart(2, '0')}`)}</th>
                {series.map((s) => {
                  const p = s.points.find((pt) => monthIdx(pt.month) === m);
                  return <S.NumCell key={s.label}>{p ? tableFormat(p.value) : '—'}</S.NumCell>;
                })}
              </tr>
            ))}
          </tbody>
        </S.MiniTable>
      </S.TrendTable>
    </S.Trend>
  );
}

export function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <S.Figure>
      <dt>{label}</dt>
      <dd>
        <S.FigureValue>{value}</S.FigureValue>
        {sub && <S.FigureSub>{sub}</S.FigureSub>}
      </dd>
    </S.Figure>
  );
}
