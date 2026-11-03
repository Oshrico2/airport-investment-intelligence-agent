import styled, { keyframes } from 'styled-components';
import { fade } from '../styles/shared.styles';

const rise = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
`;

export const Turn = styled.article`
  display: grid;
  gap: var(--s4);
  animation: ${rise} 220ms var(--ease-out);
  @media (prefers-reduced-motion: reduce) {
    animation: ${fade} 160ms ease;
  }
`;
export const Question = styled.header`
  p {
    display: inline-block;
    max-width: 64ch;
    padding: var(--s3) var(--s4);
    border-radius: var(--radius-lg);
    background: var(--raised);
    font-size: var(--fs-lg);
  }
`;
export const Cards = styled.div`
  display: grid;
  gap: var(--s4);
`;
export const Answer = styled.div`
  display: grid;
  gap: var(--s2);
`;
export const Waiting = styled.p`
  color: var(--muted);
`;
export const ModeTag = styled.span`
  justify-self: start;
  padding: 2px var(--s2);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const Foot = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  flex-wrap: wrap;
  color: var(--muted);
  font-size: var(--fs-xs);
`;
