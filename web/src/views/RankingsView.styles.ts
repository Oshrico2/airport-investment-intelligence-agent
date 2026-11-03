import styled from 'styled-components';

export { Excluded, ExcludedReason } from '../cards/cards.styles';
export { Card } from '../components/ui.styles';

export const Select = styled.label`
  display: grid;
  gap: var(--s1);
  font-size: var(--fs-xs);
  color: var(--muted);
  select {
    min-width: 260px;
    min-height: 40px;
    padding: 0 var(--s3);
    border-radius: var(--radius);
    border: 1px solid var(--line-strong);
    background: var(--panel);
    color: var(--text);
    font-size: var(--fs-md);
  }
`;
export const Meta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s3);
  flex-wrap: wrap;
  color: var(--text-2);
  font-size: var(--fs-sm);
`;
