import { Injectable, Logger } from '@nestjs/common';
import type { LiveStatus } from '../../../shared/api';
import { computeNationalRanking, type NationalRanking } from '../analytics/ranking';
import { fetchR495Metadata } from '../refresh/r495';
import type { ToolContext } from '../tools/registry';
import { loadSnapshot, type DataIndex } from './data-index';

const LIVE_CHECK_TIMEOUT_MS = 2000;
const LIVE_CHECK_TTL_MS = 30 * 60_000;

/**
 * In-memory snapshot + precomputed national ranking, loaded once at boot.
 * The BTS freshness check is advisory: it never changes numbers, never blocks a request, never retries.
 */
@Injectable()
export class DataService implements ToolContext {
  private readonly logger = new Logger(DataService.name);
  readonly index: DataIndex;
  readonly national: NationalRanking;
  private liveStatus: LiveStatus = { checkedAt: null, state: 'not-checked', message: 'BTS freshness not checked yet.', latestBtsUpdate: null };
  private inFlight: Promise<void> | null = null;

  constructor() {
    const t0 = performance.now();
    this.index = loadSnapshot();
    this.national = computeNationalRanking(this.index);
    this.logger.log(`Snapshot ${this.index.version} loaded: ${this.index.airports.size} airports, ${this.national.rows.length} ranked, ${Math.round(performance.now() - t0)} ms`);
  }

  live = (): LiveStatus => {
    this.maybeCheck();
    return this.liveStatus;
  };

  /** Starts a background check when none ran recently. Disabled with LIVE_CHECK=off (tests, offline demos). */
  maybeCheck(enabled = process.env.LIVE_CHECK !== 'off'): void {
    if (!enabled || this.inFlight) return;
    const last = this.liveStatus.checkedAt ? Date.parse(this.liveStatus.checkedAt) : 0;
    if (Date.now() - last < LIVE_CHECK_TTL_MS) return;
    this.inFlight = this.check().finally(() => (this.inFlight = null));
  }

  async check(fetchMeta: () => Promise<{ rowsUpdatedAt: string }> = () => withTimeout(fetchR495Metadata(), LIVE_CHECK_TIMEOUT_MS)): Promise<void> {
    const vintage = this.index.sources.r495.vintage;
    const retrieved = this.index.sources.r495.retrievedAt.slice(0, 10);
    try {
      const { rowsUpdatedAt } = await fetchMeta();
      const newer = Date.parse(rowsUpdatedAt) > Date.parse(vintage);
      this.liveStatus = {
        checkedAt: new Date().toISOString(),
        state: newer ? 'newer-available' : 'current',
        latestBtsUpdate: rowsUpdatedAt,
        message: newer
          ? `BTS published newer T-100 data (${rowsUpdatedAt.slice(0, 10)}). Results use snapshot ${this.index.version}; run "npm run refresh" to update.`
          : `Snapshot matches the latest BTS T-100 update (${vintage.slice(0, 10)}).`,
      };
    } catch (e) {
      this.liveStatus = {
        checkedAt: new Date().toISOString(),
        state: 'unreachable',
        latestBtsUpdate: null,
        message: `BTS could not be reached (${(e as Error).message}). Serving the last valid snapshot, retrieved ${retrieved}; data may be stale.`,
      };
      this.logger.warn(this.liveStatus.message);
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms).unref())]);
}
