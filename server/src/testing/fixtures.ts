import { buildIndex, type DataIndex } from '../data/data-index';
import type { AirportMonthRow, AirportRecord, DelayRow, Manifest, QualityFlag, RouteOriginYear } from '../data/snapshot.types';

const source = (id: Manifest['sources'][number]['id'], from: string, to: string) => ({
  id, name: `test ${id}`, url: 'https://example.test', params: {}, coverage: { from, to }, retrievedAt: '2026-11-03T00:00:00.000Z', vintage: '2026-10-27T17:02:56.000Z', rawSha256: [], rowCount: 0,
});

export const airport = (code: string, state: string, id = `id-${code}`): AirportRecord => ({ id, code, name: `${code} Airport`, city: `${code} City`, state, aliases: [] });

/** Monthly r495 rows: same passengers/seats every month of each year unless overridden. */
export function months(id: string, year: number, perMonth: { passengers: number; seats: number; departures?: number; domestic?: number }, skip: number[] = [], lastMonth = 12): AirportMonthRow[] {
  const rows: AirportMonthRow[] = [];
  for (let m = 1; m <= lastMonth; m++) {
    if (skip.includes(m)) continue;
    const dom = perMonth.domestic ?? perMonth.passengers;
    rows.push([id, `${year}-${String(m).padStart(2, '0')}`, perMonth.departures ?? 100, perMonth.passengers, perMonth.seats, dom, perMonth.passengers - dom, perMonth.departures ?? 100, 0, 1000]);
  }
  return rows;
}

export function route(id: string, year: number, o: Partial<RouteOriginYear> = {}): RouteOriginYear {
  return {
    id, year, monthsCovered: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], allDepartures: 1000, allPassengers: 0, allSeats: 0,
    passengerDepartures: 800, cargoOnlyDepartures: 150, noPassengerServiceDepartures: 50, scheduledPassengers: 90_000, charterPassengers: 10_000,
    cargoClassPassengers: 0, passengerRecordSeats: 120_000, allDeparturesByBand: [500, 200, 0, 0, 0, 0, 300], passengerDeparturesByBand: [500, 200, 0, 0, 0, 0, 100],
    longHaulDestinations: [{ dest: 'NRT', departures: 100, passengers: 25_000, distance: 3433 }], ...o,
  };
}

export const delay = (id: string, month: string, v: Partial<Record<'arr' | 'del' | 'nas' | 'late' | 'can' | 'min', number>> = {}): DelayRow => [
  id, month, v.arr ?? 1000, v.del ?? 200, 40, 10, v.nas ?? 50, 0, v.late ?? 100, v.can ?? 10, 2, v.min ?? 12_000, 3000, 600, 2400, 0, 6000, 5,
];

export function makeIndex(p: { airports: AirportRecord[]; months: AirportMonthRow[]; routes?: RouteOriginYear[]; delays?: DelayRow[]; flags?: QualityFlag[]; r495To?: string; delaysTo?: string }): DataIndex {
  const manifest: Manifest = {
    version: 'test', createdAt: '2026-11-03T00:00:00.000Z',
    sources: [source('r495', '2019-01', p.r495To ?? '2026-07'), source('fmg', '2019-01', '2025-12'), source('delayCauses', '2025-01', p.delaysTo ?? '2026-08'), source('lookupAirportId', '', '')],
    checks: [], qualityFlags: p.flags ?? [],
  };
  return buildIndex(manifest, p.airports, p.months, p.routes ?? [], p.delays ?? []);
}
