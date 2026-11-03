import type { MethodologyResult, SourcesResult, LiveStatus } from '../../../shared/api';
import type { DataIndex } from '../data/data-index';
import { CHARTER_BTS_DEFINITION, CHARTER_LABEL } from './profile';

export const METHODOLOGY_TOPICS = ['scoring', 'eligibility', 'passenger-classification', 'data-quality', 'delays', 'long-haul', 'unmet-demand', 'sources'] as const;
export type MethodologyTopic = (typeof METHODOLOGY_TOPICS)[number];

const TOPICS: Record<MethodologyTopic, { title: string; points: string[] }> = {
  scoring: {
    title: 'How the investment score works',
    points: [
      'OverallScore = 0.60 × GrowthScore + 0.40 × LoadScore. Delays are a separate diagnostic and never enter the score.',
      'GrowthScore = clamp(50 + 2.5 × growth %, 0, 100): 0% growth scores 50, +20% or more scores 100, −20% or less scores 0. Growth compares full-year 2025 with full-year 2024 departing passengers.',
      'LoadScore = clamp((load factor % − 60) / 30 × 100, 0, 100): 60% scores 0, 75% scores 50, 90% or more scores 100. Load factor = 2025 passengers ÷ 2025 seats.',
      'All ratios are computed from summed counts, never by averaging monthly ratios.',
    ],
  },
  eligibility: {
    title: 'Who is ranked',
    points: [
      'All U.S. airports including territories are evaluated; regional filters narrow the view without changing scores.',
      'An airport is ranked only with at least 500,000 departing passengers in full-year 2025 and complete monthly data for both 2024 and 2025.',
      'Airports below the threshold or with incomplete data stay available for individual analysis, always with the reason they are not ranked.',
    ],
  },
  'passenger-classification': {
    title: 'What counts as a passenger flight',
    points: [
      'Route-level BTS rows count as passenger activity when the service class is F (scheduled) or L and passengers were reported, whatever the aircraft configuration (including combi, seaplane and freight-configured aircraft that carried passengers).',
      `Class L is labelled "${CHARTER_LABEL}" (${CHARTER_BTS_DEFINITION}).`,
      'Classes G and P (scheduled and non-scheduled all-cargo service) are cargo-only and excluded. Aircraft configuration alone is not used: some all-cargo flights are reported on passenger-configured aircraft.',
      'BTS rows aggregate a month of flights per carrier, route, aircraft type, class and configuration, so passengers are confirmed per row, not per flight.',
    ],
  },
  'data-quality': {
    title: 'Data-quality rules',
    points: [
      'Missing data is never filled or estimated. A month with no BTS row is reported as missing, because BTS does not distinguish zero activity from a missing report.',
      'Scores are not computed from incomplete years; invalid denominators (no seats) and impossible load factors (above 100%) are flagged, not corrected.',
      'Missing delay data never removes an otherwise eligible airport from the ranking.',
      'Every result names its sources, coverage period, retrieval date and data vintage.',
    ],
  },
  delays: {
    title: 'Delay comparison method',
    points: [
      'Source: BTS Airline On-Time Statistics and Delay Causes, summed over all reporting carriers per airport and month.',
      'Full-year 2025 is the primary comparison; the latest 2026 months are shown separately against the same months of 2025.',
      'Delays are arrival punctuality of domestic flights by U.S. reporting carriers, not a direct measure of terminal congestion.',
    ],
  },
  'long-haul': {
    title: 'Long-haul share',
    points: [
      'Long-haul means a segment distance of at least 3,000 statute miles.',
      'The share is computed from departures performed (not routes) of passenger flights, full-year 2025, from route-level BTS T-100 data.',
      'Cargo-only service is excluded; all-departures figures including cargo are shown only as context.',
    ],
  },
  'unmet-demand': {
    title: 'What BTS data can and cannot say about unmet demand',
    points: [
      'Measurable: capacity supplied (passenger-service departures, seats), aircraft gauge, and annual and peak-month load factors, compared with 2019 and 2024.',
      'Not measurable: spilled demand, slot or gate limits, fares and willingness to pay, demand diverted to other airports.',
      'High load factors with fewer flights are consistent with capacity pressure but are not proof of unmet demand.',
    ],
  },
  sources: {
    title: 'Data sources',
    points: [
      'BTS T-100 Segment Summary By Origin Airport (data.bts.gov r495-tyji): airport-month passengers, seats, departures, domestic and international.',
      'BTS T-100 Segment (All Carriers), TranStats: route-level distance, service class and aircraft configuration.',
      'BTS Airline On-Time Statistics and Delay Causes: carrier × airport × month arrival delays.',
      'Data is served from a versioned local snapshot built by a manual refresh; the server checks BTS for newer data without changing results.',
    ],
  },
};

export function describeMethodology(index: DataIndex, topic: MethodologyTopic): MethodologyResult {
  const t = TOPICS[topic];
  return { kind: 'methodology', topic, title: t.title, points: t.points, sources: Object.values(index.sources).filter((s) => s.id !== 'lookupAirportId') };
}

export function dataSources(index: DataIndex, live: LiveStatus): SourcesResult {
  return { kind: 'sources', sources: Object.values(index.sources), snapshotVersion: index.version, live };
}
