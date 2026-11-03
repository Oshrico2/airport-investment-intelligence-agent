import { ModelBudget } from './model-budget';

describe('ModelBudget (local free-tier guard)', () => {
  it('enforces requests per minute and per Pacific day', () => {
    let now = Date.parse('2026-11-03T18:00:00Z');
    const b = new ModelBudget('gemini-2.5-flash', 2, 3, () => now);
    expect([b.tryTake(), b.tryTake(), b.tryTake()]).toEqual([true, true, false]); // 2 per minute
    now += 61_000;
    expect(b.tryTake()).toBe(true); // 3rd of the day
    now += 61_000;
    expect(b.tryTake()).toBe(false); // daily limit 3
    expect(b.status()).toMatchObject({ usedToday: 3, rpd: 3 });
    now = Date.parse('2026-11-04T08:30:00Z'); // 00:30 Pacific next day
    expect(b.tryTake()).toBe(true);
  });

  it('honours a 429: per-minute retry delay, or the rest of the Pacific day', () => {
    let now = Date.parse('2026-11-03T18:00:00Z');
    const b = new ModelBudget('m', 10, 20, () => now);
    b.markExhausted('minute', 30);
    expect(b.tryTake()).toBe(false);
    now += 31_000;
    expect(b.tryTake()).toBe(true);
    b.markExhausted('day');
    now += 3_600_000;
    expect(b.tryTake()).toBe(false);
  });
});
