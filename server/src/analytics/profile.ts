import type { AirportProfileResult, PeriodComparison, Quality, YearTotals } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';
import { toRef } from './airports';
import type { NationalRanking } from './ranking';
import { sumMonths, sumYear } from './totals';
import { monthRangeLabel, monthsOf, percent, percentChange } from './util';

export const CHARTER_LABEL = 'Charter / Non-scheduled Passenger Flights';
export const CHARTER_BTS_DEFINITION = 'BTS service class L: "Non-Scheduled Civilian Passenger/ Cargo Service"';

/** Months of the latest r495 year, e.g. 2026-01..2026-07, and the same months one year earlier. */
export function ytdMonths(index: DataIndex): { current: string[]; previous: string[] } {
  const to = index.coverage.r495.to; // YYYY-MM
  const year = Number(to.slice(0, 4));
  const last = Number(to.slice(5, 7));
  return { current: monthsOf(year, last), previous: monthsOf(year - 1, last) };
}

export function ytdComparison(index: DataIndex, id: string): PeriodComparison {
  const { current, previous } = ytdMonths(index);
  const c = sumMonths(index, id, current);
  const p = sumMonths(index, id, previous);
  return {
    label: `${monthRangeLabel(current)} vs ${monthRangeLabel(previous)}`,
    months: current,
    current: { passengers: c.passengers, seats: c.seats, loadFactorPercent: percent(c.passengers, c.seats) },
    previous: { passengers: p.passengers, seats: p.seats, loadFactorPercent: percent(p.passengers, p.seats) },
    passengerChangePercent: c.missingMonths.length || p.missingMonths.length ? null : percentChange(c.passengers, p.passengers),
    missingMonths: [...p.missingMonths, ...c.missingMonths],
  };
}

export function airportProfile(index: DataIndex, national: NationalRanking, airport: AirportRecord): AirportProfileResult {
  const years: YearTotals[] = [];
  for (const year of [2019, 2024, 2025]) {
    const t = sumYear(index, airport.id, year);
    if (t.monthsReported === 0) continue;
    years.push({
      year, passengers: t.passengers, seats: t.seats, departures: t.departures, loadFactorPercent: percent(t.passengers, t.seats),
      domesticPassengers: t.domesticPassengers, intlOutboundPassengers: t.intlOutboundPassengers, monthsReported: t.monthsReported,
    });
  }
  const y25 = years.find((y) => y.year === 2025);
  const y24 = years.find((y) => y.year === 2024);
  const evaluation = national.evaluations.get(airport.id);
  const rankRow = national.rows.find((r) => r.airport.id === airport.id) ?? null;
  const route25 = index.routes.get(`${airport.id}|2025`);
  const charterBase = route25 ? route25.scheduledPassengers + route25.charterPassengers : 0;
  const reasons = evaluation?.reasons ?? [];
  const flagReasons = (index.flags.get(airport.id) ?? [])
    .filter((f) => f.month && f.month >= '2024-01' && (f.rule === 'R4' || f.rule === 'R6'))
    .map((f) => ({ code: f.rule === 'R4' ? ('INCONSISTENT_ROWS' as const) : ('MONTHLY_LF_ABOVE_100' as const), message: `${f.month}: ${f.detail}` }));
  const quality: Quality = {
    status: reasons.length ? (y25 ? 'partial' : 'excluded') : flagReasons.length ? 'partial' : 'complete',
    reasons: [...reasons, ...flagReasons],
  };
  const { current } = ytdMonths(index);
  const monthly = [...monthsOf(2025), ...current]
    .flatMap((month) => {
      const v = index.months.get(airport.id)?.get(month);
      return v ? [{ month, passengers: v.passengers, loadFactorPercent: percent(v.passengers, v.seats) }] : [];
    });
  return {
    kind: 'airportProfile',
    airport: toRef(airport),
    years,
    growthPercent2025: y25 && y24 && y25.monthsReported === 12 && y24.monthsReported === 12 ? percentChange(y25.passengers, y24.passengers, 2) : null,
    domesticSharePercent2025: y25 ? percent(y25.domesticPassengers, y25.passengers) : null,
    charter: route25
      ? { charterPassengers: route25.charterPassengers, scheduledPassengers: route25.scheduledPassengers, charterSharePercent: percent(route25.charterPassengers, charterBase, 2), label: CHARTER_LABEL, btsDefinition: CHARTER_BTS_DEFINITION }
      : null,
    ranking: { eligible: !!rankRow, nationalRank: rankRow?.nationalRank ?? null, score: rankRow?.score ?? null, reasons },
    ytd: ytdComparison(index, airport.id),
    monthly,
    quality,
    sources: [index.sources.r495, ...(route25 ? [index.sources.fmg] : [])],
  };
}

