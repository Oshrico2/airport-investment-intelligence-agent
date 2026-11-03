import { memo } from 'react';
import { ToolCard, type CardActions } from '../cards/cards';
import { ms } from '../lib/format';
import type { Turn } from '../lib/useChat';
import { Btn, Num, Skeleton } from '../styles/shared.styles';
import { Icon } from './Icon';
import * as S from './TurnView.styles';
import { Narrative, Note } from './ui';
import { Timeline } from './Timeline';

/** One question and its answer: timeline, deterministic cards (as soon as tools return), streamed narrative. */
export const TurnView = memo(function TurnView({ turn, actions, onEvidence, selected }: { turn: Turn; actions: CardActions; onEvidence: () => void; selected: boolean }) {
  const streaming = turn.status === 'streaming';
  const results = turn.tools.filter((t) => t.result);
  return (
    <S.Turn data-selected={selected || undefined} aria-busy={streaming}>
      <S.Question>
        <p dir="auto">{turn.question}</p>
      </S.Question>
      <Timeline turn={turn} />
      {results.length > 0 && (
        <S.Cards data-testid="turn-cards">
          {results.map((t, i) => (
            <ToolCard key={t.callId} result={t.result!} actions={actions} repeat={results.findIndex((x) => x.result!.kind === t.result!.kind) < i} />
          ))}
        </S.Cards>
      )}
      {streaming && results.length === 0 && turn.tools.length > 0 && <Skeleton aria-hidden="true" />}
      {(turn.text || streaming) && (
        <S.Answer>
          {turn.mode === 'demo' && <S.ModeTag data-testid="mode-tag">Demo mode · template, no AI</S.ModeTag>}
          {turn.text ? <Narrative text={turn.mode === 'demo' ? turn.text.replace(/^Demo mode summary \(template, no AI\): /, '') : turn.text} streaming={streaming} /> : streaming && <S.Waiting>{turn.steps.at(-1)?.label ?? 'Working'}…</S.Waiting>}
        </S.Answer>
      )}
      {turn.warnings.map((w) => (
        <Note key={w} tone="warn">{w}</Note>
      ))}
      {turn.error && <Note tone="warn">{turn.error}</Note>}
      {turn.status === 'stopped' && <Note>Stopped.</Note>}
      {!streaming && (
        <S.Foot>
          {turn.timings && (
            <Num title="Model rounds · tools · total server time">
              {turn.timings.modelRounds.length ? `${turn.provider === 'claude' ? 'Claude' : 'Gemini'} ${turn.timings.modelRounds.map(ms).join(' + ')} · ` : ''}tools {ms(turn.timings.toolsMs)} · total {ms(turn.timings.totalMs)}
            </Num>
          )}
          {results.length > 0 && (
            <Btn type="button" $variant="ghost" $size="sm" onClick={onEvidence}>
              <Icon name="source" size={15} /> Sources & limits
            </Btn>
          )}
        </S.Foot>
      )}
    </S.Turn>
  );
});
