import { useEffect, useState } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';
import * as S from './CodeTile.styles';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FLIPS = 3; // at most 3 intermediate glyphs (the split-flap signature move)
const STEP_MS = 45;

/**
 * Airport code on split-flap tiles: the app's one signature motion. Characters settle through a few glyphs
 * when the tile mounts or the code changes; with reduced motion they appear instantly.
 */
export function CodeTile({ code, delay = 0, size = 'md', tone = 'board', animate = true }: { code: string; delay?: number; size?: 'sm' | 'md' | 'lg'; tone?: 'board' | 'signal'; animate?: boolean }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false) || !animate;
  const [shown, setShown] = useState(reduced ? code : scramble(code, 0));

  useEffect(() => {
    if (reduced) {
      setShown(code);
      return;
    }
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      step++;
      setShown(step > FLIPS ? code : scramble(code, step));
      if (step <= FLIPS) timer = setTimeout(tick, STEP_MS);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [code, delay, reduced]);

  return (
    <S.Tile $size={size} $tone={tone} aria-label={code} role="img">
      {[...shown].map((c, i) => (
        <S.Cell key={`${i}-${c}`} aria-hidden="true">
          {c}
        </S.Cell>
      ))}
    </S.Tile>
  );
}

/** Characters left of `step` are already settled; the rest show pseudo-random glyphs (deterministic per step). */
function scramble(code: string, step: number): string {
  return [...code]
    .map((c, i) => (i < step - 1 || c === ' ' ? c : GLYPHS[(c.charCodeAt(0) * 7 + i * 13 + step * 17) % GLYPHS.length]))
    .join('');
}
