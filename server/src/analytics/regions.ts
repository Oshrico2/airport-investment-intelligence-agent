/**
 * Deterministic geographic filters: the user's New England definition plus US Census Bureau
 * regions and divisions, and the territories as their own group. Matching is by BTS state code only.
 */
export interface Region {
  id: string;
  label: string;
  states: string[];
}

const DIVISIONS: Region[] = [
  { id: 'new-england', label: 'New England', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'] },
  { id: 'middle-atlantic', label: 'Middle Atlantic', states: ['NJ', 'NY', 'PA'] },
  { id: 'east-north-central', label: 'East North Central', states: ['IL', 'IN', 'MI', 'OH', 'WI'] },
  { id: 'west-north-central', label: 'West North Central', states: ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'] },
  { id: 'south-atlantic', label: 'South Atlantic', states: ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV'] },
  { id: 'east-south-central', label: 'East South Central', states: ['AL', 'KY', 'MS', 'TN'] },
  { id: 'west-south-central', label: 'West South Central', states: ['AR', 'LA', 'OK', 'TX'] },
  { id: 'mountain', label: 'Mountain', states: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'] },
  { id: 'pacific', label: 'Pacific', states: ['AK', 'CA', 'HI', 'OR', 'WA'] },
];
// BTS codes for U.S. territories (verified in the snapshot's ORIGIN_STATE_ABR values).
export const TERRITORY_STATES = ['PR', 'VI', 'TT'];

const pick = (...ids: string[]) => ids.flatMap((id) => DIVISIONS.find((d) => d.id === id)?.states ?? []);
const REGIONS: Region[] = [
  ...DIVISIONS,
  { id: 'northeast', label: 'Northeast', states: pick('new-england', 'middle-atlantic') },
  { id: 'midwest', label: 'Midwest', states: pick('east-north-central', 'west-north-central') },
  { id: 'south', label: 'South', states: pick('south-atlantic', 'east-south-central', 'west-south-central') },
  { id: 'west', label: 'West', states: pick('mountain', 'pacific') },
  { id: 'territories', label: 'U.S. territories', states: TERRITORY_STATES },
];
export const US_STATES = [...new Set(DIVISIONS.flatMap((d) => d.states))];
export const UNITED_STATES: Region = { id: 'us', label: 'United States (incl. territories)', states: [...US_STATES, ...TERRITORY_STATES] };

export const ALL_REGIONS: Region[] = [UNITED_STATES, ...REGIONS];
export const REGION_IDS = ALL_REGIONS.map((r) => r.id);

/** Accepts a region id or label, or one or more state codes ("MA", "MA,NH"). Throws on anything else. */
export function resolveRegion(input?: string | string[]): Region {
  if (input === undefined || (Array.isArray(input) && input.length === 0) || input === '') return UNITED_STATES;
  const parts = (Array.isArray(input) ? input : input.split(/[,\s]+/)).map((s) => s.trim()).filter(Boolean);
  const joined = parts.join(' ').toLowerCase();
  const byName = [UNITED_STATES, ...REGIONS].find((r) => r.id === joined.replace(/\s+/g, '-') || r.label.toLowerCase() === joined);
  if (byName) return byName;
  const all = new Set(UNITED_STATES.states);
  const states = parts.map((p) => p.toUpperCase());
  const unknown = states.filter((s) => !all.has(s));
  if (unknown.length) throw new Error(`Unknown region or state code: ${unknown.join(', ')}. Use a state code or one of: ${REGION_IDS.join(', ')}`);
  return { id: states.join(','), label: states.join(', '), states };
}
