import styled from 'styled-components';

/* Provider selector (composer bar) */
export const Provider = styled.fieldset`
  display: inline-flex;
  flex: none;
  margin: 0;
  padding: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  min-inline-size: 0;
`;
export const Option = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 var(--s3);
  border-radius: 3px;
  color: var(--muted);
  font-size: var(--fs-xs);
  cursor: pointer;
  transition: color var(--t-fast) ease, background-color var(--t-fast) ease;
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }
  &:hover {
    color: var(--text-2);
  }
  &:has(input:checked) {
    background: var(--raised);
    color: var(--text);
  }
  &:has(input:focus-visible) {
    outline: 2px solid var(--signal);
    outline-offset: 1px;
  }
  &:has(input:disabled) {
    color: var(--muted);
    opacity: 0.45;
    cursor: not-allowed;
  }
  ${Provider}:disabled &:has(input:checked) {
    opacity: 1;
  }
  ${Provider}:disabled &:not(:has(input:checked)) {
    display: none; /* locked thread: show only the provider answering it */
  }
`;
