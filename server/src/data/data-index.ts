import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { SourceRef } from '../../../shared/api';
import { SNAPSHOTS_DIR } from '../config/paths';
import type { AirportMonthRow, AirportRecord, DelayRow, Manifest, QualityFlag, RouteOriginYear } from './snapshot.types';

export interface MonthValues {
  departures: number;
  passengers: number;
  seats: number;
  domesticPassengers: number;
  intlOutboundPassengers: number;
  freightLbs: number;
}

export interface DelayValues {
  arrFlights: number;
  arrDel15: number;
  carrierCt: number;
  weatherCt: number;
  nasCt: number;
  securityCt: number;
  lateAircraftCt: number;
  arrCancelled: number;
  arrDiverted: number;
  arrDelayMin: number;
  carriers: number;
}

/** Everything the analytics need, indexed in memory once at boot. */
export interface DataIndex {
  version: string;
  manifest: Manifest;
  sources: Record<SourceRef['id'], SourceRef>;
  airports: Map<string, AirportRecord>;
  byCode: Map<string, AirportRecord[]>;
  months: Map<string, Map<string, MonthValues>>;
  routes: Map<string, RouteOriginYear>; // key `${id}|${year}`
  delays: Map<string, Map<string, DelayValues>>;
  flags: Map<string, QualityFlag[]>;
  coverage: { r495: { from: string; to: string }; delays: { from: string; to: string }; routeYears: number[] };
}

const ManifestSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  sources: z.array(z.object({
    id: z.enum(['r495', 'fmg', 'delayCauses', 'lookupAirportId']),
    name: z.string(),
    url: z.string(),
    params: z.record(z.string(), z.string()),
    coverage: z.object({ from: z.string(), to: z.string() }),
    retrievedAt: z.string(),
    vintage: z.string(),
    rawSha256: z.array(z.string()),
    rowCount: z.number(),
  })),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string() })),
  qualityFlags: z.array(z.object({ rule: z.enum(['R4', 'R6', 'R11', 'R1']), id: z.string(), month: z.string().optional(), detail: z.string() })),
});
const AirportSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), city: z.string(), state: z.string(), aliases: z.array(z.string()) });
const MonthRowSchema = z.tuple([z.string(), z.string().regex(/^\d{4}-\d{2}$/), z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]);
const DelayRowSchema = z.array(z.union([z.string(), z.number()])).length(18);

export function loadSnapshot(dir = SNAPSHOTS_DIR): DataIndex {
  const { version } = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(path.join(dir, 'current.json'), 'utf8')));
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, version, name), 'utf8'));
  const manifest = ManifestSchema.parse(read('manifest.json')) as Manifest;
  if (manifest.checks.some((c) => !c.passed)) throw new Error(`Snapshot ${version} has failed checks; refusing to serve it`);
  return buildIndex(
    manifest,
    z.array(AirportSchema).parse(read('airports.json')),
    z.array(MonthRowSchema).parse(read('airport-months.json')) as AirportMonthRow[],
    read('route-origin-years.json') as RouteOriginYear[], // produced by our own validated refresh; shape checked by tests
    z.array(DelayRowSchema).parse(read('delay-months.json')) as DelayRow[],
  );
}

export function buildIndex(manifest: Manifest, airportList: AirportRecord[], monthRows: AirportMonthRow[], routeRows: RouteOriginYear[], delayRows: DelayRow[]): DataIndex {
  const airports = new Map(airportList.map((a) => [a.id, a]));
  const byCode = new Map<string, AirportRecord[]>();
  for (const a of airportList) for (const c of [a.code, ...a.aliases]) byCode.set(c, [...(byCode.get(c) ?? []), a]);
  const months = new Map<string, Map<string, MonthValues>>();
  for (const [id, month, departures, passengers, seats, domesticPassengers, intlOutboundPassengers, , , freightLbs] of monthRows) {
    let m = months.get(id);
    if (!m) months.set(id, (m = new Map()));
    m.set(month, { departures, passengers, seats, domesticPassengers, intlOutboundPassengers, freightLbs });
  }
  const routes = new Map(routeRows.map((r) => [`${r.id}|${r.year}`, r]));
  const delays = new Map<string, Map<string, DelayValues>>();
  for (const row of delayRows) {
    const [id, month, ...v] = row as [string, string, ...number[]];
    const n = (i: number) => v[i] ?? 0;
    let m = delays.get(id);
    if (!m) delays.set(id, (m = new Map()));
    m.set(month, {
      arrFlights: n(0), arrDel15: n(1), carrierCt: n(2), weatherCt: n(3), nasCt: n(4), securityCt: n(5), lateAircraftCt: n(6),
      arrCancelled: n(7), arrDiverted: n(8), arrDelayMin: n(9), carriers: n(15),
    });
  }
  const flags = new Map<string, QualityFlag[]>();
  for (const f of manifest.qualityFlags) flags.set(f.id, [...(flags.get(f.id) ?? []), f]);
  const src = (id: SourceRef['id']): SourceRef => {
    const s = manifest.sources.find((x) => x.id === id);
    if (!s) throw new Error(`Manifest lacks source ${id}`);
    return { id, name: s.name, coverage: s.coverage, retrievedAt: s.retrievedAt, vintage: s.vintage };
  };
  const sources = { r495: src('r495'), fmg: src('fmg'), delayCauses: src('delayCauses'), lookupAirportId: src('lookupAirportId') };
  const routeYears = [...new Set(routeRows.map((r) => r.year))].sort();
  return { version: manifest.version, manifest, sources, airports, byCode, months, routes, delays, flags, coverage: { r495: sources.r495.coverage, delays: sources.delayCauses.coverage, routeYears } };
}
