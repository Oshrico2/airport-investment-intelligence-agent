/** Fixed-window per-client limiter protecting the Gemini free-tier quota. Simplification: in-memory, single process. */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}

  /** Returns seconds to wait, or 0 when allowed. */
  check(key: string): number {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.windowStart >= 60_000) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) this.hits.clear(); // Simplification: bound memory; a burst of new clients resets windows
      return 0;
    }
    if (h.count >= this.perMinute) return Math.ceil((60_000 - (t - h.windowStart)) / 1000);
    h.count++;
    return 0;
  }
}
