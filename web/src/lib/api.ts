import type { AccessStatus, AirportProfileResult, ApiErrorCode, ChatEvent, ChatProvider, MethodologyResult, ProviderInfo, RankingResult, SourcesResult } from '../../../shared/api';

export interface Suggestion {
  id: string;
  tile: string;
  capability: string;
  question: string;
}
export interface RegionOption {
  id: string;
  label: string;
  states: string[];
}

/** An API error with the server's message and, for access and quota failures, its machine-readable code. */
export class ApiError extends Error {
  constructor(message: string, readonly code?: ApiErrorCode) {
    super(message);
  }
}

async function failure(res: Response, fallback: string): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: ApiErrorCode };
  return new ApiError(body.error ?? `${fallback} (${res.status})`, body.code);
}

async function getJson<T>(url: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, ...(signal ? { signal } : {}) });
  if (!res.ok) throw await failure(res, 'Request failed');
  return (await res.json()) as T;
}

export const api = {
  rankings: (region?: string, limit = 25, signal?: AbortSignal) =>
    getJson<RankingResult>(`/api/rankings?${new URLSearchParams({ limit: String(limit), ...(region ? { region } : {}) })}`, signal),
  airport: (code: string, signal?: AbortSignal) => getJson<AirportProfileResult>(`/api/airports/${encodeURIComponent(code)}`, signal),
  sources: () => getJson<SourcesResult>('/api/sources'),
  regions: () => getJson<RegionOption[]>('/api/regions'),
  methodology: (topic: string) => getJson<MethodologyResult>(`/api/methodology/${topic}`),
  suggestions: () => getJson<Suggestion[]>('/api/chat/suggestions'),
  providers: () => getJson<{ providers: ProviderInfo[]; default: ChatProvider }>('/api/chat/providers'),
  /** Production access codes (the server sets an HttpOnly cookie; the code is never stored in the browser). */
  access: () => getJson<AccessStatus>('/api/access'),
  enterCode: (code: string) => getJson<AccessStatus>('/api/access', undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }),
};

/** Splits a Server-Sent Events buffer into complete events; returns the unconsumed remainder. */
export function parseSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  let rest = buffer;
  for (let i = rest.indexOf('\n\n'); i >= 0; i = rest.indexOf('\n\n')) {
    const block = rest.slice(0, i);
    rest = rest.slice(i + 2);
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => l.slice(6))
      .join('\n');
    if (data) events.push(JSON.parse(data) as ChatEvent);
  }
  return { events, rest };
}

/**
 * POST /api/chat and deliver each streamed event as it arrives. `questionId` identifies the question: in production a
 * resubmission with the same id is never charged twice.
 */
export async function streamChat(body: { message: string; questionId: string; sessionId?: string; provider?: ChatProvider }, onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw await failure(res, 'Chat request failed');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseSse(buffer + value);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
}
