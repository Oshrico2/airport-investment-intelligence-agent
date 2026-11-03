// Types shared by server and web. Declarations only: nothing here is emitted or bundled.
// Every number a user sees comes from one of these tool payloads.

export interface SourceRef {
  id: 'r495' | 'fmg' | 'delayCauses' | 'lookupAirportId';
  name: string;
  coverage: { from: string; to: string }; // YYYY-MM
  retrievedAt: string; // ISO
  vintage: string; // dataset update (r495 rowsUpdatedAt) or retrieval date
}

export type QualityStatus = 'complete' | 'partial' | 'excluded' | 'unavailable';

export type ReasonCode =
  | 'BELOW_THRESHOLD'
  | 'INCOMPLETE_2025'
  | 'INCOMPLETE_2024'
  | 'NO_2024_BASELINE'
  | 'LF_UNAVAILABLE'
  | 'INVALID_LOAD_FACTOR'
  | 'INCONSISTENT_ROWS'
  | 'MONTHLY_LF_ABOVE_100'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'NO_ROUTE_DATA'
  | 'NO_DELAY_DATA'
  | 'SNAPSHOT_COVERAGE';

export interface Quality {
  status: QualityStatus;
  reasons: { code: ReasonCode; message: string }[];
}

export interface AirportRef {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  aliases: string[]; // other codes BTS reports for the same airport (e.g. PBI for DJT)
}

export interface ScoreBreakdown {
  growthPercent: number; // 2025 vs 2024
  loadFactorPercent: number; // 2025
  growthScore: number;
  loadScore: number;
  overallScore: number;
  growthContribution: number; // 0.6 × growthScore
  loadContribution: number; // 0.4 × loadScore
}

export interface RankingRow {
  airport: AirportRef;
  nationalRank: number;
  passengers2025: number;
  passengers2024: number;
  score: ScoreBreakdown;
}

export interface ExcludedAirport {
  airport: AirportRef;
  passengers2025: number;
  reasons: { code: ReasonCode; message: string }[];
}

export interface RankingResult {
  kind: 'ranking';
  region: { id: string; label: string; states: string[] };
  eligibleCount: number; // within the region
  nationalEligibleCount: number;
  rows: RankingRow[];
  excluded: ExcludedAirport[]; // largest excluded airports in the region, with reasons
  excludedCount: number;
  method: { threshold: number; eligibilityYear: 2025; baselineYear: 2024; weights: { growth: 0.6; load: 0.4 } };
  sources: SourceRef[];
}

export interface YearTotals {
  year: number;
  passengers: number;
  seats: number;
  departures: number; // all r495 departures (cargo included)
  loadFactorPercent: number | null;
  domesticPassengers: number;
  intlOutboundPassengers: number;
  monthsReported: number;
}

export interface PeriodComparison {
  label: string; // e.g. "Jan–Jul 2026 vs Jan–Jul 2025"
  months: string[]; // the 2026 months compared
  current: { passengers: number; seats: number; loadFactorPercent: number | null };
  previous: { passengers: number; seats: number; loadFactorPercent: number | null };
  passengerChangePercent: number | null;
  missingMonths: string[];
}

export interface AirportProfileResult {
  kind: 'airportProfile';
  airport: AirportRef;
  years: YearTotals[]; // 2019, 2024, 2025 when present
  growthPercent2025: number | null;
  domesticSharePercent2025: number | null;
  charter: { charterPassengers: number; scheduledPassengers: number; charterSharePercent: number | null; label: string; btsDefinition: string } | null;
  ranking: { eligible: boolean; nationalRank: number | null; score: ScoreBreakdown | null; reasons: { code: ReasonCode; message: string }[] };
  ytd: PeriodComparison | null;
  monthly: { month: string; passengers: number; loadFactorPercent: number | null }[]; // 2025 + 2026
  quality: Quality;
  sources: SourceRef[];
}

export interface CompareAirportsResult {
  kind: 'compareAirports';
  airports: AirportProfileResult[];
  notFound: string[];
  sources: SourceRef[];
}

