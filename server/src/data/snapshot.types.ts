/** On-disk snapshot format (data/snapshots/<version>/). Written by `npm run refresh`, read at server boot. */

export interface AirportRecord {
  id: string; // BTS ORIGIN_AIRPORT_ID, the join key (R1′)
  code: string; // IATA/FAA code as used by BTS
  name: string;
  city: string;
  state: string; // BTS state/territory abbreviation (ORIGIN_STATE_ABR)
  aliases: string[]; // other codes BTS route data reports for the same airport ID (e.g. PBI for DJT)
}

/** Column order of airport-month rows (r495). Values are integers; null components were 0 only when R4′ allowed it. */
export const AIRPORT_MONTH_COLUMNS = [
  'id',
  'month', // YYYY-MM
  'departures',
  'passengers',
  'seats',
  'domesticPassengers',
  'intlOutboundPassengers',
  'domesticDepartures',
  'intlOutboundDepartures',
  'freightLbs',
] as const;
export type AirportMonthRow = [string, string, number, number, number, number, number, number, number, number];

export interface RouteOriginYear {
  id: string;
  year: number;
  monthsCovered: number[];
  allDepartures: number; // every row, any class (equals r495 total_departures)
  allPassengers: number;
  allSeats: number;
  passengerDepartures: number; // class F/L with passengers > 0
  cargoOnlyDepartures: number; // class G/P
  noPassengerServiceDepartures: number; // class F/L rows reporting 0 passengers
  scheduledPassengers: number; // class F
  charterPassengers: number; // class L ("Charter, Non-scheduled Passenger Flights")
  cargoClassPassengers: number; // passengers reported on G/P rows (tiny; documented)
  passengerRecordSeats: number;
  /** departures of every row (cargo included) by 500-statute-mile band; context for passenger shares. */
  allDeparturesByBand: number[];
  /** passenger-record departures by 500-statute-mile band: index i covers [500*i, 500*(i+1)). */
  passengerDeparturesByBand: number[];
  /** top destinations of passenger-record departures with DISTANCE ≥ 3,000 mi. */
  longHaulDestinations: { dest: string; departures: number; passengers: number; distance: number }[];
}

export const DELAY_COLUMNS = [
  'id',
  'month',
  'arrFlights',
  'arrDel15',
  'carrierCt',
  'weatherCt',
  'nasCt',
  'securityCt',
  'lateAircraftCt',
  'arrCancelled',
  'arrDiverted',
  'arrDelayMin',
  'carrierDelayMin',
  'weatherDelayMin',
  'nasDelayMin',
  'securityDelayMin',
  'lateAircraftDelayMin',
  'carriers',
] as const;
export type DelayRow = [string, string, ...number[]];

export interface SourceManifest {
  id: 'r495' | 'fmg' | 'delayCauses' | 'lookupAirportId';
  name: string;
  url: string;
  params: Record<string, string>;
  coverage: { from: string; to: string }; // YYYY-MM
  retrievedAt: string; // ISO timestamp
  vintage: string; // dataset update time (r495 rowsUpdatedAt) or retrieval date for TranStats
  rawSha256: string[];
  rowCount: number;
}

export interface QualityFlag {
  rule: 'R4' | 'R6' | 'R11' | 'R1';
  id: string;
  month?: string;
  detail: string;
}

export interface Manifest {
  version: string;
  createdAt: string;
  sources: SourceManifest[];
  checks: { name: string; passed: boolean; detail: string }[];
  qualityFlags: QualityFlag[];
}

export interface Snapshot {
  manifest: Manifest;
  airports: AirportRecord[];
  airportMonths: AirportMonthRow[];
  routeOriginYears: RouteOriginYear[];
  delayMonths: DelayRow[];
}
