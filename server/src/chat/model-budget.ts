/**
 * Local guard for one model's free-tier quota (requests per minute and per day). It prevents spending a request
 * that Google would reject, and lets the agent go straight to the fallback model. Google resets daily quotas at
 * midnight Pacific time. Simplification: in-memory, single process; restarts reset the local count (Google's own limit
 * still applies, and a 429 marks the model exhausted).
 */
const pacificDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(t);

export class ModelBudget {
  private minute: number[] = [];
  private day = { key: '', count: 0 };
  private blockedUntil = 0;

  constructor(readonly model: string, readonly rpm: number, readonly rpd: number, private readonly now: () => number = Date.now) {}

  /** Reserves one request if both windows allow it. */
  tryTake(): boolean {
    const t = this.now();
    if (t < this.blockedUntil) return false;
    const key = pacificDay(t);
    if (this.day.key !== key) this.day = { key, count: 0 };
    this.minute = this.minute.filter((x) => t - x < 60_000);
    if (this.minute.length >= this.rpm || this.day.count >= this.rpd) return false;
    this.minute.push(t);
    this.day.count++;
    return true;
  }

  /** After a 429 from Google: block for the advised delay, or until the next Pacific day for a daily quota. */
  markExhausted(kind: 'minute' | 'day', retryAfterSeconds?: number): void {
    const t = this.now();
    if (kind === 'day') {
      this.day = { key: pacificDay(t), count: this.rpd };
      return;
    }
    this.blockedUntil = t + 1000 * (retryAfterSeconds ?? 60);
  }

  status(): { model: string; usedToday: number; rpd: number; rpm: number } {
    return { model: this.model, usedToday: this.day.key === pacificDay(this.now()) ? this.day.count : 0, rpd: this.rpd, rpm: this.rpm };
  }
}
