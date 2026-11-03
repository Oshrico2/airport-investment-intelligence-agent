import styled, { css, keyframes } from 'styled-components';
import { num } from '../styles/shared.styles';

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

export const Timeline = styled.ol`
  list-style: none;
  padding: 0;
  display: grid;
  gap: 2px;
  font-size: var(--fs-sm);
  color: var(--text-2);
`;
const line = css`
  display: flex;
  align-items: center;
  gap: var(--s2);
  min-height: 24px;
`;
export const Step = styled.li`
  ${line}
`;
export const Dot = styled.span<{ $state: 'active' | 'done' }>`
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
  color: var(--signal-ink);
  flex: none;
  ${(p) =>
    p.$state === 'active'
      ? css`
          border-color: var(--signal);
          border-top-color: transparent;
          animation: ${spin} 700ms linear infinite;
          @media (prefers-reduced-motion: reduce) {
            animation: none;
            border-top-color: var(--signal);
            opacity: 0.6;
          }
        `
      : css`
          border-color: var(--signal);
          background: var(--signal);
        `}
`;
export const Label = styled.span`
  color: var(--text);
`;
export const Ms = styled.span`
  ${num}
  color: var(--muted);
  font-size: var(--fs-xs);
`;
export const Tool = styled.li<{ $error: boolean }>`
  ${line}
  padding-left: 24px;
  color: var(--muted);
  code {
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    font-weight: 600;
    color: ${(p) => (p.$error ? 'var(--down)' : 'var(--text-2)')};
  }
`;
export const Args = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 46ch;
  font-size: var(--fs-xs);
`;
