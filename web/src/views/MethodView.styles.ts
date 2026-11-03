import styled from 'styled-components';
import { Card } from '../components/ui.styles';

export { Points } from '../cards/cards.styles';
export { Card, CardTitle } from '../components/ui.styles';

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
  gap: var(--s4);
  ${Card} {
    align-content: start;
  }
`;
