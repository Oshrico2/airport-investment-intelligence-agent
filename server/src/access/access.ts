import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AccessStatus } from '../../../shared/api';
import type { Env } from '../config/env';
import { MAX_TURNS, type SessionStore } from '../chat/sessions';
import { UpstashRedis, type Command, type Redis } from './redis';

/**
 * Production access codes and question quotas. On only on Vercel (VERCEL=1, set by the platform)
 * or with ACCESS_CONTROL=on (tests); local development never needs a code.
 *
 * Storage (Upstash Redis, shared by every serverless instance and deployment), all keys under `prefix`:
 *   code:<id>      hash  label, kind, limit, used, attempts, revoked, createdAt, lastUsedAt, enc
 *   codes          set   every code id;  label:<label> → id
 *   lock:<id>      the question currently running for that code (SET NX EX: one at a time per code), renewed while it
 *                  streams, so the lock of a request the platform cancelled lapses by itself
 *   q:<id>:<qid>   'done' once a question was answered (duplicates are never charged twice)
 *   fail:<ip>      failed code attempts in the last 15 minutes
 *   s:<ns>:<key>   conversation history (RedisSessionStore)
 * <id> is an HMAC of the code, so Redis never holds a code in clear; `enc` is the code encrypted with a key derived
 * from ACCESS_CODE_SECRET, so the owner can retrieve it with the admin CLI.
 *
 * Quota rule: a question is charged when its answer completes, just before `done` is sent, while the client is still
 * connected. A question that fails or is interrupted (Stop, refresh) is never charged, and nothing has to run after a
 * disconnect: Vercel stops a cancelled invocation, so no clean-up step could be relied on. Abuse limit: once a code has
 * ABANDON_CAP unfinished questions (attempts − used), each new question is charged when accepted, so aborting on
 * purpose cannot buy free answers.
 */
export const ABANDON_CAP = 10;
// Renewed as the answer streams (touch). The longest silence is a Claude request timing out and retrying once
// (2 × 30 s), so a live question never loses its lock; a cancelled one frees the code within this time.
export const LOCK_SECONDS = 90;
const DONE_SECONDS = 7 * 86_400;
const SESSION_SECONDS = 86_400;
const FAIL_WINDOW_SECONDS = 900;
const MAX_FAILS = 10;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

export const COOKIE = 'aia_access';

export type CodeKind = 'reviewer' | 'test';
export interface CodeRecord {
  id: string;
  label: string;
  kind: CodeKind;
  limit: number;
  used: number;
  unfinished: number; // accepted but never completed (failed or interrupted): attempts − used
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
/** `used` counts this question; `prepaid`: already charged at acceptance (the code reached ABANDON_CAP). */
export type Reserve = { ok: true; used: number; limit: number; prepaid: boolean } | { ok: false; reason: 'invalid' | 'revoked' | 'exhausted' | 'busy' | 'duplicate' };
export type Login = { ok: true; token: string; record: CodeRecord } | { ok: false; reason: 'invalid' | 'revoked' | 'throttled' };

/** `AIA-XXXX-XXXX-XXXX-XXXX`: 16 Crockford characters, 80 random bits. */
export function generateCode(): string {
  const c = Array.from({ length: 16 }, () => ALPHABET[randomInt(32)]).join('');
  return `AIA-${c.match(/.{4}/g)!.join('-')}`;
}

/** Tolerates case, spaces, dashes and the usual look-alikes (O→0, I/L→1). */
export function normalizeCode(input: string): string {
  const s = input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length === 19 && s.startsWith('A1A') ? s.slice(3) : s; // "AIA" became "A1A" above
}

export const accessEnabled = (env: Pick<Env, 'VERCEL' | 'ACCESS_CONTROL'>) => env.VERCEL === '1' || env.ACCESS_CONTROL === 'on';

/** null locally; on Vercel, refuses to start without its storage and secret (fail closed, never open). */
export function createAccess(env: Env): AccessControl | null {
  if (!accessEnabled(env)) return null;
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !env.ACCESS_CODE_SECRET) throw new Error('Access control is on, but the Redis REST URL/token or ACCESS_CODE_SECRET is missing. Refusing to start without access codes.');
  return new AccessControl(new UpstashRedis(url, token), env.ACCESS_CODE_SECRET, redisPrefix(env));
}

export const redisPrefix = (env: Pick<Env, 'VERCEL_ENV'>) => `aia:${env.VERCEL_ENV ?? 'local'}:`;

export function exhaustedMessage(limit: number, contact?: string): string {
  return `You have used all ${limit} questions for this access code. Please contact the developer for additional access${contact ? ` (${contact})` : ''}.`;
}

export function statusOf(r: CodeRecord, contact?: string): AccessStatus {
  const remaining = Math.max(0, r.limit - r.used);
  return { required: true, granted: true, used: Math.min(r.used, r.limit), limit: r.limit, remaining, ...(remaining ? {} : { message: exhaustedMessage(r.limit, contact) }) };
}

