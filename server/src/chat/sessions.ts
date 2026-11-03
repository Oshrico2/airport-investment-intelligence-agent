export const MAX_TURNS = 8; // most recent turns kept per session (a turn = user message + model/tool exchange)
const MAX_SESSIONS = 500;
const TTL_MS = 60 * 60_000;

/**
 * Conversation history per session, one store per provider. Each provider's own message objects are
 * stored unchanged (Gemini Content with thought signatures, Claude MessageParam with tool_use blocks). Async so that
 * production can keep it in Redis (RedisSessionStore), shared by every serverless instance.
 */
export interface SessionStore<M> {
  /** The window's messages; `trimmed` once the oldest turns were dropped (history no longer starts at message 1). */
  load(id: string): Promise<{ items: M[]; trimmed: boolean }>;
  append(id: string, turn: M[]): Promise<void>;
}

/** Local development: in memory, lost on restart by design. */
export class MemorySessionStore<M> implements SessionStore<M> {
  private readonly sessions = new Map<string, { turns: M[][]; touched: number; trimmed: boolean }>();
  constructor(private readonly now: () => number = Date.now) {}

  async load(id: string): Promise<{ items: M[]; trimmed: boolean }> {
    const s = this.sessions.get(id);
    if (!s || this.now() - s.touched > TTL_MS) return { items: [], trimmed: false };
    return { items: s.turns.flat(), trimmed: s.trimmed };
  }

  async append(id: string, turn: M[]): Promise<void> {
    const s = this.sessions.get(id) ?? { turns: [], touched: 0, trimmed: false };
    s.trimmed ||= s.turns.length >= MAX_TURNS;
    s.turns = [...s.turns, turn].slice(-MAX_TURNS);
    s.touched = this.now();
    this.sessions.delete(id);
    this.sessions.set(id, s);
    while (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value as string);
  }
}
