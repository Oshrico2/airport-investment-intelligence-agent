import type { DataIndex } from '../data/data-index';
import { monthsOf } from './util';

export interface Totals {
  passengers: number;
  seats: number;
  departures: number;
  domesticPassengers: number;
  intlOutboundPassengers: number;
  freightLbs: number;
  monthsReported: number;
  missingMonths: string[];
}

/** Sums reported months only; missing months are listed, never filled (R2′, R11′). */
export function sumMonths(index: DataIndex, id: string, months: string[]): Totals {
  const m = index.months.get(id);
  const t: Totals = { passengers: 0, seats: 0, departures: 0, domesticPassengers: 0, intlOutboundPassengers: 0, freightLbs: 0, monthsReported: 0, missingMonths: [] };
  for (const month of months) {
    const v = m?.get(month);
    if (!v) { t.missingMonths.push(month); continue; }
    t.monthsReported++;
    t.passengers += v.passengers;
    t.seats += v.seats;
    t.departures += v.departures;
    t.domesticPassengers += v.domesticPassengers;
    t.intlOutboundPassengers += v.intlOutboundPassengers;
    t.freightLbs += v.freightLbs;
  }
  return t;
}

export const sumYear = (index: DataIndex, id: string, year: number): Totals => sumMonths(index, id, monthsOf(year));
