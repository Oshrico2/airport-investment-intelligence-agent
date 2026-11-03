import { useCallback, useRef, useState } from 'react';
import type { ApiErrorCode, ChatEvent, ChatProvider, Timings, ToolResult } from '../../../shared/api';
import { ApiError, streamChat } from './api';

export type ToolOutput = ToolResult | { kind: 'error'; message: string };

export interface ToolRun {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  ms?: number;
  result?: ToolOutput;
}

export interface Step {
  key: string;
  label: string;
  state: 'active' | 'done';
  startedAt: number; // client ms since the question was sent
  ms?: number; // duration once done
}

export interface Turn {
  id: string;
  question: string;
  status: 'streaming' | 'done' | 'error' | 'stopped';
  mode: 'ai' | 'demo' | null;
  provider: ChatProvider | null; // requested when sent, confirmed by the server's session event
  steps: Step[];
  tools: ToolRun[];
  text: string;
  warnings: string[];
  error?: string;
  errorCode?: ApiErrorCode; // production access and quota failures (the UI re-checks the access code)
  timings?: Timings;
  clientMs?: number;
}

/** Applies one server event to a turn (pure, so it is unit-testable). `elapsed` is the client clock in ms. */
export function reduceTurn(turn: Turn, e: ChatEvent, elapsed: number): Turn {
  const closeActive = (steps: Step[]) => steps.map((s) => (s.state === 'active' ? { ...s, state: 'done' as const, ms: elapsed - s.startedAt } : s));
  switch (e.type) {
    case 'session':
      return { ...turn, mode: e.mode, provider: e.provider };
    case 'status':
      return { ...turn, steps: [...closeActive(turn.steps), { key: `${e.stage}-${turn.steps.length}`, label: e.label, state: 'active', startedAt: elapsed }] };
    case 'tool_call':
      return { ...turn, tools: [...turn.tools, { callId: e.callId, name: e.name, args: e.args }] };
    case 'tool_result':
      return { ...turn, tools: turn.tools.map((t) => (t.callId === e.callId ? { ...t, ms: e.ms, result: e.result } : t)) };
    case 'text_delta':
      return { ...turn, text: turn.text + e.text };
    case 'warning':
      return { ...turn, warnings: [...turn.warnings, e.message] };
    case 'error':
      return { ...turn, status: 'error', error: e.message, steps: closeActive(turn.steps) };
    case 'done':
      return { ...turn, status: turn.status === 'error' ? 'error' : 'done', timings: e.timings, steps: closeActive(turn.steps), clientMs: elapsed };
  }
}

export function useChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const sessionId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const busy = turns.at(-1)?.status === 'streaming';

  const update = (id: string, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  /** `provider` omitted: the server's default. One conversation stays with one provider (each keeps its own context). */
  const send = useCallback(async (question: string, provider?: ChatProvider) => {
    const q = question.trim();
    if (!q || abort.current) return;
    const id = crypto.randomUUID();
    const started = performance.now();
    setTurns((ts) => [...ts, { id, question: q, status: 'streaming', mode: null, provider: provider ?? null, steps: [{ key: 'send', label: 'Sending question', state: 'active', startedAt: 0 }], tools: [], text: '', warnings: [] }]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await streamChat(
        { message: q, questionId: id, ...(sessionId.current ? { sessionId: sessionId.current } : {}), ...(provider ? { provider } : {}) },
        (e) => {
          if (e.type === 'session') sessionId.current = e.sessionId;
          update(id, (t) => reduceTurn(t, e, performance.now() - started));
        },
        controller.signal,
      );
      update(id, (t) => (t.status === 'streaming' ? { ...t, status: 'done', clientMs: performance.now() - started } : t));
    } catch (err) {
      const stopped = controller.signal.aborted;
      const code = err instanceof ApiError ? err.code : undefined;
      update(id, (t) => ({ ...t, status: stopped ? 'stopped' : 'error', ...(stopped ? {} : { error: (err as Error).message }), ...(code ? { errorCode: code } : {}), steps: t.steps.map((s) => ({ ...s, state: 'done' as const })) }));
    } finally {
      abort.current = null;
    }
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => {
    abort.current?.abort();
    sessionId.current = undefined;
    setTurns([]);
  }, []);

  return { turns, busy, send, stop, reset };
}
