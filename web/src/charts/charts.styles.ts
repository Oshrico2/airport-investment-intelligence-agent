import styled from 'styled-components';
import { disclosure, num } from '../styles/shared.styles';

/* High-churn values (bar lengths, series colors) go through `style` via attrs: no class per value. */

/* score bar */
export const ScoreBar = styled.span`
  display: flex;
  align-items: center;
  gap: var(--s2);
  width: 100%;
`;
export const ScoreTrack = styled.span`
  position: relative;
  min-width: 48px;
  display: flex;
  gap: 2px;
  flex: 1;
  height: 8px;
  border-radius: 2px;
  background: var(--grid);
  overflow: hidden;
`;
export const ScoreSeg = styled.span.attrs<{ $width: number; $part: 'growth' | 'load' }>((p) => ({ style: { width: `${p.$width}%` } }))`
  height: 100%;
  background: ${(p) => (p.$part === 'growth' ? 'var(--series-1)' : 'var(--series-3)')};
  ${(p) => p.$part === 'load' && 'border-radius: 0 2px 2px 0;'}
`;
export const ScoreValue = styled.span`
  ${num}
  width: 2.6em;
  text-align: right;
  color: var(--text);
  font-size: var(--fs-sm);
`;

export const Legend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: var(--s4);
  padding: 0;
  list-style: none;
  color: var(--text-2);
  font-size: var(--fs-xs);
  li {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
  }
`;
export const LegendKey = styled.span.attrs<{ $color: string; $shape?: 'bar' | 'line' }>((p) => ({ style: { background: p.$color } }))`
  display: inline-block;
  vertical-align: middle;
  ${(p) => (p.$shape === 'line' ? 'width: 14px; height: 2px; border-radius: 1px;' : 'width: 10px; height: 10px; border-radius: 2px;')}
`;

/* share bar */
export const ShareBar = styled.div`
  display: grid;
  gap: var(--s2);
`;
export const ShareTrack = styled.div`
  display: flex;
  gap: 2px;
  height: 14px;
`;
export const SharePart = styled.span.attrs<{ $width: number }>((p) => ({ style: { width: `${p.$width}%` } }))`
  background: var(--series-1);
  border-radius: 2px 0 0 2px;
`;
export const ShareRest = styled.span`
  flex: 1;
  background: var(--series-muted);
  border-radius: 0 2px 2px 0;
`;
export const ShareLabels = styled.div`
  display: flex;
  justify-content: space-between;
  gap: var(--s3);
  color: var(--text-2);
  font-size: var(--fs-xs);
  b {
    color: var(--text);
    font-weight: 400;
  }
`;

/* paired bars */
export const Paired = styled.div`
  display: grid;
  gap: var(--s4);
`;
export const PairedRow = styled.div`
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  gap: var(--s3);
  align-items: center;
  @media (max-width: 759px) {
    grid-template-columns: 1fr;
  }
`;
export const PairedLabel = styled.div`
  color: var(--text-2);
  font-size: var(--fs-sm);
`;
export const PairedBars = styled.div`
  display: grid;
  gap: 4px;
`;
export const PairedBar = styled.div`
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr) 4rem;
  align-items: center;
  gap: var(--s2);
`;
export const PairedEntity = styled.span`
  ${num}
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const PairedTrack = styled.span`
  height: 12px;
`;
export const PairedFill = styled.span.attrs<{ $width: number; $color: string }>((p) => ({ style: { width: `${p.$width}%`, background: p.$color } }))`
  display: block;
  height: 100%;
  border-radius: 0 2px 2px 0;
  min-width: 2px;
`;
export const PairedValue = styled.span`
  ${num}
  font-size: var(--fs-sm);
  color: var(--text);
`;

/* small multiples */
export const MiniColumns = styled.figure`
  figcaption {
    color: var(--text-2);
    font-size: var(--fs-xs);
    margin-bottom: var(--s2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;
export const MiniPlot = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: var(--s2);
  height: 112px;
  border-bottom: 1px solid var(--axis);
`;
export const MiniCol = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  align-items: end;
  justify-items: center;
  position: relative;
`;
export const MiniValue = styled.span`
  ${num}
  font-size: 0.6875rem;
  color: var(--text-2);
  margin-bottom: 2px;
  white-space: nowrap;
`;
export const MiniBar = styled.span.attrs<{ $height: number; $emphasis: boolean }>((p) => ({
  style: { height: `${p.$height}%`, background: p.$emphasis ? 'var(--series-1)' : 'var(--series-muted)' },
}))`
  align-self: end;
  width: min(22px, 100%);
  border-radius: 2px 2px 0 0;
`;
export const MiniLabel = styled.span`
  ${num}
  position: absolute;
  bottom: -18px;
  font-size: 0.6875rem;
  color: var(--muted);
`;

/* trend chart */
export const Trend = styled.div`
  display: grid;
  gap: var(--s1);
`;
export const TrendSvg = styled.svg`
  width: 100%;
  height: auto;
  touch-action: none;
  &:focus-visible {
    outline: 2px solid var(--signal);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;
export const TrendGrid = styled.line`
  stroke: var(--grid);
  stroke-width: 1;
`;
export const TrendAxis = styled.line`
  stroke: var(--axis);
  stroke-width: 1;
`;
export const TrendCross = styled.line`
  stroke: var(--text-2);
  stroke-width: 1;
`;
export const TrendTick = styled.text`
  fill: var(--muted);
  font-size: 10px;
  font-family: var(--font-ui);
`;
export const TrendEnd = styled.text`
  fill: var(--text-2);
  font-size: 11px;
  font-family: var(--font-ui);
`;
export const TrendReadout = styled.div`
  display: flex;
  gap: var(--s4);
  min-height: 20px;
  color: var(--text-2);
  font-size: var(--fs-xs);
  span {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
  }
  b {
    color: var(--text);
    font-weight: 400;
  }
`;
export const TrendMonth = styled.span`
  color: var(--text);
  font-weight: 600;
`;
export const TrendHint = styled.span`
  color: var(--muted);
`;
export const TrendTable = styled.details`
  ${disclosure}
  > summary {
    font-size: var(--fs-xs);
  }
  table {
    margin-top: var(--s2);
  }
`;

export const MiniTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  th,
  td {
    padding: 6px var(--s2);
    border-bottom: 1px solid var(--line);
    text-align: right;
    font-weight: 400;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  thead th {
    color: var(--muted);
    font-size: var(--fs-xs);
  }
`;

export const Figure = styled.div`
  dt {
    color: var(--muted);
    font-size: var(--fs-xs);
  }
  dd {
    display: grid;
    gap: 2px;
  }
`;
export const FigureValue = styled.span`
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
`;
export const FigureSub = styled.span`
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
`;
export const NumCell = styled.td`
  ${num}
`;
