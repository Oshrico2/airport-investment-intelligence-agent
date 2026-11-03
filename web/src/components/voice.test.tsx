import { act, fireEvent, render, screen } from '@testing-library/react';
import { levelDb } from '../lib/useMicLevel';
import { MAX_LISTEN_MS, NO_SPEECH_MS, SILENCE_MS } from '../lib/useSpeechInput';
import { Composer, MicMeter } from './Composer';
import { Narrative } from './ui';

/** Scripted stand-in for the browser recognizer: tests drive results, errors and the end event. */
class FakeRecognizer {
  static last: FakeRecognizer | null = null;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    FakeRecognizer.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.onerror?.({ error: 'aborted' });
    this.onend?.();
  }
  say(...parts: [text: string, final: boolean][]) {
    act(() => this.onresult?.({ results: parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) }));
  }
  fail(error: string) {
    act(() => {
      this.onerror?.({ error });
      this.onend?.();
    });
  }
}

const rec = () => FakeRecognizer.last!;
const box = () => screen.getByRole('textbox', { name: /Ask about U.S. airport traffic/ }) as HTMLTextAreaElement;
const mic = () => screen.getByRole('button', { name: /Ask by voice|Stop listening/ });
const setup = (props: Partial<Parameters<typeof Composer>[0]> = {}) => {
  const sent: string[] = [];
  render(<Composer busy={false} onSend={(q) => sent.push(q)} onStop={() => {}} placeholder="Ask" {...props} />);
  return sent;
};

beforeEach(() => {
  FakeRecognizer.last = null;
  localStorage.clear();
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognizer, configurable: true, writable: true });
});

describe('voice input (Web Speech API)', () => {
  it('shows the microphone disabled with an explanation when the browser has no speech recognition', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true, writable: true });
    setup();
    expect(mic()).toBeDisabled();
    expect(mic()).toHaveAttribute('title', expect.stringMatching(/not supported in this browser/));
  });

  it('previews the interim transcript, fills the box with the final one and never sends it by itself', () => {
    const sent = setup();
    fireEvent.click(mic());
    expect(rec()).toMatchObject({ started: true, lang: 'en-US', interimResults: true, continuous: false, maxAlternatives: 1 });
    expect(mic()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Listening\. Speak your question in English\./)).toBeInTheDocument(); // live region

    rec().say(['rank the new', false]);
    expect(box().value).toBe('rank the new');
    rec().say(['rank the New England airports', true]);
    act(() => rec().onend?.());
    expect(box().value).toBe('rank the New England airports');
    expect(mic()).toHaveAttribute('aria-pressed', 'false');
    expect(sent).toEqual([]); // the user reviews, then presses Ask
    fireEvent.submit(box().form!);
    expect(sent).toEqual(['rank the New England airports']);
  });

  it('appends to text already typed, and Cancel or Esc restore it without an error', () => {
    setup();
    fireEvent.change(box(), { target: { value: 'Compare delays at' } });
    fireEvent.click(mic());
    rec().say(['LAX and SNA', false]);
    expect(box().value).toBe('Compare delays at LAX and SNA');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(rec().aborted).toBe(true);
    expect(box().value).toBe('Compare delays at');
    expect(screen.queryByRole('alert')).toBeNull(); // our own abort is silent

    fireEvent.click(mic());
    rec().say(['something else', false]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(box().value).toBe('Compare delays at');
  });

  it('a cancelled recognizer cannot write into a newer recording', () => {
    setup();
    fireEvent.click(mic());
    const old = rec();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(mic());
    act(() => old.onresult?.({ results: [Object.assign([{ transcript: 'stale' }], { isFinal: true })] }));
    expect(box().value).toBe('');
    expect(mic()).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns recognizer errors into actionable messages, cleared when the user types', () => {
    setup();
    fireEvent.click(mic());
    rec().fail('not-allowed');
    expect(screen.getByRole('alert')).toHaveTextContent(/Microphone access is blocked/);
    fireEvent.change(box(), { target: { value: 'x' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(mic());
    rec().fail('no-speech');
    expect(screen.getByRole('alert')).toHaveTextContent(/No speech was heard/);
  });

  it('switches dictation to Hebrew and remembers the choice', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Dictation language: English\. Switch to Hebrew/ }));
    expect(localStorage.getItem('aii.voiceLang')).toBe('he-IL');
    expect(screen.getByRole('button', { name: /Dictation language: Hebrew/ })).toHaveTextContent('עב');
    fireEvent.click(mic());
    expect(rec().lang).toBe('he-IL');
    rec().say(['דרג את שדות התעופה בניו אינגלנד', true]);
    expect(box()).toHaveAttribute('dir', 'auto'); // Hebrew shows right-to-left
  });

  it('prefers the unprefixed SpeechRecognition when the browser has it', () => {
    class Unprefixed extends FakeRecognizer {}
    Object.defineProperty(window, 'SpeechRecognition', { value: Unprefixed, configurable: true, writable: true });
    try {
      setup();
      fireEvent.click(mic());
      expect(rec()).toBeInstanceOf(Unprefixed);
    } finally {
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true, writable: true });
    }
  });

  it('is unavailable while an answer is streaming', () => {
    setup({ busy: true });
    expect(mic()).toBeDisabled();
  });
});

