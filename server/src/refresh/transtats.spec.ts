import { delayCausesUrl, encodeYearMonth } from './transtats';

describe('Delay Causes URL encoding (verified against BTS on 2026-11-03)', () => {
  it('encodes YearMonth = year*12+month with digits shifted to letters', () => {
    expect(encodeYearMonth(2026, 8)).toBe('FHGFD'); // 24320
    expect(encodeYearMonth(2025, 1)).toBe('FHGDE'); // 24301
  });

  it('builds the raw-download query', () => {
    const url = delayCausesUrl({ year: 2025, month: 1 }, { year: 2026, month: 8 });
    expect(decodeURIComponent(url.split('8n4=')[1]!)).toBe('9ur4r Brn4z106u or69rr0 FHGDE NaQ FHGFD');
  });
});