export class AccessControl {
  private readonly idKey: Buffer;
  private readonly cookieKey: Buffer;
  private readonly encKey: Buffer;

  constructor(readonly redis: Redis, secret: string, readonly prefix: string, private readonly now: () => number = Date.now) {
    const derive = (info: string) => Buffer.from(hkdfSync('sha256', secret, 'airport-investment-agent', info, 32));
    this.idKey = derive('code-id');
    this.cookieKey = derive('cookie');
    this.encKey = derive('code-enc');
  }

  private k = (...parts: string[]) => this.prefix + parts.join(':');
  codeId = (code: string) => createHmac('sha256', this.idKey).update(normalizeCode(code)).digest('hex').slice(0, 32);
  private sign = (id: string) => createHmac('sha256', this.cookieKey).update(id).digest('base64url');

  // ───────────── reviewers ─────────────

  async login(code: string, ip: string): Promise<Login> {
    const fails = Number(await this.redis.cmd<string | null>(['GET', this.k('fail', ip)]) ?? 0);
    if (fails >= MAX_FAILS) return { ok: false, reason: 'throttled' };
    const record = await this.record(this.codeId(code));
    if (!record) {
      await this.redis.pipeline([['INCR', this.k('fail', ip)], ['EXPIRE', this.k('fail', ip), FAIL_WINDOW_SECONDS]]);
      return { ok: false, reason: 'invalid' };
    }
    if (record.revoked) return { ok: false, reason: 'revoked' };
    return { ok: true, token: `${record.id}.${this.sign(record.id)}`, record };
  }

  /** The code behind a cookie token, or null for a missing, forged or unknown token. Revoked codes are returned. */
  async fromToken(token: string | undefined): Promise<CodeRecord | null> {
    const [id, sig] = (token ?? '').split('.');
    if (!id || !sig) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(this.sign(id));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return this.record(id);
  }

  async record(id: string): Promise<CodeRecord | null> {
    return parseRecord(id, await this.redis.cmd<string[]>(['HGETALL', this.k('code', id)]));
  }

  /** Accepts one question: one running question per code (SET NX), then every check under that lock. Not charged yet. */
  async reserve(id: string, questionId: string): Promise<Reserve> {
    const lock = this.k('lock', id);
    const q = this.k('q', id, questionId);
    if ((await this.redis.cmd(['SET', lock, questionId, 'NX', 'EX', LOCK_SECONDS])) !== 'OK') {
      return { ok: false, reason: (await this.redis.cmd(['GET', q])) === 'done' ? 'duplicate' : 'busy' };
    }
    try {
      const [raw, state] = (await this.redis.pipeline([['HGETALL', this.k('code', id)], ['GET', q]])) as [string[], string | null];
      const r = parseRecord(id, raw);
      const reason = !r ? 'invalid' : r.revoked ? 'revoked' : state === 'done' ? 'duplicate' : r.used >= r.limit ? 'exhausted' : null;
      if (reason || !r) {
        await this.redis.cmd(['DEL', lock]);
        return { ok: false, reason: reason ?? 'invalid' };
      }
      const code = this.k('code', id);
      const prepaid = r.unfinished >= ABANDON_CAP;
      await this.redis.pipeline([['HINCRBY', code, 'attempts', 1], ['HSET', code, 'lastUsedAt', new Date(this.now()).toISOString()], ...(prepaid ? [['HINCRBY', code, 'used', 1] as Command] : [])]);
      return { ok: true, used: r.used + 1, limit: r.limit, prepaid };
    } catch (e) {
      await this.redis.cmd(['DEL', lock]).catch(() => undefined);
      throw e;
    }
  }

  /** The running question is still streaming: keep its lock. */
  async touch(id: string): Promise<void> {
    await this.redis.cmd(['EXPIRE', this.k('lock', id), LOCK_SECONDS]);
  }

  /** Answered in full: charge it (unless prepaid), so its id can never be charged again, and free the code. */
  async complete(id: string, questionId: string, prepaid: boolean): Promise<void> {
    await this.redis.pipeline([...(prepaid ? [] : [['HINCRBY', this.k('code', id), 'used', 1] as Command]), ['SET', this.k('q', id, questionId), 'done', 'EX', DONE_SECONDS], ['DEL', this.k('lock', id)]]);
  }

  /** Not answered (the model failed): nothing to charge, free the code. The question may be asked again. */
  async release(id: string): Promise<void> {
    await this.redis.cmd(['DEL', this.k('lock', id)]);
  }

  /** Conversation history in Redis, namespaced per code by the caller's key. */
  sessions<M>(namespace: string): SessionStore<M> {
    return new RedisSessionStore<M>(this.redis, (key) => this.k('s', namespace, key));
  }

  // ───────────── owner (admin CLI) ─────────────

