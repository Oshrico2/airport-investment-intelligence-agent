import { airport, delay, makeIndex, months, route } from '../testing/fixtures';
import { airportByCode, resolveAirport } from './airports';
import { capacityPressure } from './capacity';
import { compareDelays, delayPeriod } from './delays';
import { longHaulShare } from './long-haul';
import { airportProfile } from './profile';
import { computeNationalRanking, evaluateAirport, rankAirports } from './ranking';
import { resolveRegion } from './regions';
import { growthScore, loadScore, scoreBreakdown } from './scoring';

describe('scoring formulas (P1, P3, P4)', () => {
  it.each([[-30, 0], [-20, 0], [-10, 25], [0, 50], [10, 75], [20, 100], [35, 100]])('growth %p%% -> %p', (g, s) => expect(growthScore(g)).toBe(s));
  it.each([[50, 0], [60, 0], [75, 50], [90, 100], [95, 100]])('load factor %p%% -> %p', (lf, s) => expect(loadScore(lf)).toBeCloseTo(s, 10));
  it('weights growth 60% and load 40%', () => {
    expect(scoreBreakdown(10, 75)).toMatchObject({ growthScore: 75, loadScore: 50, overallScore: 65, growthContribution: 45, loadContribution: 20 });
  });
});

describe('regions (N5, M6)', () => {
  it('resolves names, ids and state lists deterministically', () => {
    expect(resolveRegion('New England').states).toEqual(['CT', 'ME', 'MA', 'NH', 'RI', 'VT']);
    expect(resolveRegion('new-england').id).toBe('new-england');
    expect(resolveRegion(['ma', 'NH']).states).toEqual(['MA', 'NH']);
    expect(resolveRegion().id).toBe('us');
    expect(resolveRegion('south').states).toContain('TX');
    expect(() => resolveRegion('Atlantis')).toThrow(/Unknown region/);
  });
});

const BIG = { passengers: 50_000, seats: 62_500 }; // 600k/yr, LF 80%
const base = () => {
  const a = airport('AAA', 'MA');
  const b = airport('BBB', 'CA');
  const c = airport('CCC', 'NH');
  return {
    a, b, c,
    rows: [
      ...months(a.id, 2024, BIG), ...months(a.id, 2025, { passengers: 55_000, seats: 62_500 }), // +10%
      ...months(b.id, 2024, BIG), ...months(b.id, 2025, BIG), // 0%
      ...months(c.id, 2024, { passengers: 30_000, seats: 40_000 }), ...months(c.id, 2025, { passengers: 33_000, seats: 40_000 }), // 396k: below threshold
    ],
  };
};

describe('eligibility (P5, Q1, R2′, R5′, R6′, R7′)', () => {
  it('ranks a complete airport above the threshold', () => {
    const { a, rows } = base();
    const e = evaluateAirport(makeIndex({ airports: [a], months: rows }), a);
    expect(e.reasons).toEqual([]);
    expect(e.row?.score).toMatchObject({ growthPercent: 10, loadFactorPercent: 88, growthScore: 75 });
  });

  it('explains every failing reason', () => {
    const x = airport('XXX', 'TX');
    const cases: [ReturnType<typeof months>, string[]][] = [
      [[...months(x.id, 2024, BIG), ...months(x.id, 2025, { passengers: 30_000, seats: 40_000 })], ['BELOW_THRESHOLD']],
      [[...months(x.id, 2024, BIG), ...months(x.id, 2025, BIG, [3])], ['INCOMPLETE_2025']],
      [months(x.id, 2025, BIG), ['NO_2024_BASELINE']],
      [[...months(x.id, 2024, BIG, [12]), ...months(x.id, 2025, BIG)], ['INCOMPLETE_2024']],
      [[...months(x.id, 2024, BIG), ...months(x.id, 2025, { passengers: 50_000, seats: 0 })], ['LF_UNAVAILABLE']],
      [[...months(x.id, 2024, BIG), ...months(x.id, 2025, { passengers: 50_000, seats: 40_000 })], ['INVALID_LOAD_FACTOR']],
    ];
    for (const [rows, codes] of cases) {
      expect(evaluateAirport(makeIndex({ airports: [x], months: rows }), x).reasons.map((r) => r.code)).toEqual(codes);
    }
  });

  it('says "on reported months" when an incomplete year is also below the threshold', () => {
    const x = airport('XXX', 'TX');
    const e = evaluateAirport(makeIndex({ airports: [x], months: [...months(x.id, 2024, BIG), ...months(x.id, 2025, { passengers: 10_000, seats: 20_000 }, [1, 2])] }), x);
    expect(e.reasons.find((r) => r.code === 'BELOW_THRESHOLD')?.message).toMatch(/10 reported months of 2025/);
  });
});

