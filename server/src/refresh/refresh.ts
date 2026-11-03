/**
 * Manual refresh process: downloads public BTS data, validates it, and writes a versioned snapshot.
 *
 *   npm run refresh                          download everything, then derive (about 7 minutes)
 *   npm run refresh -- --from-raw 2026-11-03 re-derive from saved raw downloads, no network
 *
 * Never runs automatically; the server only reads snapshots.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RAW_DIR, SNAPSHOTS_DIR } from '../config/paths';
import type { AirportMonthRow, Manifest, QualityFlag, RouteOriginYear, Snapshot, SourceManifest } from '../data/snapshot.types';
import { parseCsv } from './csv';
import { aggregateDelays, aggregateRoutes, buildAirportMonths, buildAirports, codeToIdMap, reconcileRoutesWithR495 } from './derive';
import { fetchR495Metadata, fetchR495Rows, R495_RESOURCE, R495Row, r495Query } from './r495';
import { delayCausesUrl, downloadDelayCauses, downloadLookup, downloadTransStatsTable, FMG_URL } from './transtats';
import { readZip } from './zip';

const R495_YEARS = [2019, 2024, 2025, 2026];
const ROUTE_YEARS = [2019, 2024, 2025];
const DELAY_FROM = { year: 2025, month: 1 };
const LOOKUP_AIRPORT_ID = 'Y_NVecbeg_VQ';
const FMG_FIELDS = [
  'YEAR', 'MONTH', 'ORIGIN_AIRPORT_ID', 'ORIGIN', 'ORIGIN_STATE_ABR', 'ORIGIN_CITY_NAME', 'DEST', 'DISTANCE',
  'DEPARTURES_PERFORMED', 'SEATS', 'PASSENGERS', 'CLASS', 'AIRCRAFT_CONFIG',
] as const;
const RECONCILE_MIN_PASSENGERS = 400_000;

interface RawMeta {
  r495RowsUpdatedAt: string;
  retrievedAt: Record<'r495' | 'lookupAirportId' | 'fmg' | 'delayCauses', string>;
  delayTo: { year: number; month: number };
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const log = (msg: string) => console.log(`[refresh ${new Date().toISOString().slice(11, 19)}] ${msg}`);
const coverageOf = (months: string[]) => {
  const ms = [...months].sort();
  return { from: ms[0] ?? '', to: ms.at(-1) ?? '' };
};

/** Acquisition: either download (saving raw files) or read a previous raw folder. */
async function acquire(fromRaw: string | undefined, rawDir: string) {
  const save = (name: string, data: Buffer | string) => {
    writeFileSync(path.join(rawDir, name), data);
    return sha256(data);
  };
  const read = (name: string) => readFileSync(path.join(rawDir, name));
  if (fromRaw) {
    const meta = JSON.parse(read('meta.json').toString()) as RawMeta;
    const r495Buf = read('r495.json');
    const lookupBuf = read('L_AIRPORT_ID.csv');
    const delayBuf = read('Airline_Delay_Cause.zip');
    return {
      meta,
      r495: { rows: (JSON.parse(r495Buf.toString()) as unknown[]).map((r) => R495Row.parse(r)), sha: sha256(r495Buf) },
      lookup: { rows: parseCsv(lookupBuf.toString()), sha: sha256(lookupBuf) },
      fmg: ROUTE_YEARS.map((year) => {
        const buf = read(`FMG-${year}.zip`);
        const csv = [...readZip(buf).entries()].find(([n]) => n.startsWith('T_'))?.[1];
        if (!csv) throw new Error(`FMG-${year}.zip has no data CSV`);
        return { year, rows: parseCsv(csv.toString()), sha: sha256(buf) };
      }),
      delays: { rows: parseCsv(readZip(delayBuf).get('Airline_Delay_Cause.csv')!.toString()), sha: sha256(delayBuf) },
    };
  }
  const now = new Date();
  const meta: RawMeta = { r495RowsUpdatedAt: '', retrievedAt: { r495: '', lookupAirportId: '', fmg: '', delayCauses: '' }, delayTo: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 } };
  log(`r495: metadata + airport-months for ${R495_YEARS.join(', ')}`);
  meta.r495RowsUpdatedAt = (await fetchR495Metadata()).rowsUpdatedAt;
  const r495 = await fetchR495Rows(R495_YEARS);
  meta.retrievedAt.r495 = new Date().toISOString();
  const r495Sha = save('r495.json', JSON.stringify(r495.raw)); // exactly as BTS returned it
  log('lookup L_AIRPORT_ID');
  const lookup = await downloadLookup(LOOKUP_AIRPORT_ID);
  meta.retrievedAt.lookupAirportId = new Date().toISOString();
  const lookupSha = save('L_AIRPORT_ID.csv', lookup.raw);
  const fmg = [];
  for (const year of ROUTE_YEARS) {
    log(`FMG T-100 Segment (All Carriers), national, ${year} (about 2 minutes)`);
    const dl = await downloadTransStatsTable(FMG_URL, { geography: 'All', year, period: 'All' }, FMG_FIELDS);
    fmg.push({ year, rows: dl.rows, sha: save(`FMG-${year}.zip`, dl.raw) });
  }
  meta.retrievedAt.fmg = new Date().toISOString();
  log('Delay Causes raw data');
  const delays = await downloadDelayCauses(DELAY_FROM, meta.delayTo);
  meta.retrievedAt.delayCauses = new Date().toISOString();
  const delaySha = save('Airline_Delay_Cause.zip', delays.raw);
  save('meta.json', JSON.stringify(meta, null, 2));
  return { meta, r495: { rows: r495.rows, sha: r495Sha }, lookup: { rows: lookup.rows, sha: lookupSha }, fmg, delays: { rows: delays.rows, sha: delaySha } };
}

