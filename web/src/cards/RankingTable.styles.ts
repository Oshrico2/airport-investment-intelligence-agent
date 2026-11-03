import styled, { css } from 'styled-components';
import { ScoreTrack } from '../charts/charts.styles';
import { Cell as TileCell } from '../components/CodeTile.styles';
import { Delta } from '../components/ui.styles';
import { num } from '../styles/shared.styles';

/* board table (rankings, comparisons) */
export const AirportMain = styled.span`
  color: var(--text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 28ch;
`;
export const AirportSub = styled.span`
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const AirportName = styled.span`
  display: grid;
  min-width: 0;
`;
export const AirportBtn = styled.button`
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  min-width: 0;
  button&:hover ${AirportMain} {
    color: var(--signal);
  }
`;

export const BoardWrap = styled.div`
  overflow-x: auto;
  margin: 0 calc(-1 * var(--s2));
`;
export const Board = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  th,
  td {
    padding: var(--s2);
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: middle;
    font-weight: 400;
  }
  thead th {
    color: var(--muted);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
    border-bottom-color: var(--line-strong);
  }
  tbody tr {
    transition: background-color var(--t-fast) ease;
  }
  tbody tr:hover {
    background: var(--raised);
  }
  @media (max-width: 759px) {
    ${AirportMain} {
      display: none;
    }
    ${TileCell} {
      font-size: 0.6875rem;
    }
    ${AirportBtn} {
      gap: var(--s2);
    }
    ${Delta} {
      font-size: var(--fs-xs);
    }
    ${ScoreTrack} {
      min-width: 36px;
    }
    ${AirportSub} {
      color: var(--text-2);
      font-size: var(--fs-sm);
    }
    th,
    td {
      padding: var(--s2) 6px;
    }
  }
  @media (hover: none) {
    tbody tr:hover {
      background: transparent;
    }
  }
  @media (max-width: 420px) {
    ${ScoreTrack} {
      display: none;
    }
  }
  @media (max-width: 600px) {
    ${AirportSub} {
      max-width: 8.5rem;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
`;
export const Row = styled.tr<{ $clickable: boolean }>`
  ${(p) => p.$clickable && 'cursor: pointer;'}
`;

/** Column roles: rank, right-aligned figures, the score bar; `$hideSm` drops the column on phones. */
export type Col = 'rank' | 'num' | 'score';
const col = css<{ $col?: Col; $num?: boolean; $hideSm?: boolean }>`
  ${(p) => p.$num && num}
  ${(p) =>
    p.$col === 'rank' &&
    css`
      width: 3rem;
      color: var(--muted);
      text-align: right !important;
    `}
  ${(p) =>
    p.$col === 'num' &&
    css`
      text-align: right !important;
      white-space: nowrap;
    `}
  ${(p) => p.$col === 'score' && 'width: 168px;'}
  @media (max-width: 759px) {
    ${(p) => p.$hideSm && 'display: none;'}
    ${(p) => p.$col === 'score' && 'width: 96px;'}
  }
  @media (max-width: 420px) {
    ${(p) => p.$col === 'score' && 'width: auto;'}
    ${(p) => p.$col === 'rank' && 'width: 2rem;'}
  }
  @media (max-width: 600px) {
    ${(p) => p.$col === 'rank' && 'width: 2rem;'}
  }
`;
export const Th = styled.th<{ $col?: Col; $num?: boolean; $hideSm?: boolean }>`
  ${col}
`;
export const Td = styled.td<{ $col?: Col; $num?: boolean; $hideSm?: boolean }>`
  ${col}
`;
export const ThSort = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  &:hover {
    color: var(--signal);
  }
  ${(p) => p.$active && 'color: var(--signal);'}
  @media (max-width: 600px) {
    svg {
      display: none;
    }
  }
`;
