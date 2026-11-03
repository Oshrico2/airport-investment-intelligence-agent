import styled, { css, keyframes } from 'styled-components';

/* Split-flap tiles (signature move) */
const flap = keyframes`
  from {
    transform: rotateX(-65deg);
    opacity: 0.4;
  }
`;

export const Cell = styled.span`
  position: relative;
  display: grid;
  place-items: center;
  width: 1.3em;
  height: 1.75em;
  border-radius: 3px;
  background: linear-gradient(to bottom, var(--tile-top) 0 50%, var(--tile-bottom) 50% 100%);
  color: var(--tile-ink);
  font-size: 0.9375rem;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07), 0 1px 0 rgb(0 0 0 / 0.5);
  animation: ${flap} 110ms var(--ease-out);
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: rgb(0 0 0 / 0.55);
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const Tile = styled.span<{ $size: 'sm' | 'md' | 'lg'; $tone: 'board' | 'signal' }>`
  display: inline-flex;
  gap: 2px;
  flex: none;
  font-family: var(--font-data);
  font-weight: 700;
  text-transform: uppercase;
  line-height: 1;
  perspective: 300px;
  ${(p) => p.$size === 'sm' && css`${Cell} { font-size: 0.75rem; }`}
  ${(p) => p.$size === 'lg' && css`${Cell} { font-size: 1.25rem; }`}
  ${(p) =>
    p.$tone === 'signal' &&
    css`
      ${Cell} {
        background: linear-gradient(to bottom, var(--tile-signal-top) 0 50%, var(--tile-signal-bottom) 50% 100%);
        color: var(--signal-ink);
      }
      ${Cell}::after {
        background: rgb(10 15 24 / 0.35);
      }
    `}
`;
