import styled from 'styled-components';
import { SourceList } from '../cards/cards.styles';
import { num } from '../styles/shared.styles';
import { Card } from './ui.styles';

export const Evidence = styled.div`
  display: grid;
  gap: var(--s5);
  h3 {
    font-size: var(--fs-sm);
    color: var(--text-2);
    margin-bottom: var(--s2);
  }
`;
export const Sources = styled(SourceList)`
  margin-bottom: var(--s3);
`;
export const List = styled.ul`
  display: grid;
  gap: var(--s2);
  padding-left: 1.1em;
  color: var(--text-2);
  font-size: var(--fs-sm);
`;
export const Timings = styled.dl`
  display: grid;
  gap: var(--s1);
  font-size: var(--fs-sm);
  div {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid var(--line);
    padding: 4px 0;
  }
  dt {
    color: var(--text-2);
  }
  dd {
    ${num}
  }
`;

export const AirportPanel = styled.div`
  ${Card} {
    padding: var(--s4);
  }
`;

/* Mobile bottom sheet */
export const Sheet = styled.dialog`
  width: 100%;
  max-width: none;
  max-height: 88dvh;
  margin: auto 0 0;
  padding: 0;
  border: 0;
  border-top: 1px solid var(--line-strong);
  border-radius: 14px 14px 0 0;
  background: var(--rail);
  color: var(--text);
  transition: transform 300ms var(--ease-drawer), opacity 200ms ease, display 300ms allow-discrete, overlay 300ms allow-discrete;
  transform: translateY(0);
  &[open] {
    @starting-style {
      transform: translateY(100%);
    }
  }
  &::backdrop {
    background: rgb(0 0 0 / 0.55);
  }
  @media (prefers-reduced-motion: reduce) {
    &[open] {
      @starting-style {
        transform: none;
        opacity: 0;
      }
    }
  }
`;
export const SheetBody = styled.div`
  padding: var(--s4) var(--s4) calc(var(--s5) + env(safe-area-inset-bottom));
  overflow-y: auto;
  max-height: 88dvh;
`;
