/**
 * Golden values: the committed BTS snapshot must reproduce the figures verified independently during research
 *. A refresh that changes them
 * means BTS republished data, and these fixtures must be re-verified, not silently updated.
 */
import { loadSnapshot } from '../data/data-index';
import { airportByCode } from './airports';
import { capacityPressure } from './capacity';
import { compareDelays } from './delays';
import { longHaulShare } from './long-haul';
import { computeNationalRanking, rankAirports } from './ranking';
import { sumYear } from './totals';

const index = loadSnapshot();
const national = computeNationalRanking(index);
const code = (c: string) => airportByCode(index, c);

describe('golden: ranking universe', () => {
  it('ranks the 144 airports with ≥500k 2025 passengers and complete 2024/2025 data', () => {
    expect(national.rows).toHaveLength(144);
  });
  it('reproduces the observed score-input ranges', () => {
    const growth = national.rows.map((r) => r.score.growthPercent);
    const lf = national.rows.map((r) => r.score.loadFactorPercent);
    expect(Math.min(...growth)).toBeCloseTo(-14.7, 1);
    expect(Math.max(...growth)).toBeCloseTo(25.3, 1);
    expect(Math.min(...lf)).toBeCloseTo(65.8, 1);
    expect(Math.max(...lf)).toBeCloseTo(86.0, 1);
  });
});

describe('golden: New England eligibility', () => {
  const ne = rankAirports(index, national, { region: 'New England' });
  it('ranks exactly the 7 airports with ≥500k', () => {
    expect(ne.rows.map((r) => r.airport.code).sort()).toEqual(['BDL', 'BOS', 'BTV', 'HVN', 'MHT', 'PVD', 'PWM']);
  });
  it('excludes BGR as below threshold with its real passenger count', () => {
    const bgr = ne.excluded.find((e) => e.airport.code === 'BGR');
    expect(bgr?.passengers2025).toBe(437_565);
    expect(bgr?.reasons.map((r) => r.code)).toEqual(['BELOW_THRESHOLD']);
  });
  it.each([
    ['BOS', 21_305_085, 21_143_295],
    ['BDL', 3_299_417, 3_289_186],
    ['PVD', 1_990_715, 2_122_707],
    ['HVN', 589_274, 737_818],
  ])('%s passengers 2024/2025', (c, p24, p25) => {
    expect(sumYear(index, code(c).id, 2024).passengers).toBe(p24);
    expect(sumYear(index, code(c).id, 2025).passengers).toBe(p25);
  });
});

describe('golden: ANC long-haul 2025 (passenger-service rule)', () => {
  const r = longHaulShare(index, code('ANC'));
  it('passenger-record departures ≥3,000 mi', () => {
    expect([r.longHaulPassengerDepartures, r.passengerDepartures, r.longHaulSharePercent]).toEqual([1050, 37_966, 2.77]);
  });
  it('all departures including cargo, as context', () => {
    expect([r.allLongHaulDepartures, r.allDepartures, r.allLongHaulSharePercent]).toEqual([27_305, 87_988, 31.03]);
  });
});

describe('golden: LAX vs SNA delays', () => {
  const pick = (periodId: '2025' | '2026-ytd') => compareDelays(index, [code('LAX'), code('SNA')], periodId).airports.map((a) => a.metrics);
  it('full-year 2025', () => {
    const [lax, sna] = pick('2025');
    expect(lax).toMatchObject({ arrivals: 196_636, delayedPercent: 18.7, cancelledPercent: 0.78, delayMinutesPerArrival: 12.9, causeSharePercent: { nas: 24.5, lateAircraft: 34 } });
    expect(sna).toMatchObject({ arrivals: 46_037, delayedPercent: 18.2, cancelledPercent: 0.92, delayMinutesPerArrival: 9.9, causeSharePercent: { nas: 23.4, lateAircraft: 38.8 } });
  });
  it('Jan–Aug 2026', () => {
    const [lax, sna] = pick('2026-ytd');
    expect(lax).toMatchObject({ arrivals: 128_884, delayedPercent: 20.7, cancelledPercent: 1.1, delayMinutesPerArrival: 14.1 });
    expect(sna).toMatchObject({ arrivals: 30_497, delayedPercent: 18.6, cancelledPercent: 0.94, delayMinutesPerArrival: 10.3 });
  });
});

describe('golden: SFO capacity', () => {
  const r = capacityPressure(index, code('SFO'));
  it('r495 totals and load factors for 2019, 2024, 2025', () => {
    const byYear = Object.fromEntries([r.current, ...r.baselines].map((y) => [y.year, [y.allDepartures, y.passengers, y.loadFactorPercent]]));
    expect(byYear).toEqual({ 2019: [213_016, 27_877_799, 82.1], 2024: [177_573, 25_301_280, 83.2], 2025: [190_110, 26_488_386, 82.3] });
  });
  it('June 2024 is the 2024 peak at 91.2%', () => {
    expect(r.baselines.find((b) => b.year === 2024)?.peakMonth).toEqual({ month: '2024-06', loadFactorPercent: 91.2 });
  });
});
