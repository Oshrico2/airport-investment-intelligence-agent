import type { Turn } from '../lib/useChat';
import { ms } from '../lib/format';
import { Icon } from './Icon';
import * as S from './Timeline.styles';

/** Tool-execution timeline: what the agent is doing, with real timings (doubles as the latency readout). */
export function Timeline({ turn }: { turn: Turn }) {
  const live = turn.status === 'streaming';
  return (
    <S.Timeline aria-label="Agent steps" aria-live={live ? 'polite' : 'off'}>
      {turn.steps.map((s) => (
        <S.Step key={s.key}>
          <S.Dot $state={s.state} aria-hidden="true">{s.state === 'done' ? <Icon name="check" size={12} /> : null}</S.Dot>
          <S.Label>{s.label}</S.Label>
          {s.ms !== undefined && <S.Ms>{ms(s.ms)}</S.Ms>}
        </S.Step>
      ))}
      {turn.tools.map((t) => (
        <S.Tool key={t.callId} $error={t.result?.kind === 'error'}>
          <code>{t.name.replace(/^(get|describe)_/, '')}</code>
          <S.Args>{formatArgs(t.args)}</S.Args>
          <S.Ms>{t.ms === undefined ? '…' : ms(t.ms)}</S.Ms>
        </S.Tool>
      ))}
    </S.Timeline>
  );
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
}
