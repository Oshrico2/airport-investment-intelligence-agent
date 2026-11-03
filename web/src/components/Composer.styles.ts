import styled, { css, keyframes } from 'styled-components';
import { IconBtn } from '../styles/shared.styles';
import { Option as ProviderOption, Provider } from './ProviderPicker.styles';

const recPulse = keyframes`
  50% {
    opacity: 0.3;
  }
`;

export const Textarea = styled.textarea<{ $compact: boolean }>`
  display: block;
  width: 100%;
  min-height: 3.5rem;
  max-height: 200px;
  padding: var(--s4) var(--s4) var(--s2);
  border: 0;
  background: transparent;
  resize: none;
  font-size: var(--fs-lg);
  line-height: 1.45;
  outline: none;
  &::placeholder {
    color: var(--muted);
  }
  ${(p) =>
    p.$compact &&
    css`
      min-height: 2.75rem;
      font-size: var(--fs-md);
      padding-top: var(--s3);
    `}
`;
export const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  padding: var(--s2) var(--s2) var(--s2) var(--s4);
  /* Narrow composers (phones, and laptops with the side panel): the provider choice gets its own full-width row,
     so the listening status, its meter, the voice controls and Ask share the row below. */
  @container (max-width: 720px) {
    flex-wrap: wrap;
    row-gap: var(--s2);
    ${Provider} {
      flex-basis: 100%;
    }
    ${ProviderOption} {
      flex: 1;
      justify-content: center;
    }
  }
`;
export const Voice = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto; /* pushes voice controls and the send button to the right */
  flex: none;
`;
export const Hint = styled.span`
  color: var(--muted);
  font-size: var(--fs-xs);
  @media (max-width: 759px) {
    display: none;
  }
`;
export const Lang = styled.button`
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  transition: color var(--t-fast) ease, background-color var(--t-fast) ease;
  &:hover:not(:disabled) {
    color: var(--text-2);
    background: var(--raised);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;
export const Mic = styled(IconBtn)`
  &[aria-pressed='true'] {
    color: var(--signal);
    background: var(--signal-soft);
    box-shadow: inset 0 0 0 1px var(--signal-line);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;
export const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  white-space: nowrap;
  color: var(--text-2);
  font-size: var(--fs-xs);
`;
export const Rec = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--signal);
  animation: ${recPulse} 1.2s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
export const Esc = styled.span`
  @media (max-width: 759px) {
    display: none;
  }
  @container (max-width: 720px) {
    display: none; /* keep the status on one line; Cancel stays */
  }
`;
export const Meter = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
`;
export const MeterBars = styled.span`
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
`;
export const MeterSeg = styled.span<{ $on: boolean; $hot: boolean }>`
  width: 3px;
  height: 100%;
  border-radius: 1px;
  background: ${(p) => (!p.$on ? 'var(--line-strong)' : p.$hot ? 'var(--warning)' /* near full scale: about to clip */ : 'var(--signal)')};
`;
export const VoiceError = styled.p`
  display: flex;
  align-items: flex-start;
  gap: var(--s2);
  margin: 0;
  padding: 0 var(--s4) var(--s3);
  color: var(--warning);
  font-size: var(--fs-xs);
`;

export const Form = styled.form<{ $compact: boolean; $listening: boolean }>`
  container-type: inline-size; /* the listening status adapts to the composer's own width */
  margin-top: ${(p) => (p.$compact ? '0' : 'var(--s5)')};
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  transition: border-color var(--t-fast) ease, box-shadow var(--t-fast) ease;
  &:focus-within {
    border-color: var(--signal-line);
    box-shadow: 0 0 0 3px var(--signal-soft);
  }
  ${(p) =>
    p.$listening &&
    css`
      ${Textarea} {
        color: var(--text-2); /* interim transcript: still being recognised */
      }
      @container (max-width: 480px) {
        ${Lang} {
          display: none;
        }
      }
    `}
`;