export interface LongHaulResult {
  kind: 'longHaul';
  airport: AirportRef;
  year: number;
  minMiles: number;
  passengerDepartures: number;
  longHaulPassengerDepartures: number;
  longHaulSharePercent: number | null;
  allDepartures: number; // context: every departure, cargo included
  allLongHaulDepartures: number;
  allLongHaulSharePercent: number | null;
  cargoOnlyDepartures: number;
  topDestinations: { dest: string; departures: number; passengers: number; distance: number }[];
  definition: string;
  limitations: string[];
  quality: Quality;
  sources: SourceRef[];
}

export interface DelayMetrics {
  arrivals: number;
  delayedPercent: number;
  cancelledPercent: number;
  divertedPercent: number;
  delayMinutesPerArrival: number;
  causeSharePercent: { carrier: number; weather: number; nas: number; security: number; lateAircraft: number };
  carriersReporting: number;
}

export interface DelayComparisonResult {
  kind: 'delays';
  period: { id: string; label: string; months: string[] };
  airports: { airport: AirportRef; metrics: DelayMetrics | null; quality: Quality }[];
  notes: string[];
  sources: SourceRef[];
}

export interface CapacityYear {
  year: number;
  passengers: number;
  seats: number;
  loadFactorPercent: number | null;
  allDepartures: number;
  passengerServiceDepartures: number | null; // route-level, N10
  cargoOnlyDepartures: number | null;
  seatsPerPassengerDeparture: number | null;
  peakMonth: { month: string; loadFactorPercent: number } | null;
  monthsAtOrAbove90: number;
  freightLbs: number;
}

export interface CapacityResult {
  kind: 'capacity';
  airport: AirportRef;
  current: CapacityYear;
  baselines: CapacityYear[];
  changes: { vsYear: number; passengersPercent: number | null; passengerServiceDeparturesPercent: number | null; seatsPerDeparturePercent: number | null }[];
  canInfer: string[];
  cannotInfer: string[];
  quality: Quality;
  sources: SourceRef[];
}

export interface ResolveResult {
  kind: 'resolve';
  query: string;
  matches: AirportRef[];
  status: 'unique' | 'ambiguous' | 'none';
}

export interface MethodologyResult {
  kind: 'methodology';
  topic: string;
  title: string;
  points: string[];
  sources: SourceRef[];
}

export interface SourcesResult {
  kind: 'sources';
  sources: SourceRef[];
  snapshotVersion: string;
  live: LiveStatus;
}

export interface LiveStatus {
  checkedAt: string | null;
  state: 'current' | 'newer-available' | 'unreachable' | 'not-checked';
  message: string;
  latestBtsUpdate: string | null;
}

export type ToolResult =
  | RankingResult
  | AirportProfileResult
  | CompareAirportsResult
  | LongHaulResult
  | DelayComparisonResult
  | CapacityResult
  | ResolveResult
  | MethodologyResult
  | SourcesResult;

/** Which agent answers a chat turn. Demo needs no key; the AI providers need their key in server/.env. */
export type ChatProvider = 'gemini' | 'claude' | 'demo';

/** GET /api/chat/providers */
export interface ProviderInfo {
  id: ChatProvider;
  label: string;
  available: boolean;
  model?: string; // primary model (Gemini also has a fallback)
  reason?: string; // why it is unavailable
}

/**
 * GET/POST /api/access. Production only: locally `required` is false and nothing is gated. `message` is set once the
 * code's questions are used up.
 */
export type AccessStatus =
  | { required: false }
  | { required: true; granted: false }
  | { required: true; granted: true; used: number; limit: number; remaining: number; message?: string };

/** Machine-readable `code` of an API error (`{ error, code }`), for the access and quota failures the UI handles. */
export type ApiErrorCode = 'access_required' | 'access_revoked' | 'access_throttled' | 'quota_exhausted' | 'question_running' | 'duplicate_question';

/** Server-Sent Events of POST /api/chat. `quota` (production): the code's questions used, including this one. */
export type ChatEvent =
  | { type: 'session'; sessionId: string; mode: 'ai' | 'demo'; provider: ChatProvider; quota?: { used: number; limit: number } }
  | { type: 'status'; stage: 'thinking' | 'tools' | 'writing'; label: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; ms: number; result: ToolResult | { kind: 'error'; message: string } }
  | { type: 'text_delta'; text: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; timings: Timings };

export interface Timings {
  modelRounds: number[]; // ms per model round trip
  models?: string[]; // model that answered each round (Gemini primary or fallback, or the Claude model)
  toolsMs: number;
  totalMs: number;
  firstTextMs: number | null;
}
