import { aggregateDelays, aggregateRoutes, buildAirportMonths, buildAirports, codeToIdMap, parseLookupDescription, reconcileRoutesWithR495 } from './derive';
import type { R495Row } from './r495';

const r495 = (o: Partial<R495Row> & { id?: string; m?: string }): R495Row => ({
  origin_airport_id: o.id ?? '10299',
  origin_airport_code: 'ANC',
  origin_airport_name: 'Ted Stevens Anchorage International (ANC)',
  reporting_month: `${o.m ?? '2025-07'}-01T00:00:00.000`,
  total_departures: 10,
  total_passengers: 100,
  total_seats: 150,
  domestic_passengers: 90,
  domestic_departures: 9,
  outbound_international: 1,
  outbound_international_1: 10,
  total_freight_lbs: 5,
  ...o,
});

const route = (o: Record<string, string>): Record<string, string> => ({
  YEAR: '2025', MONTH: '1', ORIGIN_AIRPORT_ID: '10299', ORIGIN: 'ANC', ORIGIN_STATE_ABR: 'AK', ORIGIN_CITY_NAME: 'Anchorage, AK',
  DEST: 'SEA', DISTANCE: '1448.00', DEPARTURES_PERFORMED: '10.00', SEATS: '1500.00', PASSENGERS: '1200.00',
  CLASS: 'F', AIRCRAFT_CONFIG: '1', ...o,
});

describe('buildAirportMonths', () => {
  it('maps r495 rows and passes consistent rows without flags', () => {
    const { rows, flags } = buildAirportMonths([r495({})]);
    expect(rows).toEqual([['10299', '2025-07', 10, 100, 150, 90, 10, 9, 1, 5]]);
    expect(flags).toEqual([]);
  });

  it('treats null components as 0 only when the identity holds (R4′)', () => {
    const ok = buildAirportMonths([r495({ domestic_passengers: 100, domestic_departures: 10, outbound_international: undefined, outbound_international_1: undefined })]);
    expect(ok.flags).toEqual([]);
    const bad = buildAirportMonths([r495({ domestic_passengers: undefined })]);
    expect(bad.flags[0]).toMatchObject({ rule: 'R4', id: '10299', month: '2025-07' });
  });

  it('flags a monthly load factor above 100% without correcting it (R6′)', () => {
    const { rows, flags } = buildAirportMonths([r495({ total_seats: 50 })]);
    expect(rows[0]![4]).toBe(50);
    expect(flags[0]).toMatchObject({ rule: 'R6' });
  });

  it('rejects duplicate airport-months (V2)', () => {
    expect(() => buildAirportMonths([r495({}), r495({})])).toThrow(/V2/);
  });
});

describe('aggregateRoutes (N4, N9, O1)', () => {
  const agg = aggregateRoutes(
    [
      route({}),
      route({ MONTH: '2', DEST: 'DFW', DISTANCE: '3043.00', DEPARTURES_PERFORMED: '2.00', PASSENGERS: '300.00', SEATS: '340.00' }),
      route({ CLASS: 'P', AIRCRAFT_CONFIG: '1', DEST: 'HKG', DISTANCE: '5065.00', DEPARTURES_PERFORMED: '4.00', PASSENGERS: '0', SEATS: '0' }), // all-cargo on a passenger config
      route({ CLASS: 'L', AIRCRAFT_CONFIG: '3', DEPARTURES_PERFORMED: '3.00', PASSENGERS: '20.00', SEATS: '60.00' }), // combi carrying passengers
      route({ CLASS: 'L', AIRCRAFT_CONFIG: '1', DEPARTURES_PERFORMED: '5.00', PASSENGERS: '0', SEATS: '80.00' }), // passenger service, no passengers
      route({ CLASS: 'F', AIRCRAFT_CONFIG: '2', DEPARTURES_PERFORMED: '1.00', PASSENGERS: '2.00', SEATS: '2.00' }), // freight config with passengers
      route({ CLASS: 'F', AIRCRAFT_CONFIG: '4', DISTANCE: '40.00', DEPARTURES_PERFORMED: '6.00', PASSENGERS: '18.00', SEATS: '24.00' }), // seaplane
    ],
    2025,
  );
  const anc = agg.originYears[0]!;

  it('classifies by service class and reported passengers, not by configuration', () => {
    expect(anc.allDepartures).toBe(31);
    expect(anc.passengerDepartures).toBe(10 + 2 + 3 + 1 + 6);
    expect(anc.cargoOnlyDepartures).toBe(4);
    expect(anc.noPassengerServiceDepartures).toBe(5);
    expect(anc.charterPassengers).toBe(20);
    expect(anc.scheduledPassengers).toBe(1200 + 300 + 2 + 18);
  });

  it('counts long-haul (≥3,000 mi) passenger departures only, excluding the cargo flight to HKG', () => {
    const longHaul = anc.passengerDeparturesByBand.slice(6).reduce((a, b) => a + b, 0);
    expect(longHaul).toBe(2);
    expect(anc.longHaulDestinations).toEqual([{ dest: 'DFW', departures: 2, passengers: 300, distance: 3043 }]);
    expect(anc.monthsCovered).toEqual([1, 2]);
    expect(anc.allDeparturesByBand.slice(6).reduce((a, b) => a + b, 0)).toBe(2 + 4); // includes the cargo flight
  });

  it('records origin state for the airport directory', () => {
    expect(agg.origins.get('10299')).toEqual({ code: 'ANC', state: 'AK', city: 'Anchorage, AK' });
  });

  it('aborts on an unknown service class or configuration (R11′)', () => {
    expect(() => aggregateRoutes([route({ CLASS: 'Z' })], 2025)).toThrow(/Unknown BTS service class/);
    expect(() => aggregateRoutes([route({ AIRCRAFT_CONFIG: '7' })], 2025)).toThrow(/AIRCRAFT_CONFIG/);
  });
});