describe('ranking', () => {
  const { a, b, c, rows } = base();
  const index = makeIndex({ airports: [a, b, c], months: rows });
  const national = computeNationalRanking(index);

  it('orders by overall score and keeps national rank under a regional filter', () => {
    expect(national.rows.map((r) => r.airport.code)).toEqual(['AAA', 'BBB']);
    const ne = rankAirports(index, national, { region: 'New England' });
    expect(ne.rows.map((r) => [r.airport.code, r.nationalRank])).toEqual([['AAA', 1]]);
    expect(ne.nationalEligibleCount).toBe(2);
    expect(ne.excluded).toEqual([expect.objectContaining({ airport: expect.objectContaining({ code: 'CCC' }), reasons: [expect.objectContaining({ code: 'BELOW_THRESHOLD' })] })]);
  });

  it('breaks score ties on 2025 passengers, then code', () => {
    const d = airport('DDD', 'CA');
    const e = airport('EEE', 'CA');
    const idx = makeIndex({ airports: [e, d], months: [...months(d.id, 2024, BIG), ...months(d.id, 2025, BIG), ...months(e.id, 2024, BIG), ...months(e.id, 2025, BIG)] });
    expect(computeNationalRanking(idx).rows.map((r) => r.airport.code)).toEqual(['DDD', 'EEE']);
  });

  it('bounds the row limit', () => {
    expect(rankAirports(index, national, { limit: 1 }).rows).toHaveLength(1);
  });
});

describe('airport resolution (R1′)', () => {
  const idx = makeIndex({ airports: [{ ...airport('BDL', 'CT'), city: 'Hartford' }, { ...airport('HFD', 'CT'), city: 'Hartford' }], months: [] });
  it('returns every candidate for an ambiguous city', () => {
    const r = resolveAirport(idx, 'hartford');
    expect(r.status).toBe('ambiguous');
    expect(r.matches.map((m) => m.code).sort()).toEqual(['BDL', 'HFD']);
  });
  it('resolves exact codes and rejects unknown ones', () => {
    expect(resolveAirport(idx, 'bdl').status).toBe('unique');
    expect(() => airportByCode(idx, 'ZZZ')).toThrow(/No airport/);
  });
});

describe('long-haul share (Q2, N4, N9)', () => {
  const anc = airport('ANC', 'AK');
  const idx = makeIndex({ airports: [anc], months: [], routes: [route(anc.id, 2025)] });
  it('uses passenger departures performed at or above 3,000 miles', () => {
    const r = longHaulShare(idx, anc);
    expect(r).toMatchObject({ passengerDepartures: 800, longHaulPassengerDepartures: 100, longHaulSharePercent: 12.5, allLongHaulSharePercent: 30, cargoOnlyDepartures: 150 });
    expect(r.quality.status).toBe('complete');
  });
  it('reports unavailable data instead of guessing', () => {
    expect(longHaulShare(idx, anc, { year: 2024 }).quality.reasons[0]?.code).toBe('SNAPSHOT_COVERAGE');
    expect(() => longHaulShare(idx, anc, { minMiles: 2750 })).toThrow(/multiple of 500/);
  });
});

