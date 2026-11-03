import { render, screen } from '@testing-library/react';
import type { DelayComparisonResult, DelayMetrics, LongHaulResult, RankingResult, SourceRef } from '../../../shared/api';
import { TurnView } from '../components/TurnView';
import type { Turn } from '../lib/useChat';
import { ToolCard } from './cards';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) });
});

const src: SourceRef = { id: 'fmg', name: 'BTS T-100 Segment (All Carriers)', coverage: { from: '2019-01', to: '2025-12' }, retrievedAt: '2026-11-03T10:46:05Z', vintage: '2026-11-03' };
const airport = { id: '1', code: 'ANC', name: 'Ted Stevens Anchorage International', city: 'Anchorage', state: 'AK', aliases: [] };

describe('cards render only what the tool payload contains', () => {
  it('long-haul card shows the share, the cargo context and the definition', () => {
    const r: LongHaulResult = {
      kind: 'longHaul', airport, year: 2025, minMiles: 3000, passengerDepartures: 37966, longHaulPassengerDepartures: 1050, longHaulSharePercent: 2.77,
      allDepartures: 87988, allLongHaulDepartures: 27305, allLongHaulSharePercent: 31.03, cargoOnlyDepartures: 49820,
      topDestinations: [{ dest: 'DFW', departures: 376, passengers: 67000, distance: 3043 }], definition: 'Share of passenger-flight departures…', limitations: ['row-level'],
      quality: { status: 'complete', reasons: [] }, sources: [src],
    };
    render(<ToolCard result={r} actions={{}} />);
    expect(screen.getByText('2.77%')).toBeInTheDocument();
    expect(screen.getByText('31.03%')).toBeInTheDocument();
    expect(screen.getByText(/Share of passenger-flight departures/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'DFW' })).toBeInTheDocument();
    expect(screen.getByText('BTS T-100 route segments')).toBeInTheDocument();
  });

  it('ranking card lists rows, national ranks and exclusion reasons', () => {
    const row = (code: string, rank: number, score: number) => ({
      airport: { ...airport, id: code, code, name: `${code} Intl` }, nationalRank: rank, passengers2025: 700000, passengers2024: 600000,
      score: { growthPercent: 16.67, loadFactorPercent: 80, growthScore: 91.7, loadScore: 66.7, overallScore: score, growthContribution: 55, loadContribution: 26.7 },
    });
    const r: RankingResult = {
      kind: 'ranking', region: { id: 'new-england', label: 'New England', states: ['MA'] }, eligibleCount: 2, nationalEligibleCount: 144,
      rows: [row('HVN', 7, 80.3), row('PWM', 22, 67.8)], excluded: [{ airport: { ...airport, id: 'BGR', code: 'BGR', name: 'Bangor International' }, passengers2025: 437565, reasons: [{ code: 'BELOW_THRESHOLD', message: 'Below 500,000: 437,565 departing passengers in 2025.' }] }],
      excludedCount: 1, method: { threshold: 500000, eligibilityYear: 2025, baselineYear: 2024, weights: { growth: 0.6, load: 0.4 } }, sources: [src],
    };
    render(<ToolCard result={r} actions={{}} />);
    expect(screen.getByText('Investment ranking · New England')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '22' })).toBeInTheDocument();
    expect(screen.getByText(/437,565 departing passengers/)).toBeInTheDocument();
  });

  it('tool errors render as an explained failure', () => {
    render(<ToolCard result={{ kind: 'error', message: 'No airport with code "ZZZ"' }} actions={{}} />);
    expect(screen.getByText(/No airport with code/)).toBeInTheDocument();
  });
});

describe('an answer with several delay periods', () => {
  it('shows the shared congestion caveat once, not once per card', () => {
    const CAVEAT = 'Flight delays are not a direct measure of terminal congestion.';
    const metrics: DelayMetrics = { arrivals: 1000, delayedPercent: 18.7, delayMinutesPerArrival: 12.9, cancelledPercent: 1.2, divertedPercent: 0.2, carriersReporting: 8, causeSharePercent: { carrier: 30, weather: 5, nas: 24.5, security: 0.1, lateAircraft: 40 } };
    const delays = (label: string): DelayComparisonResult => ({
      kind: 'delays', period: { id: label, label, months: [] }, notes: ['Domestic arrivals only.', CAVEAT], sources: [src],
      airports: ['LAX', 'SNA'].map((code) => ({ airport: { ...airport, id: code, code }, metrics, quality: { status: 'complete' as const, reasons: [] } })),
    });
    const turn: Turn = {
      id: 't', question: 'Compare congestion at LAX and SNA.', status: 'done', mode: 'ai', provider: 'claude', steps: [], text: 'LAX is busier.', warnings: [],
      tools: ['Full-year 2025', 'Jan–Aug 2026', 'Jan–Aug 2025'].map((label, i) => ({ callId: `c${i}`, name: 'compare_delays', args: {}, ms: 0.1, result: delays(label) })),
    };
    render(<TurnView turn={turn} actions={{}} onEvidence={() => {}} selected={false} />);
    expect(screen.getAllByText(/Delays · LAX vs SNA/)).toHaveLength(3);
    expect(screen.getAllByText(CAVEAT)).toHaveLength(1);
  });
});
