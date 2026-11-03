import styled from 'styled-components';
import { enter, enterRow, fade } from '../styles/shared.styles';
import { Cell as TileCell } from './CodeTile.styles';

/* Departures board (suggested analyses) */
export const Departures = styled.section`
  margin-top: var(--s6);
`;
export const Cols = styled.span`
  display: contents;
  color: var(--muted);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  span:first-child {
    display: none;
  }
  @media (max-width: 759px) {
    display: none;
  }
`;
export const StatusHead = styled.span`
  min-width: 3.5rem;
  text-align: right;
  grid-column: 3;
  @media (max-width: 759px) {
    display: none;
  }
`;
export const Head = styled.div`
  display: grid;
  grid-template-columns: 5.25rem minmax(0, 1fr) auto 16px;
  align-items: baseline;
  gap: var(--s4);
  padding: 0 var(--s3) var(--s2);
  border-bottom: 1px solid var(--line-strong);
  animation: ${enter} 520ms var(--ease-out) 360ms backwards;
  h2 {
    grid-column: 1 / 3;
    font-size: var(--fs-lg);
  }
  @media (prefers-reduced-motion: reduce) {
    animation: ${fade} 200ms ease backwards;
  }
`;
export const List = styled.ol`
  list-style: none;
  padding: 0;
`;
export const Item = styled.li<{ $i: number }>`
  ${(p) => enterRow(400 + 40 * Math.min(p.$i, 7))}
`;
export const Question = styled.span`
  color: var(--text);
  font-size: var(--fs-md);
  transition: color var(--t-fast) ease;
`;
export const Departure = styled.button`
  display: grid;
  grid-template-columns: 5.25rem minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: var(--s4);
  width: 100%;
  min-height: 60px;
  padding: var(--s3);
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  text-align: left;
  color: var(--text-2);
  transition: background-color var(--t-fast) ease;
  &:hover:not(:disabled) {
    background: var(--panel);
  }
  &:hover:not(:disabled) ${Question} {
    color: var(--text);
  }
  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  @media (max-width: 759px) {
    grid-template-columns: 3.6rem minmax(0, 1fr) 16px;
    gap: var(--s3);
    padding: var(--s3) var(--s1);
    ${TileCell} {
      font-size: 0.75rem;
    }
  }
  @media (hover: none) {
    &:hover:not(:disabled) {
      background: transparent;
    }
  }
`;
export const Text = styled.span`
  display: grid;
  gap: 2px;
  min-width: 0;
`;
export const Capability = styled.span`
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const Status = styled.span`
  min-width: 3.5rem;
  text-align: right;
  font-size: var(--fs-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
  @media (max-width: 759px) {
    display: none;
  }
`;
