import type { ScoreBreakdown } from '../../../shared/api';
import { round } from './util';

/** Scoring formulas (docs/SCORING.md §2). */
export const ELIGIBILITY_THRESHOLD = 500_000; // P5
export const WEIGHTS = { growth: 0.6, load: 0.4 } as const; // P1

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const growthScore = (growthPercent: number): number => clamp(50 + 2.5 * growthPercent, 0, 100);
export const loadScore = (loadFactorPercent: number): number => clamp(((loadFactorPercent - 60) / 30) * 100, 0, 100);

/** Scores use unrounded inputs; rounding happens only for presentation (R3′). */
export function scoreBreakdown(growthPercent: number, loadFactorPercent: number): ScoreBreakdown {
  const g = growthScore(growthPercent);
  const l = loadScore(loadFactorPercent);
  return {
    growthPercent: round(growthPercent, 2),
    loadFactorPercent: round(loadFactorPercent, 2),
    growthScore: round(g, 1),
    loadScore: round(l, 1),
    overallScore: round(WEIGHTS.growth * g + WEIGHTS.load * l, 1),
    growthContribution: round(WEIGHTS.growth * g, 1),
    loadContribution: round(WEIGHTS.load * l, 1),
  };
}
