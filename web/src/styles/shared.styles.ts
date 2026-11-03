import styled, { css, keyframes } from 'styled-components';

/* ───────────── Motion ───────────── */
export const fade = keyframes`
  from {
    opacity: 0;
  }
`;
/** Load choreography entrance: transform and opacity only, direction set by --enter-x / --enter-y. */
export const enter = keyframes`
  from {
    opacity: 0;
    transform: translate3d(var(--enter-x, 0), var(--enter-y, 12px), 0);
  }
`;
/** Staggered entrance of list rows; reduced motion keeps the stagger but only fades. */
export const enterRow = (delayMs: number) => css`
  --enter-y: 8px;
  animation: ${enter} 460ms var(--ease-out) ${delayMs}ms backwards;
  @media (prefers-reduced-motion: reduce) {
    animation: ${fade} 200ms ease ${delayMs}ms backwards;
  }
`;
const shimmer = keyframes`
  to {
    background-position: -200% 0;
  }
`;

/* ───────────── Utilities ───────────── */
export const num = css`
  font-variant-numeric: tabular-nums;
`;
export const Num = styled.span`
  ${num}
`;
export const VisuallyHidden = styled.span`
  position: absolute !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;
export const Muted = styled.span`
  color: var(--muted);
`;
export const ErrorText = styled.p`
  color: var(--down);
`;
export const Kbd = styled.kbd`
  font-family: var(--font-ui);
  font-size: 0.6875rem;
  padding: 1px 5px;
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  border-radius: 3px;
  color: var(--text-2);
`;
export const Skeleton = styled.div<{ $tall?: boolean }>`
  height: ${(p) => (p.$tall ? '320px' : '140px')};
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--panel) 0%, var(--raised) 50%, var(--panel) 100%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.2s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
export const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  margin-bottom: var(--s3);
  h2 {
    font-size: var(--fs-lg);
  }
`;

/* details disclosure: drawn chevron instead of the native triangle */
export const disclosure = css`
  > summary {
    cursor: pointer;
    color: var(--text-2);
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
  }
  > summary:hover {
    color: var(--signal);
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary::before {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
    transition: transform var(--t-fast) var(--ease-out);
  }
  &[open] > summary::before {
    transform: rotate(45deg);
  }
`;

/* ───────────── Buttons ───────────── */
export const Btn = styled.button<{ $variant: 'primary' | 'ghost'; $size?: 'sm' }>`
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  min-height: 38px;
  padding: 0 var(--s4);
  border-radius: var(--radius);
  border: 1px solid transparent;
  font-weight: 600;
  font-size: var(--fs-sm);
  transition: transform var(--t-fast) var(--ease-out), background-color var(--t-fast) ease, border-color var(--t-fast) ease, opacity var(--t-fast) ease;
  &:active:not(:disabled) {
    transform: scale(0.97);
  }
  ${(p) =>
    p.$variant === 'primary'
      ? css`
          background: var(--signal);
          color: var(--signal-ink);
          &:hover:not(:disabled) {
            background: var(--signal-hover);
          }
          &:disabled {
            background: var(--raised);
            border-color: var(--signal-line);
            color: var(--muted);
            cursor: not-allowed;
          }
        `
      : css`
          background: transparent;
          border-color: var(--line-strong);
          color: var(--text);
          &:hover {
            background: var(--raised);
          }
        `}
  ${(p) =>
    p.$size === 'sm' &&
    css`
      min-height: 32px;
      padding: 0 var(--s3);
      font-size: var(--fs-xs);
    `}
`;
export const IconBtn = styled.button`
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  &:hover {
    background: var(--raised);
    color: var(--text);
  }
`;
export const LinkBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font-size: var(--fs-sm);
  text-decoration: underline;
  text-decoration-color: var(--line-strong);
  text-underline-offset: 0.2em;
  &:hover {
    color: var(--signal);
    text-decoration-color: var(--signal-line);
  }
`;

/* ───────────── Views (Rankings, Method) ───────────── */
export const View = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--s6);
  display: grid;
  gap: var(--s5);
  @media (max-width: 759px) {
    padding: var(--s5) var(--s4) var(--s6);
  }
`;
export const ViewHead = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s5);
  flex-wrap: wrap;
  h1 {
    font-size: var(--fs-2xl);
  }
`;
export const ViewLede = styled.p`
  margin-top: var(--s2);
  max-width: 70ch;
  color: var(--text-2);
`;
