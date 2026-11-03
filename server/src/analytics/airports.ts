import type { AirportRef, ResolveResult } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';

export const toRef = (a: AirportRecord): AirportRef => ({ id: a.id, code: a.code, name: a.name, city: a.city, state: a.state, aliases: a.aliases });

const passengers2025 = (index: DataIndex, id: string) => {
  let p = 0;
  for (const [m, v] of index.months.get(id) ?? []) if (m.startsWith('2025')) p += v.passengers;
  return p;
};

/**
 * Code (exact) first, then city / airport name. Returns every candidate when ambiguous (R1′: never guess),
 * e.g. "Hartford" -> BDL and HFD. Candidates are ordered by 2025 passengers so the likely one leads.
 */
export function resolveAirport(index: DataIndex, query: string): ResolveResult {
  const q = query.trim();
  const byCode = index.byCode.get(q.toUpperCase()) ?? [];
  let matches = byCode;
  if (!matches.length && q.length >= 3) {
    const needle = q.toLowerCase();
    matches = [...index.airports.values()].filter((a) => a.city.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle));
  }
  const ordered = [...matches].sort((a, b) => passengers2025(index, b.id) - passengers2025(index, a.id)).slice(0, 8);
  return { kind: 'resolve', query, matches: ordered.map(toRef), status: ordered.length === 0 ? 'none' : ordered.length === 1 ? 'unique' : 'ambiguous' };
}

/** Strict lookup used by the other tools: a code must identify exactly one airport. */
export function airportByCode(index: DataIndex, code: string): AirportRecord {
  const found = index.byCode.get(code.trim().toUpperCase()) ?? [];
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Error(`Airport code ${code} is ambiguous in BTS data (${found.map((a) => a.id).join(', ')}).`);
  throw new Error(`No airport with code "${code}" in the BTS snapshot. Use resolve_airport to search by name or city.`);
}
