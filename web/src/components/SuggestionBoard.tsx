import type { Suggestion } from '../lib/api';
import { CodeTile } from './CodeTile';
import { Icon } from './Icon';
import * as S from './SuggestionBoard.styles';

/** "Departures" board of suggested analyses: each row a code tile, the question, its capability and status. */
export function SuggestionBoard({ suggestions, onAsk, disabled, demo }: { suggestions: Suggestion[]; onAsk: (q: string) => void; disabled: boolean; demo: boolean }) {
  return (
    <S.Departures aria-labelledby="departures-title">
      <S.Head>
        <h2 id="departures-title">Departures</h2>
        <S.Cols aria-hidden="true">
          <span>Analysis</span>
          <S.StatusHead>Status</S.StatusHead>
        </S.Cols>
      </S.Head>
      <S.List>
        {suggestions.map((s, i) => (
          <S.Item key={s.id} $i={i}>
            <S.Departure type="button" onClick={() => onAsk(s.question)} disabled={disabled}>
              <CodeTile code={s.tile} delay={120 + i * 40} />
              <S.Text>
                <S.Question>{s.question}</S.Question>
                <S.Capability>{s.capability}</S.Capability>
              </S.Text>
              <S.Status>{demo ? 'Demo' : 'Ready'}</S.Status>
              <Icon name="chevron" size={16} />
            </S.Departure>
          </S.Item>
        ))}
      </S.List>
    </S.Departures>
  );
}
