import { z } from 'zod';
import { fetchWithTimeout } from './http';

export const R495_RESOURCE = 'https://data.bts.gov/resource/r495-tyji.json';
export const R495_METADATA = 'https://data.bts.gov/api/views/r495-tyji.json';

// Display names for the mangled fields are verified in DATA_SOURCES §1.
const FIELDS = {
  origin_airport_id: 'id',
  origin_airport_code: 'code',
  origin_airport_name: 'name',
  reporting_month: 'month',
  total_departures: 'departures',
  total_passengers: 'passengers',
  total_seats: 'seats',
  domestic_passengers: 'domesticPassengers',
  domestic_departures: 'domesticDepartures',
  outbound_international: 'intlOutboundDepartures', // "Outbound International Departures"
  outbound_international_1: 'intlOutboundPassengers', // "Outbound International Passengers"
  total_freight_lbs: 'freightLbs',
} as const;

// BTS sends numbers as strings; raw files written by older refreshes hold numbers. Both parse to number.
const optNum = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]).optional();
export const R495Row = z.object({
  origin_airport_id: z.string().min(1),
  origin_airport_code: z.string().min(1),
  origin_airport_name: z.string().default(''),
  reporting_month: z.string().regex(/^\d{4}-\d{2}-01T/),
  total_departures: optNum,
  total_passengers: optNum,
  total_seats: optNum,
  domestic_passengers: optNum,
  domestic_departures: optNum,
  outbound_international: optNum,
  outbound_international_1: optNum,
  total_freight_lbs: optNum,
});
export type R495Row = z.infer<typeof R495Row>;

export async function fetchR495Metadata(): Promise<{ rowsUpdatedAt: string }> {
  const meta = z.object({ rowsUpdatedAt: z.number() }).parse(await (await fetchWithTimeout(R495_METADATA, {}, 30_000)).json());
  return { rowsUpdatedAt: new Date(meta.rowsUpdatedAt * 1000).toISOString() };
}

export function r495Query(years: number[], limit: number, offset: number): string {
  const p = new URLSearchParams({
    $select: Object.keys(FIELDS).join(','),
    $where: `year in(${years.map((y) => `'${y}'`).join(',')})`,
    $order: 'origin_airport_id,reporting_month',
    $limit: String(limit),
    $offset: String(offset),
  });
  return `${R495_RESOURCE}?${p}`;
}

/** Pages through r495 for the given years (Socrata caps a page at 50,000 rows). */
export async function fetchR495Rows(years: number[]): Promise<{ rows: R495Row[]; raw: unknown[]; url: string }> {
  const raw: unknown[] = [];
  const limit = 50_000;
  for (let offset = 0; ; offset += limit) {
    const page = z.array(z.unknown()).parse(await (await fetchWithTimeout(r495Query(years, limit, offset), {}, 120_000)).json());
    raw.push(...page);
    if (page.length < limit) break;
  }
  return { rows: raw.map((r) => R495Row.parse(r)), raw, url: r495Query(years, limit, 0) };
}
