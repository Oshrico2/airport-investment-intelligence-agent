import { useEffect, useState } from 'react';

/** Input level meter for voice input: microphone level in dBFS while recording, null when unknown. */
export const DB_FLOOR = -60;
const FALL_DB_PER_FRAME = 0.8; // VU-style ballistics: rises at once, falls ~48 dB/s
const UPDATE_MS = 66; // ~15 UI updates per second

/** RMS level of a block of samples in dBFS, clamped to [DB_FLOOR, 0]. */
export function levelDb(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(DB_FLOOR, Math.min(0, 20 * Math.log10(rms))) : DB_FLOOR;
}

// iOS Safari can interrupt speech recognition when a second capture starts, so the meter stays off there.
const meterAllowed = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined' && !/iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Opens its own audio stream while `active`; releases the microphone and closes the audio context when it ends. */
export function useMicLevel(active: boolean): number | null {
  const [db, setDb] = useState<number | null>(null);
  useEffect(() => {
    if (!active || !meterAllowed()) return;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let shown = DB_FLOOR;
        let last = 0;
        const tick = (t: number) => {
          analyser.getFloatTimeDomainData(buf);
          shown = Math.max(levelDb(buf), shown - FALL_DB_PER_FRAME);
          if (t - last >= UPDATE_MS) {
            last = t;
            setDb(Math.round(shown));
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      () => {}, // the meter is optional: recognition works without it
    );
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setDb(null);
    };
  }, [active]);
  return db;
}
