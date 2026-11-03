import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input through the browser's own speech recognition (Web Speech API): no server code, no key,
 * no cost. Chrome and Edge send the audio to their vendor's speech service, Safari to Apple's; Firefox has no
 * support, so the caller shows the microphone disabled. The transcript only fills the question box: the user
 * reviews it and sends it through the normal chat flow.
 *
 * The hook owns when a recording ends. Browsers' own end-of-speech detection is unreliable: real Chrome kept a
 * silent session open for 60 s, and waiting for its `end` event left the UI listening past the 30 s cap. So:
 * silence after speech, no speech at all, the hard cap, Stop and Cancel all end the session here, at once, by
 * detaching it and aborting the recognizer; any event a detached recognizer still fires is ignored.
 */

// lib.dom ships the event and result types but not the recognizer itself (it is still prefixed in Chrome/Safari).
interface Recognizer extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognizerCtor = new () => Recognizer;
declare global {
  interface Window {
    SpeechRecognition?: RecognizerCtor;
    webkitSpeechRecognition?: RecognizerCtor;
  }
}

export type VoiceLang = 'en-US' | 'he-IL';
export const VOICE_LANGS: Record<VoiceLang, { short: string; name: string }> = {
  'en-US': { short: 'EN', name: 'English' },
  'he-IL': { short: 'עב', name: 'Hebrew' },
};
const LANG_KEY = 'aii.voiceLang';
export const MAX_LISTEN_MS = 30_000; // hard cap from start: one question, not dictation
export const SILENCE_MS = 2_000; // after the last recognised words; longer than a pause between words
export const NO_SPEECH_MS = 8_000; // nothing recognised at all

const recognizerCtor = (): RecognizerCtor | undefined => (typeof window === 'undefined' ? undefined : (window.SpeechRecognition ?? window.webkitSpeechRecognition));

function initialLang(): VoiceLang {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
  if (saved === 'en-US' || saved === 'he-IL') return saved;
  return typeof navigator !== 'undefined' && /^he\b|^iw\b/i.test(navigator.language) ? 'he-IL' : 'en-US';
}

/** Short, actionable messages per Web Speech error code; `aborted` is our own cancel and stays silent. */
export function voiceErrorMessage(code: string, lang: VoiceLang): string | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it for this site in the browser’s address bar, or type your question.';
    case 'no-speech':
      return 'No speech was heard. Press the microphone and try again, a little closer to it.';
    case 'audio-capture':
      return 'No microphone was found. Connect one, or type your question.';
    case 'network':
      return 'The browser’s speech service could not be reached. Check the connection, or type your question.';
    case 'language-not-supported':
      return `${VOICE_LANGS[lang].name} dictation is not available in this browser. Switch the language, or type your question.`;
    default:
      return 'Voice input stopped unexpectedly. Try again, or type your question.';
  }
}

interface Session {
  r: Recognizer;
  text: string; // latest transcript of this session (interim or final), rebuilt from all results on every event
  silence?: ReturnType<typeof setTimeout>;
  noSpeech: ReturnType<typeof setTimeout>;
  cap: ReturnType<typeof setTimeout>;
}

export function useSpeechInput(onText: (text: string, final: boolean) => void) {
  const supported = recognizerCtor() !== undefined;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLangState] = useState<VoiceLang>(initialLang);
  const session = useRef<Session | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  /** Ends the active session immediately: timers cleared, UI updated, recognizer aborted. Idempotent. */
  const end = useCallback((keep: boolean, errorCode?: string, errorLang?: VoiceLang) => {
    const s = session.current;
    if (!s) return;
    session.current = null; // detach first: whatever the recognizer still fires is ignored
    clearTimeout(s.silence);
    clearTimeout(s.noSpeech);
    clearTimeout(s.cap);
    setListening(false);
    if (errorCode) setError(voiceErrorMessage(errorCode, errorLang ?? 'en-US'));
    if (keep && s.text) onTextRef.current(s.text, true);
    try {
      s.r.abort();
    } catch {
      // already ended
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor || session.current) return;
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true; // live preview while speaking
    r.continuous = false; // one utterance; we still enforce our own end conditions
    r.maxAlternatives = 1;
    const active = () => session.current?.r === r;
    const s: Session = {
      r,
      text: '',
      noSpeech: setTimeout(() => active() && end(false, 'no-speech', lang), NO_SPEECH_MS),
      cap: setTimeout(() => active() && end(true), MAX_LISTEN_MS),
    };
    r.onresult = (e) => {
      if (!active()) return;
      const results = Array.from(e.results);
      const text = results.map((res) => res[0]?.transcript ?? '').join('').trim();
      if (!text) return;
      s.text = text;
      clearTimeout(s.noSpeech);
      if (results.every((res) => res.isFinal)) return end(true); // the utterance is complete
      onTextRef.current(text, false);
      clearTimeout(s.silence);
      s.silence = setTimeout(() => active() && end(true), SILENCE_MS);
    };
    r.onerror = (e) => {
      if (active()) end(true, e.error === 'aborted' ? undefined : e.error, lang); // keep any partial transcript
    };
    r.onend = () => {
      if (active()) end(true); // the browser ended on its own
    };
    setError(null);
    session.current = s;
    setListening(true);
    try {
      r.start();
    } catch {
      end(false, 'unknown', lang);
    }
  }, [lang, end]);

  /** Stop now and keep what was recognised. */
  const stop = useCallback(() => end(true), [end]);

  /** Stop now and discard the transcript (the caller restores the previous text). */
  const cancel = useCallback(() => end(false), [end]);

  const setLang = useCallback((l: VoiceLang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // private mode: the choice just lasts for this page
    }
  }, []);

  useEffect(() => () => end(false), [end]); // unmount: timers cleared, recognizer aborted

  return { supported, listening, error, clearError: () => setError(null), lang, setLang, start, stop, cancel };
}
