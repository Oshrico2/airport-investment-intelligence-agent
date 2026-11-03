/**
 * Suggested analyses shown on the first screen (the "Departures" board). The same catalogue drives the
 * optional Demo mode, which can answer exactly these questions without an AI key, and nothing else.
 */
export interface Suggestion {
  id: string;
  tile: string; // code tile shown on the board
  question: string;
  capability: string;
  demoPlan: { name: string; args: Record<string, unknown> }[];
}

export const SUGGESTIONS: Suggestion[] = [
  { id: 'national', tile: 'USA', capability: 'Rank airports', question: 'Which U.S. airports rank highest for investment right now?', demoPlan: [{ name: 'rank_airports', args: { limit: 15 } }] },
  { id: 'new-england', tile: 'NE', capability: 'Regional ranking', question: 'Rank the New England airports and explain which ones are excluded.', demoPlan: [{ name: 'rank_airports', args: { region: 'New England' } }] },
  { id: 'anc-long-haul', tile: 'ANC', capability: 'Long-haul share', question: "What share of Anchorage's passenger flights are long-haul (3,000+ miles)?", demoPlan: [{ name: 'get_long_haul_share', args: { airport: 'ANC' } }] },
  { id: 'lax-sna-delays', tile: 'LAX', capability: 'Delay comparison', question: 'Compare delays at LAX and SNA. Is either more congested?', demoPlan: [{ name: 'compare_delays', args: { airports: ['LAX', 'SNA'], period: '2025' } }, { name: 'compare_delays', args: { airports: ['LAX', 'SNA'], period: '2026-ytd' } }] },
  { id: 'sfo-demand', tile: 'SFO', capability: 'Capacity pressure', question: 'Is there unmet demand for flights at SFO?', demoPlan: [{ name: 'get_capacity_pressure', args: { airport: 'SFO' } }] },
  { id: 'bos-profile', tile: 'BOS', capability: 'Airport profile', question: 'Give me an investment profile of Boston Logan.', demoPlan: [{ name: 'get_airport_profile', args: { airport: 'BOS' } }] },
  { id: 'method', tile: 'FX', capability: 'Method', question: 'How is the investment score calculated?', demoPlan: [{ name: 'describe_methodology', args: { topic: 'scoring' } }] },
];
