import styled, { css, keyframes } from 'styled-components';
import { Legend } from '../charts/charts.styles';

/* ───────────── Sources, badges, reasons, notes ───────────── */
export const Sources = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  padding: 0;
  list-style: none;
`;
export const Source = styled.li`
  display: inline-flex;
  align-items: center;
  gap: var(--s1);
  padding: 2px var(--s2);
  border-radius: var(--radius);
  background: var(--ground);
  color: var(--text-2);
  font-size: var(--fs-xs);
  svg {
    color: var(--muted);
  }
`;
export const SourceCoverage = styled.span`
  color: var(--muted);
  &::before {
    content: '·';
    margin-right: var(--s1);
  }
`;

export const Badge = styled.span<{ $status: 'complete' | 'partial' | 'excluded' | 'unavailable' }>`
  display: inline-flex;
  align-items: center;
  gap: var(--s1);
  flex: none;
  padding: 2px var(--s2);
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  color: var(--text-2);
  font-size: var(--fs-xs);
  white-space: nowrap;
  ${(p) => p.$status === 'complete' && css`svg { color: var(--up); }`}
  ${(p) => (p.$status === 'partial' || p.$status === 'unavailable') && css`svg { color: var(--warning); }`}
`;

const iconLine = css`
  display: flex;
  gap: var(--s2);
  align-items: flex-start;
  svg {
    flex: none;
    margin-top: 0.2em;
    color: var(--muted);
  }
`;
export const Reasons = styled.ul`
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s1);
  color: var(--text-2);
  font-size: var(--fs-sm);
  li {
    ${iconLine}
  }
`;
export const Note = styled.p<{ $tone: 'info' | 'warn' }>`
  ${iconLine}
  color: var(--text-2);
  font-size: var(--fs-sm);
  line-height: 1.5;
  ${(p) =>
    p.$tone === 'warn' &&
    css`
      padding: var(--s2) var(--s3);
      border-radius: var(--radius);
      background: rgb(250 178 25 / 0.08);
      color: var(--text);
      svg {
        color: var(--warning);
      }
    `}
`;

/* figures and deltas */
export const Delta = styled.span<{ $dir: 'up' | 'down' | 'flat' }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
  color: ${(p) => (p.$dir === 'up' ? 'var(--up)' : p.$dir === 'down' ? 'var(--down)' : 'var(--text-2)')};
`;
export const DeltaSuffix = styled.span`
  margin-left: var(--s1);
  color: var(--muted);
  font-size: var(--fs-xs);
`;

/* ───────────── Cards ───────────── */
export const Card = styled.section<{ $kind: string; $flat?: boolean }>`
  display: grid;
  gap: var(--s4);
  padding: var(--s5);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  min-width: 0;
  ${(p) => p.$flat && css`padding: var(--s4) var(--s5);`}
  ${(p) => p.$kind === 'error' && css`border-color: rgb(255 138 122 / 0.35);`}
  @media (max-width: 759px) {
    padding: var(--s4);
  }
  ${(p) =>
    p.$kind === 'ranking' &&
    css`
      @media (max-width: 420px) {
        ${Legend} {
          display: none;
        }
      }
    `}
`;
export const CardHead = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s4);
`;
export const CardTitle = styled.h3`
  font-size: var(--fs-lg);
  font-weight: 600;
`;
export const CardMeta = styled.p`
  margin-top: var(--s1);
  color: var(--text-2);
  font-size: var(--fs-sm);
`;

/* ───────────── Narrative ───────────── */
export const Narrative = styled.div`
  display: grid;
  gap: var(--s3);
  max-width: 70ch;
  font-size: var(--fs-md);
  line-height: 1.6;
  ul {
    display: grid;
    gap: var(--s1);
    padding-left: 1.1em;
  }
  li::marker {
    color: var(--muted);
  }
  strong {
    font-weight: 600;
    color: var(--text);
  }
`;
const blink = keyframes`
  to {
    visibility: hidden;
  }
`;
export const Caret = styled.span`
  display: inline-block;
  width: 0.5em;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--signal);
  animation: ${blink} 1s steps(2, start) infinite;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
