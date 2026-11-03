/** A Redis command as Upstash's REST API takes it: ['SET', 'key', 'value', 'NX']. */
export type Command = (string | number)[];

/** The slice of Redis the access layer uses. Upstash in production; MemoryRedis in tests. */
export interface Redis {
  cmd<T = unknown>(command: Command): Promise<T>;
  /** Several commands in one round trip (not a transaction). */
  pipeline(commands: Command[]): Promise<unknown[]>;
}

/** Upstash Redis over its REST API with plain fetch (no client dependency). The token never appears in errors. */
export class UpstashRedis implements Redis {
  constructor(private readonly url: string, private readonly token: string, private readonly timeoutMs = 5000) {}

  async cmd<T>(command: Command): Promise<T> {
    const [r] = await this.post('', command);
    return r as T;
  }

  pipeline(commands: Command[]): Promise<unknown[]> {
    return this.post('/pipeline', commands);
  }

  private async post(path: string, body: unknown): Promise<unknown[]> {
    const res = await fetch(`${this.url.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | { result?: unknown; error?: string }[] | null;
    const replies = Array.isArray(json) ? json : [json];
    const failed = replies.find((r) => !r || r.error !== undefined);
    if (!res.ok || failed) throw new Error(`Redis request failed (HTTP ${res.status}${failed?.error ? `: ${failed.error.slice(0, 120)}` : ''})`);
    return replies.map((r) => r!.result);
  }
}

/**
 * In-process Redis for tests: the commands the access layer uses, with Upstash's reply shapes (HGETALL is a flat
 * array). Each command runs atomically; awaiting between commands lets concurrent callers interleave like real clients.
 */
export class MemoryRedis implements Redis {
  private readonly data = new Map<string, { value: string | Map<string, string> | Set<string>; expires: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async cmd<T>(command: Command): Promise<T> {
    await Promise.resolve();
    return this.run(command.map(String)) as T;
  }

  async pipeline(commands: Command[]): Promise<unknown[]> {
    await Promise.resolve();
    return commands.map((c) => this.run(c.map(String)));
  }

  private get(key: string) {
    const e = this.data.get(key);
    if (e && e.expires <= this.now()) this.data.delete(key);
    return this.data.get(key);
  }

  private hash(key: string): Map<string, string> {
    const e = this.get(key);
    if (e?.value instanceof Map) return e.value;
    const value = new Map<string, string>();
    this.data.set(key, { value, expires: Infinity });
    return value;
  }

  private run([name, key = '', ...args]: string[]): unknown {
    switch (name!.toUpperCase()) {
      case 'GET': {
        const v = this.get(key)?.value;
        return typeof v === 'string' ? v : null;
      }
      case 'SET': {
        if (args.includes('NX') && this.get(key)) return null;
        const ex = args.indexOf('EX');
        this.data.set(key, { value: args[0]!, expires: ex >= 0 ? this.now() + Number(args[ex + 1]) * 1000 : Infinity });
        return 'OK';
      }
      case 'DEL':
        return [key, ...args].filter((k) => this.data.delete(k)).length;
      case 'INCR': {
        const n = Number(this.get(key)?.value ?? 0) + 1;
        this.data.set(key, { value: String(n), expires: this.get(key)?.expires ?? Infinity });
        return n;
      }
      case 'EXPIRE': {
        const e = this.get(key);
        if (!e) return 0;
        e.expires = this.now() + Number(args[0]) * 1000;
        return 1;
      }
      case 'HGETALL': {
        const v = this.get(key)?.value;
        return v instanceof Map ? [...v].flat() : [];
      }
      case 'HSET': {
        const h = this.hash(key);
        for (let i = 0; i < args.length; i += 2) h.set(args[i]!, args[i + 1]!);
        return args.length / 2;
      }
      case 'HINCRBY': {
        const h = this.hash(key);
        const n = Number(h.get(args[0]!) ?? 0) + Number(args[1]);
        h.set(args[0]!, String(n));
        return n;
      }
      case 'SADD': {
        const e = this.get(key);
        const s = e?.value instanceof Set ? e.value : new Set<string>();
        this.data.set(key, { value: s, expires: Infinity });
        const before = s.size;
        args.forEach((a) => s.add(a));
        return s.size - before;
      }
      case 'SMEMBERS': {
        const v = this.get(key)?.value;
        return v instanceof Set ? [...v] : [];
      }
      default:
        throw new Error(`MemoryRedis: unsupported command ${name}`);
    }
  }
}
