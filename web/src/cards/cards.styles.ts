import styled, { css } from 'styled-components';
import { disclosure, Muted, num } from '../styles/shared.styles';

export { MiniTable, NumCell } from '../charts/charts.styles';
export { AirportBtn, AirportMain, AirportName, AirportSub, Board, BoardWrap, Td, Th } from './RankingTable.styles';

const subhead = css`
  h4 {
    color: var(--text-2);
    font-size: var(--fs-xs);
    font-weight: 600;
    margin-bottom: var(--s1);
  }
`;
const bullets = css`
  display: grid;
  gap: var(--s1);
  padding-left: 1.1em;
`;
const tileGrid = css`
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--s2) var(--s4);
  font-size: var(--fs-sm);
  color: var(--text-2);
`;

export const CardSub = styled.span`
  display: block;
  margin-top: 2px;
  color: var(--text-2);
  font-size: var(--fs-sm);
  font-weight: 400;
`;
export const CardFoot = styled.p`
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const TitleWithTile = styled.span`
  display: flex;
  align-items: center;
  gap: var(--s3);
`;
export const RankPill = styled.span`
  flex: none;
  padding: var(--s1) var(--s3);
  border-radius: var(--radius);
  border: 1px solid var(--line-strong);
  color: var(--text);
  font-weight: 600;
  font-size: var(--fs-lg);
  font-variant-numeric: tabular-nums;
  small {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: var(--fs-xs);
  }
`;
export const MutedNum = styled(Muted)`
  ${num}
`;

/* excluded, method details */
export const ExcludedName = styled.span`
  color: var(--text);
`;
export const ExcludedReason = styled.span`
  color: var(--muted);
  font-size: var(--fs-xs);
  @media (max-width: 759px) {
    grid-column: 1 / -1;
  }
`;
export const Excluded = styled.details`
  border-top: 1px solid var(--line);
  padding-top: var(--s3);
  font-size: var(--fs-sm);
  ${disclosure}
  > summary {
    width: fit-content;
  }
  ul {
    list-style: none;
    padding: 0;
    margin-top: var(--s3);
    display: grid;
    gap: var(--s2);
  }
  li {
    display: grid;
    grid-template-columns: auto minmax(8rem, 14rem) 1fr;
    align-items: center;
    gap: var(--s3);
  }
  @media (max-width: 759px) {
    li {
      grid-template-columns: auto 1fr;
    }
  }
`;
export const Method = styled.details`
  font-size: var(--fs-sm);
  color: var(--text-2);
  ${disclosure}
  > summary {
    width: fit-content;
  }
  ul {
    ${bullets}
  }
  p {
    margin: var(--s2) 0;
  }
`;
export const Points = styled.ul`
  ${bullets}
  color: var(--text-2);
  font-size: var(--fs-sm);
  line-height: 1.55;
`;

/* figures and headline */
export const Figures = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: var(--s4) var(--s5);
`;
export const Ytd = styled.div`
  ${subhead}
  p {
    font-size: var(--fs-sm);
  }
`;
export const Headline = styled.p`
  display: flex;
  align-items: baseline;
  gap: var(--s3);
  flex-wrap: wrap;
`;
export const HeadlineValue = styled.span`
  font-family: var(--font-ui);
  font-variant-numeric: normal;
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  @media (max-width: 759px) {
    font-size: 2.5rem;
  }
`;
export const HeadlineText = styled.span`
  color: var(--text-2);
  max-width: 32ch;
`;

/* capacity */
export const Multiples = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--s4);
  padding-bottom: var(--s4);
  @media (max-width: 1400px) {
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  }
`;
export const Changes = styled.ul`
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s2);
  font-size: var(--fs-sm);
  color: var(--text-2);
`;
export const ChangesVs = styled.span`
  display: inline-block;
  min-width: 4.5rem;
  color: var(--text);
  font-weight: 600;
`;
export const Infer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
  font-size: var(--fs-sm);
  color: var(--text-2);
  ${subhead}
  ul {
    ${bullets}
  }
  @media (max-width: 759px) {
    grid-template-columns: 1fr;
  }
`;

/* destinations, candidates, sources */
export const Dests = styled.div`
  ${subhead}
  ol {
    ${tileGrid}
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }
`;
export const Candidates = styled.ul`
  ${tileGrid}
`;
export const SourceList = styled.ul`
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s3);
  font-size: var(--fs-sm);
  li {
    display: grid;
    gap: 2px;
  }
  span {
    color: var(--muted);
    font-size: var(--fs-xs);
  }
  b {
    font-weight: 600;
  }
`;
