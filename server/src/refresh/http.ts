/** fetch with a hard timeout and a readable error; refresh runs are manual, so no retry loops. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 120_000): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url.slice(0, 160)}`);
  return res;
}

export async function fetchBuffer(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<Buffer> {
  return Buffer.from(await (await fetchWithTimeout(url, init, timeoutMs)).arrayBuffer());
}
