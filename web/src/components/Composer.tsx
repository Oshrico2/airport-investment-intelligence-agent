import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { DB_FLOOR, useMicLevel } from '../lib/useMicLevel';
import { useSpeechInput, VOICE_LANGS, type VoiceLang } from '../lib/useSpeechInput';
import { Btn, Kbd, VisuallyHidden } from '../styles/shared.styles';
import * as S from './Composer.styles';
import { Icon } from './Icon';

const VOICE_PRIVACY = 'Your browser’s speech service transcribes the audio (Google in Chrome, Microsoft in Edge, Apple in Safari).';

/**
 * Question box: Enter sends, Shift+Enter adds a line, "/" anywhere focuses it. The microphone fills the box from
 * speech; the transcript is never sent on its own: the user reviews it and presses Ask.
 */
export function Composer({ busy, onSend, onStop, compact = false, autoFocus = false, placeholder, tools }: { busy: boolean; onSend: (q: string) => void; onStop: () => void; compact?: boolean; autoFocus?: boolean; placeholder: string; tools?: ReactNode }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const before = useRef(''); // the text that was in the box when recording started (restored on cancel)
  const voice = useSpeechInput((text, final) => {
    setValue(before.current ? `${before.current.trimEnd()} ${text}` : text);
    if (final) requestAnimationFrame(() => ref.current?.focus());
  });
  const startVoice = () => {
    before.current = value;
    voice.start();
  };
  const cancelVoice = () => {
    voice.cancel();
    setValue(before.current);
  };
  const otherLang: VoiceLang = voice.lang === 'en-US' ? 'he-IL' : 'en-US';
  const db = useMicLevel(voice.listening);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && t && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The follow-up composer replaces the home one after the first question; keep keyboard focus in the box.
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Esc cancels a recording wherever focus is (the microphone button keeps it while listening).
  useEffect(() => {
    if (!voice.listening) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelVoice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voice.listening]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || !value.trim()) return;
    if (voice.listening) voice.stop();
    onSend(value);
    setValue('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <S.Form $compact={compact} $listening={voice.listening} onSubmit={submit}>
      <VisuallyHidden as="label" htmlFor="question">
        Ask about U.S. airport traffic and investment
      </VisuallyHidden>
      <S.Textarea
        $compact={compact}
        id="question"
        ref={ref}
        rows={1}
        dir="auto"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          voice.clearError();
        }}
        onKeyDown={onKeyDown}
        placeholder={voice.listening ? `Listening… speak your question in ${VOICE_LANGS[voice.lang].name}` : placeholder}
        maxLength={2000}
      />
      <S.Bar>
        {tools}
        {voice.listening ? (
          <S.Status data-testid="voice-status" title={VOICE_PRIVACY}>
            {db === null && <S.Rec aria-hidden="true" />}
            Listening
            {db !== null && <MicMeter db={db} />}
            <S.Esc> · <Kbd>Esc</Kbd> to cancel</S.Esc>
            <Btn type="button" $variant="ghost" $size="sm" onClick={cancelVoice}>
              Cancel
            </Btn>
          </S.Status>
        ) : (
          <S.Hint>
            <Kbd>Enter</Kbd> to ask · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>/</Kbd> to focus
          </S.Hint>
        )}
        <S.Voice>
          <S.Lang
            type="button"
            onClick={() => voice.setLang(otherLang)}
            disabled={!voice.supported || voice.listening}
            aria-label={`Dictation language: ${VOICE_LANGS[voice.lang].name}. Switch to ${VOICE_LANGS[otherLang].name}`}
            title={`Dictation language: ${VOICE_LANGS[voice.lang].name}`}
          >
            <span lang={voice.lang.slice(0, 2)}>{VOICE_LANGS[voice.lang].short}</span>
          </S.Lang>
          <S.Mic
            type="button"
            onClick={voice.listening ? voice.stop : startVoice}
            disabled={!voice.supported || busy}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? 'Stop listening' : `Ask by voice (${VOICE_LANGS[voice.lang].name})`}
            title={voice.supported ? (voice.listening ? 'Stop listening and keep the text' : `Ask by voice. ${VOICE_PRIVACY}`) : 'Voice input is not supported in this browser. Use Chrome, Edge or Safari, or type your question.'}
          >
            <Icon name={voice.listening ? 'stop' : 'mic'} size={17} />
          </S.Mic>
        </S.Voice>
        {busy ? (
          <Btn type="button" $variant="ghost" onClick={onStop}>
            <Icon name="stop" size={16} /> Stop
          </Btn>
        ) : (
          <Btn type="submit" $variant="primary" disabled={!value.trim()}>
            Ask <Icon name="send" size={16} />
          </Btn>
        )}
      </S.Bar>
      <VisuallyHidden aria-live="polite">
        {voice.listening ? `Listening. Speak your question in ${VOICE_LANGS[voice.lang].name}.` : ''}
      </VisuallyHidden>
      {voice.error && (
        <S.VoiceError role="alert">
          <Icon name="warn" size={15} /> {voice.error}
        </S.VoiceError>
      )}
    </S.Form>
  );
}

const SEGMENTS = Array.from({ length: 12 }, (_, i) => DB_FLOOR + (i + 1) * 5); // -55 … 0 dBFS

/** Segmented input meter (board style): lit segments up to the current level; the dBFS value is for assistive tech only. */
export function MicMeter({ db }: { db: number }) {
  return (
    <S.Meter role="meter" aria-label="Microphone level" aria-valuemin={DB_FLOOR} aria-valuemax={0} aria-valuenow={db} aria-valuetext={`${db} decibels`}>
      <S.MeterBars aria-hidden="true">
        {SEGMENTS.map((threshold) => (
          <S.MeterSeg key={threshold} $on={db >= threshold} $hot={threshold > -10} data-on={db >= threshold || undefined} />
        ))}
      </S.MeterBars>
    </S.Meter>
  );
}
