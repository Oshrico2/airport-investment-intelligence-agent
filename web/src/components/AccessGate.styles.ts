import styled from 'styled-components';
import { enter } from '../styles/shared.styles';

export const Screen = styled.main`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--s5) var(--s4);
  background: var(--ground);
`;
export const Card = styled.form`
  display: grid;
  gap: var(--s3);
  width: min(440px, 100%);
  padding: var(--s6);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  animation: ${enter} 460ms var(--ease-out) backwards;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
  @media (max-width: 479px) {
    padding: var(--s5);
  }
  h1 {
    font-size: var(--fs-xl);
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  p:not([role='alert']) {
    color: var(--text-2);
    font-size: var(--fs-sm);
  }
  label {
    margin-top: var(--s2);
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  button {
    justify-content: center;
  }
`;
export const Mark = styled.img`
  display: block;
`;
export const Input = styled.input`
  width: 100%;
  min-height: 44px;
  padding: 0 var(--s3);
  background: var(--ground);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-family: var(--font-data);
  font-size: var(--fs-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  &::placeholder {
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  &:focus-visible {
    border-color: var(--signal-line);
    outline: none;
    box-shadow: 0 0 0 3px var(--signal-soft);
  }
  &[aria-invalid='true'] {
    border-color: var(--down);
  }
`;
export const Note = styled.p`
  && {
    margin-top: var(--s2);
    color: var(--muted);
    font-size: var(--fs-xs);
  }
`;
