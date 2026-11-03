import type { CapacityResult, CapacityYear, Quality } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';
import { toRef } from './airports';
import { sumYear } from './totals';
import { monthsOf, percent, percentChange, round } from './util';

export const CANNOT_INFER = [
  'Passengers who wanted to fly but could not (spilled demand) are not in any BTS dataset.',
  'Slot, gate or runway limits are not measured by T-100.',
  'Fares and willingness to pay are not part of this data.',
  'Demand that switched to other airports cannot be observed.',
];
export const CAN_INFER = [
  'Capacity supplied (passenger-service departures and seats) compared with 2019 and 2024.',
  'Aircraft gauge (seats per passenger departure): larger aircraft can absorb demand without more flights.',
  'Load factor and peak-month load factors: sustained levels near 90% are consistent with capacity pressure, but are not proof of unmet demand.',
];

export function capacityYear(index: DataIndex, airport: AirportRecord, year: number): CapacityYear {
  const t = sumYear(index, airport.id, year);
  const r = index.routes.get(`${airport.id}|${year}`);
  let peak: CapacityYear['peakMonth'] = null;
  let atOrAbove90 = 0;
  for (const month of monthsOf(year)) {
    const v = index.months.get(airport.id)?.get(month);
    const lf = v ? percent(v.passengers, v.seats) : null;
    if (lf === null) continue;
    if (lf >= 90) atOrAbove90++;
    if (!peak || lf > peak.loadFactorPercent) peak = { month, loadFactorPercent: lf };
  }
  return {
    year,
    passengers: t.passengers,
    seats: t.seats,
    loadFactorPercent: percent(t.passengers, t.seats),
    allDepartures: t.departures,
    passengerServiceDepartures: r ? r.passengerDepartures : null,
    cargoOnlyDepartures: r ? r.cargoOnlyDepartures : null,
    seatsPerPassengerDeparture: r && r.passengerDepartures > 0 ? round(r.passengerRecordSeats / r.passengerDepartures) : null,
    peakMonth: peak,
    monthsAtOrAbove90: atOrAbove90,
    freightLbs: t.freightLbs,
  };
}

/** SFO-style capacity-pressure proxies: passenger-service departures reported separately from cargo. */
export function capacityPressure(index: DataIndex, airport: AirportRecord, opts: { year?: number; baselines?: number[] } = {}): CapacityResult {
  const year = opts.year ?? 2025;
  const baselines = (opts.baselines ?? [2019, 2024]).filter((y) => y !== year);
  const current = capacityYear(index, airport, year);
  const base = baselines.map((y) => capacityYear(index, airport, y));
  const reasons: Quality['reasons'] = [];
  for (const y of [current, ...base]) {
    if (y.passengerServiceDepartures === null) reasons.push({ code: 'NO_ROUTE_DATA', message: `No route-level data for ${y.year}; passenger-service vs cargo departures unavailable for that year.` });
    if (y.passengers === 0) reasons.push({ code: 'NOT_FOUND', message: `No passengers reported for ${y.year}.` });
  }
  return {
    kind: 'capacity',
    airport: toRef(airport),
    current,
    baselines: base,
    changes: base.map((b) => ({
      vsYear: b.year,
      passengersPercent: percentChange(current.passengers, b.passengers),
      passengerServiceDeparturesPercent: current.passengerServiceDepartures !== null && b.passengerServiceDepartures !== null ? percentChange(current.passengerServiceDepartures, b.passengerServiceDepartures) : null,
      seatsPerDeparturePercent: current.seatsPerPassengerDeparture !== null && b.seatsPerPassengerDeparture !== null ? percentChange(current.seatsPerPassengerDeparture, b.seatsPerPassengerDeparture) : null,
    })),
    canInfer: CAN_INFER,
    cannotInfer: CANNOT_INFER,
    quality: { status: reasons.length ? 'partial' : 'complete', reasons },
    sources: [index.sources.r495, index.sources.fmg],
  };
}
