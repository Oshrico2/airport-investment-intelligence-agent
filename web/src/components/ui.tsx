import type { ReactNode } from 'react';
import type { Quality, SourceRef } from '../../../shared/api';
import { coverageLabel, dateLabel, direction, signedPct } from '../lib/format';
import { Num } from '../styles/shared.styles';
import { Icon } from './Icon';
import * as S from './ui.styles';

const SOURCE_SHORT: Record<SourceRef['id'], string> = {
  r495: 'BTS T-100 airport traffic',
  fmg: 'BTS T-100 route segments',
  delayCauses: 'BTS on-time & delay causes',
  lookupAirportId: 'BTS airport lookup',
};

/** Source + coverage + retrieval on every block (R8′). */
export function SourceChips({ sources }: { sources: SourceRef[] }) {
  const unique = [...new Map(sources.map((s) => [s.id, s])).values()];
  return (
    <S.Sources aria-label="Sources">
      {unique.map((s) => (
        <S.Source key={s.id} title={`${s.name}. Retrieved ${dateLabel(s.retrievedAt)}; BTS data version ${dateLabel(s.vintage)}.`}>
          <Icon name="source" size={14} />
          <span>{SOURCE_SHORT[s.id]}</span>
          {s.coverage.from && <S.SourceCoverage>{coverageLabel(s.coverage)}</S.SourceCoverage>}
        </S.Source>
      ))}
    </S.Sources>
  );
}

const QUALITY: Record<Quality['status'], { label: string; icon: 'check' | 'warn' | 'info' }> = {
  complete: { label: 'Complete data', icon: 'check' },
  partial: { label: 'Partial data', icon: 'warn' },
  excluded: { label: 'Not ranked', icon: 'info' },
  unavailable: { label: 'Unavailable', icon: 'warn' },
};

export function QualityBadge({ quality }: { quality: Quality }) {
  const q = QUALITY[quality.status];
  return (
    <S.Badge $status={quality.status} title={quality.reasons.map((r) => r.message).join('\n') || q.label}>
      <Icon name={q.icon} size={14} />
      {q.label}
    </S.Badge>
  );
}

export function Reasons({ reasons }: { reasons: { code: string; message: string }[] }) {
  if (!reasons.length) return null;
  return (
    <S.Reasons>
      {reasons.map((r) => (
        <li key={r.code + r.message}>
          <Icon name="info" size={14} />
          {r.message}
        </li>
      ))}
    </S.Reasons>
  );
}

/** Signed change with an arrow, so direction never depends on color alone. */
export function Delta({ value, suffix, neutral = false }: { value: number | null | undefined; suffix?: string; neutral?: boolean }) {
  const d = direction(value);
  return (
    <S.Delta $dir={neutral ? 'flat' : d}>
      {d !== 'flat' && <Icon name={d} size={13} />}
      <Num>{signedPct(value)}</Num>
      {suffix && <S.DeltaSuffix>{suffix}</S.DeltaSuffix>}
    </S.Delta>
  );
}

export function Card({ title, meta, children, actions, kind }: { title: ReactNode; meta?: ReactNode; children: ReactNode; actions?: ReactNode; kind: string }) {
  return (
    <S.Card $kind={kind} data-testid={`card-${kind}`}>
      <S.CardHead>
        <div>
          <S.CardTitle>{title}</S.CardTitle>
          {meta && <S.CardMeta>{meta}</S.CardMeta>}
        </div>
        {actions}
      </S.CardHead>
      {children}
    </S.Card>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <S.Note $tone={tone}>
      <Icon name={tone === 'warn' ? 'warn' : 'info'} size={15} />
      <span>{children}</span>
    </S.Note>
  );
}

const BULLET = /^\s*[-•*]\s+/;

/**
 * Renders the model's plain-text narrative: paragraphs, "- " bullets and **bold**, as React text (never HTML).
 * Within a paragraph, consecutive bullet lines become one list and other lines become text, so a lead-in line
 * followed by bullets (the Demo reply listing the supported questions, many model answers) keeps its list.
 */
export function Narrative({ text, streaming }: { text: string; streaming: boolean }) {
  const runs: { list: boolean; lines: string[] }[] = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    let prev: (typeof runs)[number] | undefined;
    for (const line of block.split('\n')) {
      const list = BULLET.test(line);
      if (prev && prev.list === list) prev.lines.push(list ? line.replace(BULLET, '') : line);
      else runs.push((prev = { list, lines: [list ? line.replace(BULLET, '') : line] }));
    }
  }
  return (
    <S.Narrative data-testid="narrative">
      {runs.map((run, ri) => {
        const caret = streaming && ri === runs.length - 1 && <Caret />;
        return run.list ? (
          <ul key={ri}>
            {run.lines.map((l, li) => (
              <li key={li} dir="auto">
                {inline(l)}
                {li === run.lines.length - 1 && caret}
              </li>
            ))}
          </ul>
        ) : (
          <p key={ri} dir="auto">
            {inline(run.lines.join(' '))}
            {caret}
          </p>
        );
      })}
    </S.Narrative>
  );
}

const Caret = () => <S.Caret data-testid="caret" aria-hidden="true" />;

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.replace(/\*/g, '')));
}