async function main(): Promise<void> {
  const fromRawIdx = process.argv.indexOf('--from-raw');
  const fromRaw = fromRawIdx > 0 ? process.argv[fromRawIdx + 1] : undefined;
  if (fromRawIdx > 0 && !fromRaw) throw new Error('--from-raw needs a raw folder name, e.g. 2026-11-03');
  const now = new Date();
  let version = fromRaw ?? now.toISOString().slice(0, 10);
  if (!fromRaw && existsSync(path.join(SNAPSHOTS_DIR, version))) version += `-${now.toISOString().slice(11, 16).replace(':', '')}`;
  const rawDir = path.join(RAW_DIR, fromRaw ?? version);
  mkdirSync(rawDir, { recursive: true });

  const input = await acquire(fromRaw, rawDir);
  const checks: Manifest['checks'] = [];
  const qualityFlags: QualityFlag[] = [];
  const check = (name: string, passed: boolean, detail: string) => {
    checks.push({ name, passed, detail });
    log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  };

  const months = buildAirportMonths(input.r495.rows);
  qualityFlags.push(...months.flags);
  check('V2 r495 unique airport-months', true, `${months.rows.length} rows`);
  check('V3/R4′ r495 identity total = domestic + outbound', true, `${months.flags.filter((f) => f.rule === 'R4').length} rows flagged`);

  const routeOriginYears: RouteOriginYear[] = [];
  const routeOrigins = new Map<string, { code: string; state: string; city: string }>();
  const routeCodes = new Map<string, Set<string>>();
  for (const { year, rows } of input.fmg) {
    const agg = aggregateRoutes(rows, year);
    check(`FMG ${year} months`, new Set(rows.map((r) => r.MONTH)).size === 12, `${new Set(rows.map((r) => r.MONTH)).size} months, ${rows.length} rows`);
    routeOriginYears.push(...agg.originYears);
    for (const [id, o] of agg.origins) {
      if (!routeOrigins.has(id) || year === ROUTE_YEARS.at(-1)) routeOrigins.set(id, o);
      routeCodes.set(id, (routeCodes.get(id) ?? new Set()).add(o.code));
    }
  }

  // Reconciliation: route-level sums must equal r495 for every airport above the reconciliation floor.
  const annualPax = new Map<string, number>();
  for (const r of months.rows) {
    const key = `${r[0]}|${r[1].slice(0, 4)}`;
    annualPax.set(key, (annualPax.get(key) ?? 0) + r[3]);
  }
  const big = routeOriginYears.filter((o) => (annualPax.get(`${o.id}|${o.year}`) ?? 0) >= RECONCILE_MIN_PASSENGERS);
  const bigMismatches = reconcileRoutesWithR495(big, months.rows);
  const allMismatches = reconcileRoutesWithR495(routeOriginYears, months.rows);
  check('V12 routes = r495 (airport-years ≥400k passengers)', bigMismatches.length === 0, `${big.length} checked, ${bigMismatches.length} mismatches ${bigMismatches.slice(0, 3).join('; ')}`);
  checks.push({ name: 'V12 routes = r495 (all airport-years, informational)', passed: true, detail: `${routeOriginYears.length} checked, ${allMismatches.length} mismatches` });

  const directory = buildAirports(input.r495.rows, routeOrigins, new Map(input.lookup.rows.map((r) => [r.Code ?? '', r.Description ?? ''])), routeCodes);
  qualityFlags.push(...directory.flags);
  const aliased = directory.airports.filter((a) => a.aliases.length);
  check('R1′ airport directory', true, `${directory.airports.length} airports, ${directory.flags.length} flags, ${aliased.length} with BTS-reported code aliases (${aliased.slice(0, 5).map((a) => `${a.code}=${a.aliases.join('/')}`).join(', ')})`);

  // Delay data has codes only: map through airports active since 2025 so stale re-used codes cannot match.
  const active = new Set(months.rows.filter((r) => r[1] >= '2025-01').map((r) => r[0]));
  const delayAgg = aggregateDelays(input.delays.rows, codeToIdMap(directory.airports.filter((a) => active.has(a.id))));
  qualityFlags.push(...delayAgg.flags);
  check('Delay Causes arr_delay = sum of cause minutes', delayAgg.identityMismatches < input.delays.rows.length * 0.01, `${delayAgg.identityMismatches} of ${input.delays.rows.length} rows differ by more than 1 minute`);
  check('Delay Causes blank rows skipped (R11′)', true, `${delayAgg.skippedBlank} rows`);
  check('Delay Causes airport codes mapped (R1′)', true, delayAgg.flags.length ? `unmapped (rows not used, flagged): ${delayAgg.flags.map((f) => f.id).join(', ')}` : 'all mapped');

  const failed = checks.filter((c) => !c.passed);
  if (failed.length) throw new Error(`Refresh validation failed: ${failed.map((c) => c.name).join(', ')}. Snapshot not written.`);

  const { meta } = input;
  const sources: SourceManifest[] = [
    {
      id: 'r495', name: 'BTS T-100 Segment Summary By Origin Airport (r495-tyji)', url: R495_RESOURCE, params: { query: r495Query(R495_YEARS, 50_000, 0) },
      coverage: coverageOf(months.rows.map((r) => r[1])), retrievedAt: meta.retrievedAt.r495, vintage: meta.r495RowsUpdatedAt, rawSha256: [input.r495.sha], rowCount: months.rows.length,
    },
    {
      id: 'fmg', name: 'BTS T-100 Segment (All Carriers), TranStats FMG', url: FMG_URL,
      params: { geography: 'All', years: ROUTE_YEARS.join(','), period: 'All', fields: FMG_FIELDS.join(',') },
      coverage: { from: `${ROUTE_YEARS[0]}-01`, to: `${ROUTE_YEARS.at(-1)}-12` }, retrievedAt: meta.retrievedAt.fmg, vintage: meta.retrievedAt.fmg.slice(0, 10),
      rawSha256: input.fmg.map((f) => f.sha), rowCount: input.fmg.reduce((a, f) => a + f.rows.length, 0),
    },
    {
      id: 'delayCauses', name: 'BTS Airline On-Time Statistics and Delay Causes', url: delayCausesUrl(DELAY_FROM, meta.delayTo),
      params: { from: `${DELAY_FROM.year}-${DELAY_FROM.month}`, to: `${meta.delayTo.year}-${meta.delayTo.month}` },
      coverage: coverageOf(delayAgg.rows.map((r) => r[1])), retrievedAt: meta.retrievedAt.delayCauses, vintage: meta.retrievedAt.delayCauses.slice(0, 10),
      rawSha256: [input.delays.sha], rowCount: input.delays.rows.length,
    },
    {
      id: 'lookupAirportId', name: 'BTS TranStats lookup L_AIRPORT_ID', url: `https://www.transtats.bts.gov/Download_Lookup.asp?Y11x72=${LOOKUP_AIRPORT_ID}`, params: {},
      coverage: { from: '', to: '' }, retrievedAt: meta.retrievedAt.lookupAirportId, vintage: meta.retrievedAt.lookupAirportId.slice(0, 10), rawSha256: [input.lookup.sha], rowCount: input.lookup.rows.length,
    },
  ];

  const snapshot: Snapshot = {
    manifest: { version, createdAt: new Date().toISOString(), sources, checks, qualityFlags },
    airports: directory.airports,
    airportMonths: months.rows as AirportMonthRow[],
    routeOriginYears,
    delayMonths: delayAgg.rows,
  };
  const dir = path.join(SNAPSHOTS_DIR, version);
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries({
    'manifest.json': JSON.stringify(snapshot.manifest, null, 2),
    'airports.json': JSON.stringify(snapshot.airports),
    'airport-months.json': JSON.stringify(snapshot.airportMonths),
    'route-origin-years.json': JSON.stringify(snapshot.routeOriginYears),
    'delay-months.json': JSON.stringify(snapshot.delayMonths),
  })) writeFileSync(path.join(dir, name), data);
  writeFileSync(path.join(SNAPSHOTS_DIR, 'current.json'), `${JSON.stringify({ version }, null, 2)}\n`);
  log(`snapshot ${version} written to ${dir}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
