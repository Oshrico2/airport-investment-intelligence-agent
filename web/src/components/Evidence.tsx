import { useEffect, useRef, type ReactNode } from 'react';
import type { AirportProfileResult, LiveStatus, SourceRef, ToolResult } from '../../../shared/api';
import { AirportCard } from '../cards/cards';
import { coverageLabel, dateLabel, ms } from '../lib/format';
import type { Turn } from '../lib/useChat';
import { IconBtn, PanelHead, Skeleton } from '../styles/shared.styles';
import * as S from './Evidence.styles';
import { Icon } from './Icon';
import { Note } from './ui';

/** Limitations and quality notes carried by the tool results of one answer. */
export function evidenceOf(turn: Turn) {
  const results = turn.tools.map((t) => t.result).filter((r): r is ToolResult => !!r && r.kind !== 'error');
  const sources = new Map<string, SourceRef>();
  const limits = new Set<string>();
  const quality = new Set<string>();
  for (const r of results) {
    if ('sources' in r) r.sources.forEach((s) => sources.set(s.id, s));
    if (r.kind === 'longHaul') r.limitations.forEach((l) => limits.add(l));
    if (r.kind === 'delays') r.notes.forEach((l) => limits.add(l));
    if (r.kind === 'capacity') r.cannotInfer.forEach((l) => limits.add(l));
    if (r.kind === 'airportProfile') limits.add('Departing passengers are enplanements (BTS T-100 segment data), not total airport footfall.');
    if (r.kind === 'ranking') limits.add(`Only airports with ≥${r.method.threshold.toLocaleString('en-US')} departing passengers in 2025 and complete 2024 and 2025 data are ranked; delays are not part of the score.`);
    if ('quality' in r) r.quality.reasons.forEach((q) => quality.add(q.message));
    if (r.kind === 'delays') r.airports.forEach((a) => a.quality.reasons.forEach((q) => quality.add(q.message)));
  }
  return { sources: [...sources.values()], limits: [...limits], quality: [...quality] };
}

export function EvidenceBody({ turn, live }: { turn: Turn; live: LiveStatus | null }) {
  const ev = evidenceOf(turn);
  return (
    <S.Evidence>
      <section>
        <h3>Sources</h3>
        <S.Sources>
          {ev.sources.map((s) => (
            <li key={s.id}>
              <b>{s.name}</b>
              <span>{s.coverage.from ? `${coverageLabel(s.coverage)} · ` : ''}retrieved {dateLabel(s.retrievedAt)}</span>
            </li>
          ))}
        </S.Sources>
        {live && live.state !== 'not-checked' && <Note tone={live.state === 'current' ? 'info' : 'warn'}>{live.message}</Note>}
      </section>
      {ev.quality.length > 0 && (
        <section>
          <h3>Data quality</h3>
          <S.List>{ev.quality.map((q) => <li key={q}>{q}</li>)}</S.List>
        </section>
      )}
      {ev.limits.length > 0 && (
        <section>
          <h3>Limits of this answer</h3>
          <S.List>{ev.limits.map((l) => <li key={l}>{l}</li>)}</S.List>
        </section>
      )}
      {turn.timings && (
        <section>
          <h3>Latency</h3>
          <S.Timings>
            {turn.timings.modelRounds.map((m, i) => (
              <div key={i}><dt>{turn.timings?.models?.[i] ?? 'Model'} · round {i + 1}</dt><dd>{ms(m)}</dd></div>
            ))}
            <div><dt>BTS tools</dt><dd>{ms(turn.timings.toolsMs)}</dd></div>
            {turn.timings.firstTextMs !== null && turn.timings.modelRounds.length > 0 && <div><dt>First words</dt><dd>{ms(turn.timings.firstTextMs)}</dd></div>}
            <div><dt>Total (server)</dt><dd>{ms(turn.timings.totalMs)}</dd></div>
            {turn.clientMs !== undefined && <div><dt>Total (browser)</dt><dd>{ms(turn.clientMs)}</dd></div>}
          </S.Timings>
        </section>
      )}
    </S.Evidence>
  );
}

export function AirportPanel({ state, onClose }: { state: { code: string; data?: AirportProfileResult; error?: string }; onClose: () => void }) {
  return (
    <S.AirportPanel>
      <PanelHead>
        <h2>Airport profile</h2>
        <IconBtn type="button" onClick={onClose} aria-label="Close airport profile">
          <Icon name="close" />
        </IconBtn>
      </PanelHead>
      {state.data ? <AirportCard r={state.data} /> : state.error ? <Note tone="warn">{state.error}</Note> : <Skeleton $tall aria-label={`Loading ${state.code}`} />}
    </S.AirportPanel>
  );
}

/** Mobile bottom sheet: native <dialog> (focus trap, Esc to close), drawer curve, no motion when reduced. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <S.Sheet ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label={title}>
      <S.SheetBody>
        <PanelHead>
          <h2>{title}</h2>
          <IconBtn type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </IconBtn>
        </PanelHead>
        {children}
      </S.SheetBody>
    </S.Sheet>
  );
}
