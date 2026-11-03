import styled from 'styled-components';
import { enterRow, num } from '../styles/shared.styles';

/* National board (side panel, and below the home question on narrow screens) */
export const National = styled.section``;
export const Sub = styled.p`
  margin: calc(-1 * var(--s2)) 0 var(--s3);
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const List = styled.ol`
  list-style: none;
  padding: 0;
  margin-bottom: var(--s4);
  border-top: 1px solid var(--line);
`;
export const Item = styled.li<{ $i: number }>`
  ${(p) => enterRow(260 + 35 * Math.min(p.$i, 9))}
`;
export const Row = styled.button`
  display: grid;
  grid-template-columns: 1.6rem auto minmax(0, 1fr) 128px;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  min-height: 48px;
  padding: var(--s2) var(--s1);
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  text-align: left;
  color: var(--text-2);
  transition: background-color var(--t-fast) ease;
  &:hover {
    background: var(--panel);
  }
  @media (max-width: 759px) {
    grid-template-columns: 1.4rem auto minmax(0, 1fr) 104px;
  }
  @media (hover: none) {
    &:hover {
      background: transparent;
    }
  }
`;
export const Rank = styled.span`
  ${num}
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: right;
`;
export const City = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--fs-sm);
`;
