import type { AirportMonthRow, AirportRecord, DelayRow, QualityFlag, RouteOriginYear } from '../data/snapshot.types';
import { classifyRecord, isKnownServiceClass, KNOWN_AIRCRAFT_CONFIGS } from '../domain/passenger-activity';
import type { R495Row } from './r495';

const LONG_HAUL_MILES = 3000; // D5
const TOP_DESTINATIONS = 12;

const num = (s: string | undefined, field: string): number => {
  if (s === undefined || s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Non-numeric ${field}: "${s}"`);
  return n;
};

/** r495 rows -> airport-month rows, with uniqueness, R4′ (component nulls) and R6′ (LF > 100) handling. */
export function buildAirportMonths(rows: R495Row[]): { rows: AirportMonthRow[]; flags: QualityFlag[] } {
  const seen = new Set<string>();
  const out: AirportMonthRow[] = [];
  const flags: QualityFlag[] = [];
  for (const r of rows) {
    const id = r.origin_airport_id;
    const month = r.reporting_month.slice(0, 7);
    const key = `${id}|${month}`;
    if (seen.has(key)) throw new Error(`V2 failed: duplicate airport-month ${key}`);
    seen.add(key);
    if (r.total_passengers === undefined || r.total_seats === undefined || r.total_departures === undefined) {
      flags.push({ rule: 'R11', id, month, detail: 'total field missing; row not used' });
      continue;
    }
    // R4′: a null component counts as 0 only if the row's identity still holds with that substitution.
    const domPax = r.domestic_passengers ?? 0;
    const intlPax = r.outbound_international_1 ?? 0;
    const domDep = r.domestic_departures ?? 0;
    const intlDep = r.outbound_international ?? 0;
    if (domPax + intlPax !== r.total_passengers || domDep + intlDep !== r.total_departures) {
      flags.push({ rule: 'R4', id, month, detail: 'total ≠ domestic + outbound international' });
    }
    if (r.total_seats > 0 && r.total_passengers > r.total_seats) {
      flags.push({ rule: 'R6', id, month, detail: `monthly load factor ${((100 * r.total_passengers) / r.total_seats).toFixed(1)}%` });
    }
    out.push([id, month, r.total_departures, r.total_passengers, r.total_seats, domPax, intlPax, domDep, intlDep, r.total_freight_lbs ?? 0]);
  }
  return { rows: out, flags };
}

export interface RouteAggregation {
  originYears: RouteOriginYear[];
  origins: Map<string, { code: string; state: string; city: string }>;
}

/** FMG route-level rows for one year -> per-origin aggregates. Unknown class/config codes abort the refresh (R11′). */
export function aggregateRoutes(rows: Record<string, string>[], year: number): RouteAggregation {
  const byOrigin = new Map<string, RouteOriginYear & { months: Set<number>; dests: Map<string, { departures: number; passengers: number; distance: number }> }>();
  const origins: RouteAggregation['origins'] = new Map();
  for (const r of rows) {
    const cls = r.CLASS ?? '';
    const config = r.AIRCRAFT_CONFIG ?? '';
    if (!isKnownServiceClass(cls)) throw new Error(`Unknown BTS service class "${cls}" (no approved rule; SCORING §4)`);
    if (!(KNOWN_AIRCRAFT_CONFIGS as readonly string[]).includes(config)) throw new Error(`Unknown AIRCRAFT_CONFIG "${config}"`);
    if (Number(r.YEAR) !== year) throw new Error(`Row year ${r.YEAR} in a ${year} download`);
    const id = r.ORIGIN_AIRPORT_ID ?? '';
    if (!id) throw new Error('Route row without ORIGIN_AIRPORT_ID');
    let o = byOrigin.get(id);
    if (!o) {
      o = {
        id, year, monthsCovered: [], allDepartures: 0, allPassengers: 0, allSeats: 0,
        passengerDepartures: 0, cargoOnlyDepartures: 0, noPassengerServiceDepartures: 0,
        scheduledPassengers: 0, charterPassengers: 0, cargoClassPassengers: 0, passengerRecordSeats: 0,
        allDeparturesByBand: [], passengerDeparturesByBand: [], longHaulDestinations: [], months: new Set(), dests: new Map(),
      };
      byOrigin.set(id, o);
      origins.set(id, { code: r.ORIGIN ?? '', state: r.ORIGIN_STATE_ABR ?? '', city: r.ORIGIN_CITY_NAME ?? '' });
    }
    const departures = num(r.DEPARTURES_PERFORMED, 'DEPARTURES_PERFORMED');
    const passengers = num(r.PASSENGERS, 'PASSENGERS');
    const seats = num(r.SEATS, 'SEATS');
    const distance = num(r.DISTANCE, 'DISTANCE');
    o.months.add(Number(r.MONTH));
    o.allDepartures += departures;
    o.allPassengers += passengers;
    o.allSeats += seats;
    const band = Math.floor(distance / 500);
    while (o.allDeparturesByBand.length <= band) o.allDeparturesByBand.push(0);
    o.allDeparturesByBand[band]! += departures;
    const kind = classifyRecord(cls, passengers);
    if (kind === 'cargoOnly') {
      o.cargoOnlyDepartures += departures;
      o.cargoClassPassengers += passengers;
      continue;
    }
    if (kind === 'passengerServiceNoPassengers') {
      o.noPassengerServiceDepartures += departures;
      continue;
    }
    o.passengerDepartures += departures;
    o.passengerRecordSeats += seats;
    if (cls === 'F') o.scheduledPassengers += passengers;
    else o.charterPassengers += passengers;
    while (o.passengerDeparturesByBand.length <= band) o.passengerDeparturesByBand.push(0);
    o.passengerDeparturesByBand[band]! += departures;
    if (distance >= LONG_HAUL_MILES) {
      const dest = r.DEST ?? '?';
      const d = o.dests.get(dest) ?? { departures: 0, passengers: 0, distance };
      d.departures += departures;
      d.passengers += passengers;
      o.dests.set(dest, d);
    }
  }
  const originYears = [...byOrigin.values()].map(({ months, dests, ...o }) => ({
    ...o,
    monthsCovered: [...months].sort((a, b) => a - b),
    longHaulDestinations: [...dests.entries()]
      .map(([dest, d]) => ({ dest, ...d }))
      .sort((a, b) => b.departures - a.departures || a.dest.localeCompare(b.dest))
      .slice(0, TOP_DESTINATIONS),
  }));
  return { originYears, origins };
}

/** Reconciliation: route-level sums by origin must equal r495 annual totals. Returns mismatches (empty = pass). */
export function reconcileRoutesWithR495(originYears: RouteOriginYear[], months: AirportMonthRow[]): string[] {
  const annual = new Map<string, { departures: number; passengers: number; seats: number }>();
  for (const [id, month, departures, passengers, seats] of months) {
    const key = `${id}|${month.slice(0, 4)}`;
    const a = annual.get(key) ?? { departures: 0, passengers: 0, seats: 0 };
    a.departures += departures;
    a.passengers += passengers;
    a.seats += seats;
    annual.set(key, a);
  }
  const mismatches: string[] = [];
  for (const o of originYears) {
    const a = annual.get(`${o.id}|${o.year}`);
    if (!a) continue; // airport absent from r495 for that year (checked separately)
    const off = (x: number, y: number) => Math.abs(x - y) > 0.5;
    if (off(a.passengers, o.allPassengers) || off(a.seats, o.allSeats) || off(a.departures, o.allDepartures)) {
      mismatches.push(`${o.id} ${o.year}: r495 ${a.passengers}/${a.seats}/${a.departures} vs routes ${o.allPassengers}/${o.allSeats}/${o.allDepartures}`);
    }
  }
  return mismatches;
}

const DELAY_FIELDS = [
  'arr_flights', 'arr_del15', 'carrier_ct', 'weather_ct', 'nas_ct', 'security_ct', 'late_aircraft_ct',
  'arr_cancelled', 'arr_diverted', 'arr_delay', 'carrier_delay', 'weather_delay', 'nas_delay', 'security_delay', 'late_aircraft_delay',
] as const;

/**
 * Delay Causes carrier×airport×month rows -> airport×month sums. Delay data has codes, not IDs, so codes are
 * mapped through a validated code->ID map (R1′); a code with no or several IDs is reported, never guessed.
 * Rows with blank arr_flights are skipped and counted (R11′: no imputation).
 */
export function aggregateDelays(
  rows: Record<string, string>[],
  codeToIds: Map<string, Set<string>>,
): { rows: DelayRow[]; flags: QualityFlag[]; skippedBlank: number; identityMismatches: number } {
  const acc = new Map<string, { id: string; month: string; v: number[]; carriers: Set<string> }>();
  const flags: QualityFlag[] = [];
  const unmapped = new Set<string>();
  let skippedBlank = 0;
  let identityMismatches = 0;
  for (const r of rows) {
    if (!r.arr_flights) { skippedBlank++; continue; }
    const code = r.airport ?? '';
    const ids = codeToIds.get(code);
    if (!ids || ids.size !== 1) { unmapped.add(`${code}:${ids ? 'ambiguous' : 'unknown'}`); continue; }
    const id = [...ids][0]!;
    const month = `${r.year}-${String(r.month).padStart(2, '0')}`;
    const v = DELAY_FIELDS.map((f) => num(r[f], f));
    const causeMinutes = v[10]! + v[11]! + v[12]! + v[13]! + v[14]!;
    if (Math.abs(v[9]! - causeMinutes) > 1) identityMismatches++;
    const key = `${id}|${month}`;
    const a = acc.get(key) ?? { id, month, v: DELAY_FIELDS.map(() => 0), carriers: new Set<string>() };
    v.forEach((x, i) => { a.v[i]! += x; });
    a.carriers.add(r.carrier ?? '');
    acc.set(key, a);
  }
  for (const u of unmapped) flags.push({ rule: 'R1', id: u.split(':')[0]!, detail: `delay airport code ${u.split(':')[1]} in code→ID map; rows not used` });
  const out: DelayRow[] = [...acc.values()]
    .sort((a, b) => a.id.localeCompare(b.id) || a.month.localeCompare(b.month))
    .map((a) => [a.id, a.month, ...a.v.map((x) => Math.round(x * 100) / 100), a.carriers.size]);
  return { rows: out, flags, skippedBlank, identityMismatches };
}

/** "Boston, MA: Logan International" -> parts. Foreign entries ("Toronto, Canada: …") return the country as state. */
export function parseLookupDescription(desc: string): { city: string; state: string; name: string } | undefined {
  const m = /^(.*), ([^:]+): (.*)$/.exec(desc);
  return m ? { city: m[1]!, state: m[2]!, name: m[3]! } : undefined;
}

/**
 * Airport directory for every r495 airport. State comes from BTS route-level ORIGIN_STATE_ABR (approved);
 * the L_AIRPORT_ID lookup supplies names and the fallback state, and any disagreement is flagged (R1′).
 */
export function buildAirports(
  r495: R495Row[],
  routeOrigins: Map<string, { code: string; state: string; city: string }>,
  lookup: Map<string, string>,
  routeCodes: Map<string, Set<string>> = new Map(),
): { airports: AirportRecord[]; flags: QualityFlag[] } {
  const flags: QualityFlag[] = [];
  const latest = new Map<string, R495Row>();
  for (const r of r495) latest.set(r.origin_airport_id, r); // rows are ordered by month, so the last wins
  const airports: AirportRecord[] = [];
  for (const [id, r] of latest) {
    const parsed = parseLookupDescription(lookup.get(id) ?? '');
    const route = routeOrigins.get(id);
    const state = route?.state || parsed?.state || '';
    if (route?.state && parsed && parsed.state !== route.state) {
      flags.push({ rule: 'R1', id, detail: `state differs: routes ${route.state}, L_AIRPORT_ID ${parsed.state}` });
    }
    if (!state) flags.push({ rule: 'R1', id, detail: 'no state in route data or lookup' });
    airports.push({
      id,
      code: r.origin_airport_code,
      name: parsed?.name ?? r.origin_airport_name.replace(/\s*\([A-Z0-9]{3,4}\)$/, ''),
      city: parsed?.city ?? route?.city.split(',')[0] ?? '',
      state,
      aliases: [...(routeCodes.get(id) ?? [])].filter((c) => c && c !== r.origin_airport_code).sort(),
    });
  }
  // An alias never overrides another airport's primary code (e.g. a stray XWA row under Granite Point AK).
  const primary = new Map(airports.map((a) => [a.code, a.id]));
  for (const a of airports) {
    const clashes = a.aliases.filter((c) => primary.has(c) && primary.get(c) !== a.id);
    for (const c of clashes) flags.push({ rule: 'R1', id: a.id, detail: `route-data alias ${c} dropped: it is the primary code of airport ${primary.get(c)}` });
    a.aliases = a.aliases.filter((c) => !clashes.includes(c));
  }
  airports.sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  return { airports, flags };
}

/**
 * code -> set of airport IDs, from the directory's primary codes and BTS-reported aliases (used to map Delay
 * Causes rows, R1′). A code shared by several IDs stays ambiguous and is rejected by the caller.
 */
export function codeToIdMap(airports: AirportRecord[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const a of airports) {
    for (const code of [a.code, ...a.aliases]) {
      const s = m.get(code) ?? new Set<string>();
      s.add(a.id);
      m.set(code, s);
    }
  }
  return m;
}