  async issue(label: string, kind: CodeKind, limit: number): Promise<string> {
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(label)) throw new Error('Label: lowercase letters, digits and dashes, e.g. reviewer-1');
    const existing = await this.byLabel(label).catch(() => null);
    if (existing && !existing.revoked) throw new Error(`${label} already exists and is active (use rotate to replace it)`);
    const code = generateCode();
    const id = this.codeId(code);
    await this.redis.pipeline([
      ['HSET', this.k('code', id), 'label', label, 'kind', kind, 'limit', limit, 'used', 0, 'attempts', 0, 'revoked', 0, 'createdAt', new Date(this.now()).toISOString(), 'enc', this.encrypt(code)],
      ['SADD', this.k('codes'), id],
      ['SET', this.k('label', label), id],
    ]);
    return code;
  }

  async list(): Promise<CodeRecord[]> {
    const ids = await this.redis.cmd<string[]>(['SMEMBERS', this.k('codes')]);
    const raws = ids.length ? await this.redis.pipeline(ids.map((id) => ['HGETALL', this.k('code', id)])) : [];
    return ids.map((id, i) => parseRecord(id, raws[i] as string[])).filter((r): r is CodeRecord => !!r).sort((a, b) => a.label.localeCompare(b.label) || a.createdAt.localeCompare(b.createdAt));
  }

  async reveal(label: string): Promise<string> {
    const r = await this.byLabel(label);
    const raw = await this.redis.cmd<string[]>(['HGETALL', this.k('code', r.id)]);
    return this.decrypt(fields(raw).enc ?? '');
  }

  async revoke(label: string): Promise<void> {
    await this.redis.cmd(['HSET', this.k('code', (await this.byLabel(label)).id), 'revoked', 1]);
  }

  async grant(label: string, extra: number): Promise<CodeRecord> {
    const r = await this.byLabel(label);
    await this.redis.cmd(['HINCRBY', this.k('code', r.id), 'limit', extra]);
    return (await this.record(r.id))!;
  }

  async setUsed(label: string, used: number): Promise<CodeRecord> {
    const r = await this.byLabel(label);
    await this.redis.cmd(['HSET', this.k('code', r.id), 'used', used, 'attempts', used]);
    return (await this.record(r.id))!;
  }

  /** Revokes the code and issues a new one under the same label, kind and limit, with a fresh quota. */
  async rotate(label: string): Promise<string> {
    const r = await this.byLabel(label);
    await this.redis.cmd(['HSET', this.k('code', r.id), 'revoked', 1, 'label', `${label}~rotated`]);
    return this.issue(label, r.kind, r.limit);
  }

  private async byLabel(label: string): Promise<CodeRecord> {
    const id = await this.redis.cmd<string | null>(['GET', this.k('label', label)]);
    const r = id ? await this.record(id) : null;
    if (!r) throw new Error(`No code labelled ${label}`);
    return r;
  }

  private encrypt(code: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.encKey, iv);
    const data = Buffer.concat([c.update(code, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url');
  }

  private decrypt(enc: string): string {
    const b = Buffer.from(enc, 'base64url');
    const d = createDecipheriv('aes-256-gcm', this.encKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  }
}

/** History in Redis (same window and trimming rule as MemorySessionStore), expiring 24 h after the last turn. */
export class RedisSessionStore<M> implements SessionStore<M> {
  constructor(private readonly redis: Redis, private readonly key: (id: string) => string) {}

  async load(id: string): Promise<{ items: M[]; trimmed: boolean }> {
    const s = await this.read(id);
    return { items: s.turns.flat(), trimmed: s.trimmed };
  }

  async append(id: string, turn: M[]): Promise<void> {
    const s = await this.read(id);
    const next = { trimmed: s.trimmed || s.turns.length >= MAX_TURNS, turns: [...s.turns, turn].slice(-MAX_TURNS) };
    await this.redis.cmd(['SET', this.key(id), JSON.stringify(next), 'EX', SESSION_SECONDS]);
  }

  private async read(id: string): Promise<{ turns: M[][]; trimmed: boolean }> {
    const raw = await this.redis.cmd<string | null>(['GET', this.key(id)]);
    return raw ? (JSON.parse(raw) as { turns: M[][]; trimmed: boolean }) : { turns: [], trimmed: false };
  }
}

const fields = (raw: string[] | null | undefined): Record<string, string> => Object.fromEntries((raw ?? []).flatMap((v, i, a) => (i % 2 ? [] : [[v, a[i + 1]!]])));

function parseRecord(id: string, raw: string[] | null | undefined): CodeRecord | null {
  const f = fields(raw);
  if (!f.label) return null;
  return { id, label: f.label, kind: f.kind === 'test' ? 'test' : 'reviewer', limit: Number(f.limit), used: Number(f.used), unfinished: Math.max(0, Number(f.attempts ?? f.used) - Number(f.used)), revoked: f.revoked === '1', createdAt: f.createdAt ?? '', lastUsedAt: f.lastUsedAt ?? null };
}