describe('reconcileRoutesWithR495 (V12)', () => {
  it('passes when sums match and reports mismatches otherwise', () => {
    const months = buildAirportMonths([r495({ m: '2025-01', total_passengers: 1200, domestic_passengers: 1190, total_seats: 1500 })]).rows;
    const [o] = aggregateRoutes([route({})], 2025).originYears;
    expect(reconcileRoutesWithR495([o!], months)).toEqual([]);
    expect(reconcileRoutesWithR495([{ ...o!, allPassengers: 1 }], months)).toHaveLength(1);
  });
});

describe('aggregateDelays', () => {
  const row = (o: Record<string, string>) => ({
    year: '2025', month: '8', carrier: 'WN', airport: 'LAX', arr_flights: '100', arr_del15: '20', carrier_ct: '5', weather_ct: '1',
    nas_ct: '4', security_ct: '0', late_aircraft_ct: '10', arr_cancelled: '1', arr_diverted: '0', arr_delay: '600', carrier_delay: '150',
    weather_delay: '30', nas_delay: '120', security_delay: '0', late_aircraft_delay: '300', ...o,
  });
  const map = new Map([['LAX', new Set(['12892'])], ['XYZ', new Set(['1', '2'])]]);

  it('sums carriers per airport-month and maps codes to IDs', () => {
    const r = aggregateDelays([row({}), row({ carrier: 'AA' })], map);
    expect(r.rows).toEqual([['12892', '2025-08', 200, 40, 10, 2, 8, 0, 20, 2, 0, 1200, 300, 60, 240, 0, 600, 2]]);
    expect(r.identityMismatches).toBe(0);
  });

  it('skips blank rows and never guesses ambiguous or unknown codes', () => {
    const r = aggregateDelays([row({ arr_flights: '' }), row({ airport: 'XYZ' }), row({ airport: 'QQQ' })], map);
    expect(r.rows).toEqual([]);
    expect(r.skippedBlank).toBe(1);
    expect(r.flags.map((f) => f.id).sort()).toEqual(['QQQ', 'XYZ']);
  });
});

describe('airport directory', () => {
  it('parses lookup descriptions', () => {
    expect(parseLookupDescription('Boston, MA: Logan International')).toEqual({ city: 'Boston', state: 'MA', name: 'Logan International' });
    expect(parseLookupDescription('garbage')).toBeUndefined();
  });

  it('takes state from route data, names from the lookup, and flags disagreements (R1′)', () => {
    const lookup = new Map([['10299', 'Anchorage, AK: Ted Stevens Anchorage International']]);
    const { airports, flags } = buildAirports([r495({})], aggregateRoutes([route({})], 2025).origins, lookup);
    expect(airports).toEqual([{ id: '10299', code: 'ANC', name: 'Ted Stevens Anchorage International', city: 'Anchorage', state: 'AK', aliases: [] }]);
    expect(flags).toEqual([]);
    const other = buildAirports([r495({})], new Map([['10299', { code: 'ANC', state: 'HI', city: '' }]]), lookup);
    expect(other.flags[0]).toMatchObject({ rule: 'R1' });
    expect(codeToIdMap(airports).get('ANC')).toEqual(new Set(['10299']));
  });

  it('records codes BTS route data reports for the same ID as aliases (DJT reported as PBI)', () => {
    const rows = [r495({ id: '14027', origin_airport_code: 'DJT' })];
    const { airports } = buildAirports(rows, new Map(), new Map(), new Map([['14027', new Set(['PBI', 'DJT'])]]));
    expect(airports[0]?.aliases).toEqual(['PBI']);
    const map = codeToIdMap([...airports, { id: '99', code: 'PBI', name: '', city: '', state: 'FL', aliases: [] }]);
    expect(map.get('PBI')).toEqual(new Set(['14027', '99'])); // ambiguous: aggregateDelays rejects it
  });

  it('drops an alias that is another airport\'s primary code and flags it (R1′)', () => {
    const rows = [r495({ id: '15934', origin_airport_code: 'A8K' }), r495({ id: '16869', origin_airport_code: 'XWA' })];
    const { airports, flags } = buildAirports(rows, new Map(), new Map(), new Map([['15934', new Set(['XWA'])]]));
    expect(airports.find((a) => a.id === '15934')?.aliases).toEqual([]);
    expect(flags.filter((f) => f.detail.includes('alias'))).toEqual([expect.objectContaining({ rule: 'R1', id: '15934' })]);
  });
});
