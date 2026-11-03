/** Latency check for the in-memory analytics (target: ~10 ms per common call). Run: npm run bench */
import { performance } from 'node:perf_hooks';
import { loadSnapshot } from '../data/data-index';
import { airportByCode, resolveAirport } from './airports';
import { capacityPressure } from './capacity';
import { compareDelays } from './delays';
import { longHaulShare } from './long-haul';
import { airportProfile } from './profile';
import { computeNationalRanking, rankAirports } from './ranking';

const t0 = performance.now();
const index = loadSnapshot();
const t1 = performance.now();
const national = computeNationalRanking(index);
const t2 = performance.now();
console.log(`load snapshot ${(t1 - t0).toFixed(0)} ms, precompute national ranking ${(t2 - t1).toFixed(1)} ms (boot-time, once)`);

const calls: [string, () => unknown][] = [
  ['rank_airports(us, 25)', () => rankAirports(index, national, { limit: 25 })],
  ['rank_airports(New England)', () => rankAirports(index, national, { region: 'New England' })],
  ['get_airport_profile(BOS)', () => airportProfile(index, national, airportByCode(index, 'BOS'))],
  ['get_long_haul_share(ANC)', () => longHaulShare(index, airportByCode(index, 'ANC'))],
  ['compare_delays(LAX,SNA)', () => compareDelays(index, [airportByCode(index, 'LAX'), airportByCode(index, 'SNA')])],
  ['get_capacity_pressure(SFO)', () => capacityPressure(index, airportByCode(index, 'SFO'))],
  ['resolve_airport(hartford)', () => resolveAirport(index, 'hartford')],
];
for (const [name, fn] of calls) {
  fn();
  const n = 200;
  const s = performance.now();
  for (let i = 0; i < n; i++) fn();
  console.log(`${name.padEnd(30)} ${((performance.now() - s) / n).toFixed(3)} ms`);
}
