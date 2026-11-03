import type { DelayComparisonResult, DelayMetrics, Quality } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';
import { toRef } from './airports';
import { monthRangeLabel, monthsOf, round } from './util';

export type DelayPeriodId = '2025' | '2026-ytd' | '2025-same-months';

export const DELAY_NOTES = [
  'Covers arrivals of U.S. reporting carriers on domestic flights only; foreign carriers, international flights and cargo flights are not included.',
  'Flight delays are not a direct measure of terminal congestion: nothing here measures gate, security-line or passenger-processing crowding. NAS (National Aviation System) delays reflect airspace and airport operations such as traffic volume, non-extreme weather and air-traffic control.',
  'Delay minutes are the minutes BTS attributes to delay causes for arrivals 15 or more minutes late, divided by all arrivals.',
];

/** Periods: full-year 2025 primary; 2026 year-to-date and the same months of 2025 shown separately. */
export function delayPeriod(index: DataIndex, id: DelayPeriodId): { id: DelayPeriodId; label: string; months: string[] } {
  const to = index.coverage.delays.to;
  const lastYear = Number(to.slice(0, 4));
  const lastMonth = Number(to.slice(5, 7));
  if (id === '2025') return { id, label: 'Full-year 2025', months: monthsOf(2025) };
  const months = id === '2026-ytd' ? monthsOf(lastYear, lastMonth) : monthsOf(lastYear - 1, lastMonth);
  return { id, label: monthRangeLabel(months), months };
}

export function delayMetrics(index: DataIndex, airportId: string, months: string[]): { metrics: DelayMetrics | null; missing: string[] } {
  const m = index.delays.get(airportId);
  const s = { arr: 0, del: 0, car: 0, wx: 0, nas: 0, sec: 0, late: 0, can: 0, div: 0, min: 0, carriers: 0 };
  const missing: string[] = [];
  for (const month of months) {
    const v = m?.get(month);
    if (!v) { missing.push(month); continue; }
    s.arr += v.arrFlights; s.del += v.arrDel15; s.car += v.carrierCt; s.wx += v.weatherCt; s.nas += v.nasCt;
    s.sec += v.securityCt; s.late += v.lateAircraftCt; s.can += v.arrCancelled; s.div += v.arrDiverted; s.min += v.arrDelayMin;
    s.carriers = Math.max(s.carriers, v.carriers);
  }
  if (s.arr === 0) return { metrics: null, missing };
  const share = (x: number) => (s.del > 0 ? round((100 * x) / s.del) : 0);
  return {
    metrics: {
      arrivals: round(s.arr, 0),
      delayedPercent: round((100 * s.del) / s.arr),
      cancelledPercent: round((100 * s.can) / s.arr, 2),
      divertedPercent: round((100 * s.div) / s.arr, 2),
      delayMinutesPerArrival: round(s.min / s.arr),
      causeSharePercent: { carrier: share(s.car), weather: share(s.wx), nas: share(s.nas), security: share(s.sec), lateAircraft: share(s.late) },
      carriersReporting: s.carriers,
    },
    missing,
  };
}

export function compareDelays(index: DataIndex, airports: AirportRecord[], periodId: DelayPeriodId = '2025'): DelayComparisonResult {
  const period = delayPeriod(index, periodId);
  return {
    kind: 'delays',
    period,
    airports: airports.map((a) => {
      const { metrics, missing } = delayMetrics(index, a.id, period.months);
      // R9′: missing delay data is reported, never an exclusion from anything else.
      const quality: Quality = !metrics
        ? { status: 'unavailable', reasons: [{ code: 'NO_DELAY_DATA', message: `No BTS on-time arrivals reported for ${a.code} in ${period.label} (airport not served by reporting carriers in this period).` }] }
        : missing.length
          ? { status: 'partial', reasons: [{ code: 'SNAPSHOT_COVERAGE', message: `No delay data for ${missing.length} month(s) of ${period.label}.` }] }
          : { status: 'complete', reasons: [] };
      return { airport: toRef(a), metrics, quality };
    }),
    notes: DELAY_NOTES,
    sources: [index.sources.delayCauses],
  };
}