describe('delays (Q4, N7, R9′)', () => {
  const lax = airport('LAX', 'CA');
  const sna = airport('SNA', 'CA');
  const pvc = airport('PVC', 'MA');
  const ds = [...['2025-01', '2025-02'].map((m) => delay(lax.id, m)), delay(sna.id, '2025-01', { del: 100, min: 5000 })];
  const idx = makeIndex({ airports: [lax, sna, pvc], months: [], delays: ds, delaysTo: '2026-08' });

  it('computes rates from summed counts', () => {
    const r = compareDelays(idx, [lax, sna]);
    expect(r.airports[0]?.metrics).toMatchObject({ arrivals: 2000, delayedPercent: 20, cancelledPercent: 1, delayMinutesPerArrival: 12, causeSharePercent: { nas: 25, lateAircraft: 50 } });
    expect(r.airports[1]?.metrics).toMatchObject({ delayedPercent: 10, delayMinutesPerArrival: 5 });
    expect(r.airports[0]?.quality.status).toBe('partial'); // only 2 of 12 months in the fixture
  });

  it('labels the periods and reports missing delay data as unavailable', () => {
    expect(delayPeriod(idx, '2026-ytd')).toMatchObject({ label: 'Jan–Aug 2026', months: expect.arrayContaining(['2026-08']) });
    expect(delayPeriod(idx, '2025-same-months').months.at(-1)).toBe('2025-08');
    const r = compareDelays(idx, [pvc]);
    expect(r.airports[0]).toMatchObject({ metrics: null, quality: { status: 'unavailable' } });
    expect(r.notes.join(' ')).toMatch(/not a direct measure of terminal congestion/);
  });
});

describe('capacity pressure (D6, N10)', () => {
  const sfo = airport('SFO', 'CA');
  const rows = [
    ...months(sfo.id, 2019, { passengers: 100, seats: 125 }),
    ...months(sfo.id, 2024, { passengers: 90, seats: 100 }),
    ...months(sfo.id, 2025, { passengers: 95, seats: 100 }),
  ];
  rows.push([sfo.id, '2025-06', 100, 0, 0, 0, 0, 100, 0, 0]); // overwritten below: June peak
  const idx = makeIndex({ airports: [sfo], months: rows.filter((r) => !(r[1] === '2025-06' && r[3] === 0)).map((r) => (r[1] === '2025-06' ? [r[0], r[1], r[2], 99, 100, 99, 0, r[7], r[8], r[9]] as typeof r : r)), routes: [route(sfo.id, 2019, { passengerDepartures: 1000, passengerRecordSeats: 150_000 }), route(sfo.id, 2024), route(sfo.id, 2025)] });
  const r = capacityPressure(idx, sfo);
  it('separates passenger-service from cargo departures and compares with 2019 and 2024', () => {
    expect(r.current).toMatchObject({ passengerServiceDepartures: 800, cargoOnlyDepartures: 150, seatsPerPassengerDeparture: 150, monthsAtOrAbove90: 12 });
    expect(r.current.peakMonth).toEqual({ month: '2025-06', loadFactorPercent: 99 });
    expect(r.changes.map((c) => c.vsYear)).toEqual([2019, 2024]);
    expect(r.changes[0]?.passengerServiceDeparturesPercent).toBe(-20);
    expect(r.cannotInfer.length).toBeGreaterThan(2);
  });
});

describe('airport profile', () => {
  const { a, rows } = base();
  const idx = makeIndex({ airports: [a], months: [...rows, ...months(a.id, 2026, { passengers: 60_000, seats: 62_500 }, [], 7)], routes: [route(a.id, 2025)] });
  const p = airportProfile(idx, computeNationalRanking(idx), a);
  it('reports growth, charter share and same-months 2026 comparison (N6, N7)', () => {
    expect(p.growthPercent2025).toBe(10);
    expect(p.charter).toMatchObject({ charterSharePercent: 10, label: 'Charter / Non-scheduled Passenger Flights' });
    expect(p.ytd).toMatchObject({ label: 'Jan–Jul 2026 vs Jan–Jul 2025', passengerChangePercent: 9.1 });
    expect(p.ranking).toMatchObject({ eligible: true, nationalRank: 1 });
    expect(p.monthly).toHaveLength(12 + 7);
  });
});
