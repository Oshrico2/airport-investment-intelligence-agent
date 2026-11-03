import type { ExcludedAirport, RankingResult, RankingRow, ReasonCode } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';
import { toRef } from './airports';
import { resolveRegion } from './regions';
import { ELIGIBILITY_THRESHOLD, scoreBreakdown, WEIGHTS } from './scoring';
import { sumYear } from './totals';
import { fmt, monthLabel } from './util';

export type Reason = { code: ReasonCode; message: string };

export interface Evaluation {
  airport: AirportRecord;
  passengers2025: number;
  passengers2024: number;
  reasons: Reason[]; // empty = eligible
  row: Omit<RankingRow, 'nationalRank'> | null;
}

const listMonths = (ms: string[]) => (ms.length > 4 ? `${ms.length} months` : ms.map(monthLabel).join(', '));

/** Eligibility and score for one airport (R2′, R5′, R6′, R7′). All failing reasons are reported. */
export function evaluateAirport(index: DataIndex, airport: AirportRecord): Evaluation {
  const y25 = sumYear(index, airport.id, 2025);
  const y24 = sumYear(index, airport.id, 2024);
  const reasons: Reason[] = [];
  if (y25.missingMonths.length) {
    reasons.push({ code: 'INCOMPLETE_2025', message: `2025 is missing ${listMonths(y25.missingMonths)}; BTS does not distinguish zero activity from a missing report.` });
  }
  if (y25.passengers < ELIGIBILITY_THRESHOLD) {
    const basis = y25.missingMonths.length ? `${y25.monthsReported} reported months of 2025` : '2025';
    reasons.push({ code: 'BELOW_THRESHOLD', message: `Below ${fmt(ELIGIBILITY_THRESHOLD)}: ${fmt(y25.passengers)} departing passengers in ${basis}.` });
  }
  if (y24.monthsReported === 0 || y24.passengers === 0) {
    reasons.push({ code: 'NO_2024_BASELINE', message: 'Growth unavailable: no 2024 baseline.' });
  } else if (y24.missingMonths.length) {
    reasons.push({ code: 'INCOMPLETE_2024', message: `2024 baseline is missing ${listMonths(y24.missingMonths)}; growth would not be like-for-like.` });
  }
  if (y25.seats === 0) reasons.push({ code: 'LF_UNAVAILABLE', message: 'Load factor unavailable: no seats reported in 2025.' });
  else if (y25.passengers > y25.seats) reasons.push({ code: 'INVALID_LOAD_FACTOR', message: `Invalid load factor: 2025 passengers exceed seats (${fmt(y25.passengers)} > ${fmt(y25.seats)}).` });
  const row =
    reasons.length === 0
      ? {
          airport: toRef(airport),
          passengers2025: y25.passengers,
          passengers2024: y24.passengers,
          score: scoreBreakdown((100 * (y25.passengers - y24.passengers)) / y24.passengers, (100 * y25.passengers) / y25.seats),
        }
      : null;
  return { airport, passengers2025: y25.passengers, passengers2024: y24.passengers, reasons, row };
}

export interface NationalRanking {
  rows: RankingRow[];
  evaluations: Map<string, Evaluation>;
}

/** Precomputed once per snapshot. Ties break on 2025 passengers, then code, so order is deterministic. */
export function computeNationalRanking(index: DataIndex): NationalRanking {
  const evaluations = new Map<string, Evaluation>();
  for (const a of index.airports.values()) evaluations.set(a.id, evaluateAirport(index, a));
  const rows = [...evaluations.values()]
    .flatMap((e) => (e.row ? [e.row] : []))
    .sort((a, b) => b.score.overallScore - a.score.overallScore || b.passengers2025 - a.passengers2025 || a.airport.code.localeCompare(b.airport.code))
    .map((r, i) => ({ ...r, nationalRank: i + 1 }));
  return { rows, evaluations };
}

const EXCLUDED_SHOWN = 10;

export function rankAirports(index: DataIndex, national: NationalRanking, opts: { region?: string | string[]; limit?: number } = {}): RankingResult {
  const region = resolveRegion(opts.region);
  const inRegion = (a: { state: string }) => region.states.includes(a.state);
  const rows = national.rows.filter((r) => inRegion(r.airport));
  const excludedAll: ExcludedAirport[] = [...national.evaluations.values()]
    .filter((e) => e.reasons.length && inRegion(e.airport) && e.passengers2025 > 0)
    .sort((a, b) => b.passengers2025 - a.passengers2025)
    .map((e) => ({ airport: toRef(e.airport), passengers2025: e.passengers2025, reasons: e.reasons }));
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  return {
    kind: 'ranking',
    region,
    eligibleCount: rows.length,
    nationalEligibleCount: national.rows.length,
    rows: rows.slice(0, limit),
    excluded: excludedAll.slice(0, EXCLUDED_SHOWN),
    excludedCount: excludedAll.length,
    method: { threshold: ELIGIBILITY_THRESHOLD, eligibilityYear: 2025, baselineYear: 2024, weights: WEIGHTS },
    sources: [index.sources.r495, index.sources.fmg],
  };
}