/** A recognizer that, like real Chrome in the field, never ends on its own and ignores stop(). */
class StubbornRecognizer extends FakeRecognizer {
  override stop() {
    this.stopped = true;
  }
  override abort() {
    this.aborted = true; // no end event either
  }
}

describe('voice input: when a recording ends (regression: recording kept going after the user stopped)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const listening = () => mic().getAttribute('aria-pressed') === 'true';

  it('ends after 2 s of silence following speech, keeps the transcript, and each new word restarts the wait', () => {
    setup();
    fireEvent.click(mic());
    rec().say(['rank the new', false]);
    act(() => vi.advanceTimersByTime(SILENCE_MS - 100));
    rec().say(['rank the New England airports', false]); // still speaking
    act(() => vi.advanceTimersByTime(SILENCE_MS - 100));
    expect(listening()).toBe(true);
    act(() => vi.advanceTimersByTime(100));
    expect(listening()).toBe(false);
    expect(rec().aborted).toBe(true); // the microphone is released, not left to the browser
    expect(box().value).toBe('rank the New England airports');
  });

  it('ends at once when the browser marks the utterance final', () => {
    setup();
    fireEvent.click(mic());
    rec().say(['what share of Anchorage flights are long-haul', true]);
    expect(listening()).toBe(false);
    expect(box().value).toBe('what share of Anchorage flights are long-haul');
  });

  it('ends after 8 s with "No speech was heard" when nothing was recognised', () => {
    setup();
    fireEvent.click(mic());
    act(() => vi.advanceTimersByTime(NO_SPEECH_MS));
    expect(listening()).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent(/No speech was heard/);
  });

  it('enforces the 30 s cap from the start even if speech never pauses and the browser never ends', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: StubbornRecognizer, configurable: true, writable: true });
    setup();
    fireEvent.click(mic());
    for (let t = 1; t < 30; t++) {
      act(() => vi.advanceTimersByTime(1000));
      rec().say([`word `.repeat(t).trim(), false]); // speech every second keeps the silence timer from firing
    }
    expect(listening()).toBe(true);
    act(() => vi.advanceTimersByTime(MAX_LISTEN_MS - 29_000));
    expect(listening()).toBe(false);
    expect(rec().aborted).toBe(true);
    expect(box().value).toBe('word '.repeat(29).trim());
  });

  it('Stop ends immediately and keeps the text, without waiting for the browser', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: StubbornRecognizer, configurable: true, writable: true });
    setup();
    fireEvent.change(box(), { target: { value: 'Compare delays at' } });
    fireEvent.click(mic());
    rec().say(['LAX and SNA', false]);
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(listening()).toBe(false);
    expect(rec().aborted).toBe(true);
    expect(box().value).toBe('Compare delays at LAX and SNA');
  });

  it('Cancel ends immediately and restores the earlier text, without waiting for the browser', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: StubbornRecognizer, configurable: true, writable: true });
    setup();
    fireEvent.change(box(), { target: { value: 'Compare delays at' } });
    fireEvent.click(mic());
    rec().say(['LAX and SNA', false]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(listening()).toBe(false);
    expect(box().value).toBe('Compare delays at');
  });

  it('ignores repeated and late events: one transcript, one error, no duplicated text, no timers left', () => {
    setup();
    fireEvent.change(box(), { target: { value: 'Compare delays at' } });
    fireEvent.click(mic());
    const r = rec();
    r.say(['LAX and SNA', false]);
    r.say(['LAX and SNA', false]); // the browser repeats the same interim result
    expect(box().value).toBe('Compare delays at LAX and SNA');
    act(() => {
      r.onerror?.({ error: 'network' });
      r.onerror?.({ error: 'no-speech' }); // a second error after the session ended
      r.onend?.();
      r.onend?.();
    });
    r.say(['LAX and SNA and more', true]); // a late result from the ended recognizer
    expect(box().value).toBe('Compare delays at LAX and SNA');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/speech service could not be reached/);
    act(() => vi.advanceTimersByTime(50)); // the one-shot focus of the box on the next frame
    expect(vi.getTimerCount()).toBe(0); // no silence, no-speech or cap timer left behind
  });

  it('cleans up timers and the recognizer when the composer unmounts mid-recording', () => {
    const view = render(<Composer busy={false} onSend={() => {}} onStop={() => {}} placeholder="Ask" />);
    fireEvent.click(view.getByRole('button', { name: /Ask by voice/ }));
    rec().say(['rank', false]);
    view.unmount();
    expect(rec().aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('microphone level meter', () => {
  it('measures RMS in dBFS: silence at the floor, a full-scale sine near −3 dB, a tenth of it near −23 dB', () => {
    const sine = (amp: number) => Float32Array.from({ length: 1024 }, (_, i) => amp * Math.sin((2 * Math.PI * i) / 64));
    expect(levelDb(new Float32Array(1024))).toBe(-60);
    expect(levelDb(sine(1))).toBeCloseTo(-3.01, 1);
    expect(levelDb(sine(0.1))).toBeCloseTo(-23.01, 1);
    expect(levelDb(sine(0.0001))).toBe(-60); // below the floor
  });

  it('renders lit segments up to the level, with an accessible meter value', () => {
    const { container } = render(<MicMeter db={-30} />);
    const meter = screen.getByRole('meter', { name: 'Microphone level' });
    expect(meter).toHaveAttribute('aria-valuenow', '-30');
    expect(meter).toHaveAttribute('aria-valuetext', '-30 decibels');
    expect(container.querySelectorAll('[data-on]')).toHaveLength(6); // -55 … -30
    expect(container).not.toHaveTextContent(/dB/); // the level is shown as animation only
  });

  it('opens a stream only while listening and releases the microphone when recording ends', async () => {
    const stopTrack = vi.fn();
    const close = vi.fn(() => Promise.resolve());
    const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: stopTrack }] }));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    class FakeAudioContext {
      close = close;
      createAnalyser() {
        return { fftSize: 0, getFloatTimeDomainData: (b: Float32Array) => b.fill(0.1) };
      }
      createMediaStreamSource() {
        return { connect: () => {} };
      }
    }
    Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true, writable: true });
    try {
      setup();
      expect(getUserMedia).not.toHaveBeenCalled();
      fireEvent.click(mic());
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(await screen.findByRole('meter', { name: 'Microphone level' })).toHaveAttribute('aria-valuenow', '-20');
      fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
      expect(stopTrack).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      expect(screen.queryByRole('meter')).toBeNull();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true, writable: true });
    }
  });
});

describe('right-to-left text', () => {
  it('lets each narrative paragraph and bullet pick its own direction', () => {
    const { container } = render(<Narrative text={'שלום\n- one'} streaming={false} />);
    expect(container.querySelector('p')).toHaveAttribute('dir', 'auto');
    expect(container.querySelector('li')).toHaveAttribute('dir', 'auto');
  });
});
