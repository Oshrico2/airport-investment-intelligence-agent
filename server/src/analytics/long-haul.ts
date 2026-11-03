import type { LongHaulResult } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';
import { toRef } from './airports';
import { percent } from './util';

export const LONG_HAUL_MILES = 3000; // D5

const sumFrom = (bands: number[], fromBand: number) => bands.slice(fromBand).reduce((a, b) => a + b, 0);

/**
 * Share of passenger-record departures (class F/L with reported passengers; cargo-only G/P excluded) at or above
 * `minMiles`, from route-level BTS data. Counts departures performed, not routes.
 */
export function longHaulShare(index: DataIndex, airport: AirportRecord, opts: { year?: number; minMiles?: number } = {}): LongHaulResult {
  const year = opts.year ?? 2025;
  const minMiles = opts.minMiles ?? LONG_HAUL_MILES;
  if (minMiles <= 0 || minMiles % 500 !== 0) throw new Error('minMiles must be a positive multiple of 500 (BTS 500-mile distance bands).');
  const base = {
    kind: 'longHaul' as const,
    airport: toRef(airport),
    year,
    minMiles,
    definition: `Share of passenger-flight departures (BTS service class F or L with reported passengers, any aircraft configuration; cargo-only classes G and P excluded) with segment distance ≥ ${minMiles.toLocaleString('en-US')} statute miles, full-year ${year}. Departures performed, not routes.`,
    limitations: [
      'BTS T-100 rows aggregate a month of flights per carrier, route, aircraft type, service class and configuration; "passengers carried" is confirmed per row, not per flight.',
      'Distance is the BTS airport-to-airport segment distance; multi-stop itineraries count each segment separately.',
      'Context figure "all departures" includes cargo-only service, which dominates long-haul flying at some airports.',
    ],
    sources: [index.sources.fmg],
  };
  const r = index.routes.get(`${airport.id}|${year}`);
  if (!index.coverage.routeYears.includes(year)) {
    return { ...base, ...empty(), quality: { status: 'unavailable', reasons: [{ code: 'SNAPSHOT_COVERAGE', message: `Route-level snapshot covers ${index.coverage.routeYears.join(', ')}, not ${year}.` }] } };
  }
  if (!r) {
    return { ...base, ...empty(), quality: { status: 'unavailable', reasons: [{ code: 'NO_ROUTE_DATA', message: `No route-level departures reported for ${airport.code} in ${year}.` }] } };
  }
  const band = minMiles / 500;
  const longHaul = sumFrom(r.passengerDeparturesByBand, band);
  const allLong = sumFrom(r.allDeparturesByBand, band);
  return {
    ...base,
    passengerDepartures: r.passengerDepartures,
    longHaulPassengerDepartures: longHaul,
    longHaulSharePercent: percent(longHaul, r.passengerDepartures, 2),
    allDepartures: r.allDepartures,
    allLongHaulDepartures: allLong,
    allLongHaulSharePercent: percent(allLong, r.allDepartures, 2),
    cargoOnlyDepartures: r.cargoOnlyDepartures,
    topDestinations: minMiles === LONG_HAUL_MILES ? r.longHaulDestinations : [],
    quality: r.monthsCovered.length === 12 ? { status: 'complete', reasons: [] } : { status: 'partial', reasons: [{ code: 'INCOMPLETE_2025', message: `Route-level activity reported in ${r.monthsCovered.length} of 12 months of ${year}.` }] },
  };
}

function empty() {
  return { passengerDepartures: 0, longHaulPassengerDepartures: 0, longHaulSharePercent: null, allDepartures: 0, allLongHaulDepartures: 0, allLongHaulSharePercent: null, cargoOnlyDepartures: 0, topDestinations: [] };
}
