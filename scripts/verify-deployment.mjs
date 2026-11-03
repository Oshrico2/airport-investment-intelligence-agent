#!/usr/bin/env node
/**
 * Verifies a deployment's access codes, quotas and security over HTTP.
 *
 *   VERIFY_CODE=<code> node scripts/verify-deployment.mjs <base-url> full    the whole quota flow: asks 20 questions.
 *                                                                          Run it ONLY where Demo answers (a preview
 *                                                                          without the Claude key): it costs nothing.
 *   VERIFY_CODE=<code> node scripts/verify-deployment.mjs <base-url> smoke   headers, gating and login; asks nothing
 *   node scripts/verify-deployment.mjs <base-url> revoked                    the code was revoked: every route says so
 *
 * The code comes from the environment (never argv, never printed). Protected previews: run it through
 * `vercel env run -- …`, which provides VERCEL_OIDC_TOKEN; it is sent as x-vercel-trusted-oidc-idp-token and never
 * printed. `full` expects a fresh code (0 used) and refuses to run against a deployment that answers with Claude.
 */
import { randomUUID } from 'node:crypto';

const [base, mode = 'smoke'] = process.argv.slice(2);
if (!base || !['full', 'smoke', 'revoked'].includes(mode)) {
  console.error('usage: VERIFY_CODE=<code> node scripts/verify-deployment.mjs <base-url> full|smoke|revoked');
  process.exit(2);
}
const url = base.replace(/\/$/, '');
const code = process.env.VERIFY_CODE?.trim();
const oidc = process.env.VERCEL_OIDC_TOKEN;
let cookie = '';
let failures = 0;

const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
  return ok;
};

function request(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}), ...(auth && cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  return fetch(`${url}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
}
const json = async (res) => res.json().catch(() => ({}));

/** One question: HTTP status, SSE events, and when the first event, the session event and `done` arrived. */
async function ask(message, questionId = randomUUID(), abortAfterSession = false) {
  const t0 = performance.now();
  const abort = new AbortController();
  const res = await request('/api/chat', { method: 'POST', body: { message, questionId }, signal: abort.signal });
  if (!res.ok) return { status: res.status, body: await json(res), events: [] };
  const events = [];
  let first = null;
  let sessionAt = null;
  let doneAt = null;
  let buffer = '';
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      first ??= performance.now() - t0;
      buffer += decoder.decode(chunk, { stream: true });
      for (let i = buffer.indexOf('\n\n'); i >= 0; i = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (!block.startsWith('data: ')) continue;
        const e = JSON.parse(block.slice(6));
        events.push(e);
        if (e.type === 'session') sessionAt = performance.now();
        if (e.type === 'done') doneAt = performance.now();
      }
      if (abortAfterSession && events.some((e) => e.type === 'session')) {
        abort.abort();
        break;
      }
    }
  } catch (e) {
    if (!abort.signal.aborted) throw e;
  }
  return { status: res.status, events, firstMs: first, totalMs: performance.now() - t0, sessionAt, doneAt };
}

const status = async () => json(await request('/api/access'));

async function login() {
  const res = await request('/api/access', { method: 'POST', body: { code }, auth: false });
  const set = res.headers.get('set-cookie') ?? '';
  cookie = set.split(';')[0];
  return { res, set, body: await json(res) };
}

async function headersAndGating() {
  const home = await request('/', { auth: false });
  if (!check(home.status === 200, 'the app loads (no Vercel login page: the protection bypass works)', `HTTP ${home.status}`)) process.exit(1);
  const h = (n) => home.headers.get(n) ?? '';
  check(/default-src 'self'/.test(h('content-security-policy')) && /frame-ancestors 'none'/.test(h('content-security-policy')), 'Content-Security-Policy');
  check(h('x-frame-options') === 'DENY' && h('x-content-type-options') === 'nosniff' && h('referrer-policy') === 'no-referrer', 'X-Frame-Options, X-Content-Type-Options, Referrer-Policy');
  check(/microphone=\(self\)/.test(h('permissions-policy')) && /max-age=/.test(h('strict-transport-security')), 'Permissions-Policy, Strict-Transport-Security');

  check((await request('/api/health', { auth: false })).status === 200, '/api/health is public');
  check(JSON.stringify(await json(await request('/api/access', { auth: false }))) === '{"required":true,"granted":false}', 'access is required');
  for (const path of ['/api/rankings', '/api/chat/providers', '/api/sources']) {
    const res = await request(path, { auth: false });
    check(res.status === 401 && (await json(res)).code === 'access_required', `${path} needs a code`, `HTTP ${res.status}`);
  }
  const forged = await fetch(`${url}/api/rankings`, { headers: { ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}), cookie: 'aia_access=00000000000000000000000000000000.forged' } });
  check(forged.status === 401, 'a forged cookie is rejected');
  const wrong = await request('/api/access', { method: 'POST', body: { code: 'AIA-0000-0000-0000-0000' }, auth: false });
  check(wrong.status === 401 && !(wrong.headers.get('set-cookie') ?? ''), 'a wrong code is rejected without a cookie');
}

if (mode === 'revoked') {
  if (!code) throw new Error('VERIFY_CODE is required');
  const r = await login();
  check(r.res.status === 403 && r.body.code === 'access_revoked', 'a revoked code cannot sign in', `HTTP ${r.res.status}`);
  process.exit(failures ? 1 : 0);
}

if (!code) throw new Error('VERIFY_CODE is required (the code is read from the environment, never from arguments)');
await headersAndGating();
const { res, set, body } = await login();
check(res.status === 201 || res.status === 200, 'the code signs in', `HTTP ${res.status}`);
check(/HttpOnly/.test(set) && /Secure/.test(set) && /SameSite=Strict/.test(set) && /Path=\/api/.test(set), 'the cookie is HttpOnly, Secure, SameSite=Strict, Path=/api');
check(!set.includes(code.replace(/-/g, '').slice(3)), 'the cookie does not carry the code');
check((await request('/api/rankings?limit=1')).status === 200, 'the API opens with the cookie');
const providers = await json(await request('/api/chat/providers'));
console.log(`      providers: ${providers.providers?.map((p) => p.id).join(', ')} (used ${body.used} of ${body.limit})`);

if (mode === 'smoke') process.exit(failures ? 1 : 0);

// ── full: the whole quota flow (Demo only) ──
if (providers.providers?.some((p) => p.id === 'claude')) {
  console.error('Refusing: this deployment answers with Claude (paid). The full run is for a preview where Demo answers.');
  process.exit(1);
}
if (!check(body.used === 0 && body.limit === 20, 'the code is fresh (0 of 20 used)', `used ${body.used} of ${body.limit}`)) process.exit(1);
const suggestions = await json(await request('/api/chat/suggestions'));
const question = (i) => suggestions[i % suggestions.length]?.question ?? 'Rank the New England airports';

const first = await ask(question(0));
const done = (r) => r.events.at(-1)?.type === 'done';
check(first.status === 200 && done(first) && first.events[0]?.quota?.used === 1, 'question 1 is answered and counted (1 of 20)');
check(first.firstMs !== null && first.totalMs - first.firstMs > 300, `events stream as they happen (first after ${Math.round(first.firstMs)} ms, done after ${Math.round(first.totalMs)} ms)`);

const qid = randomUUID();
const once = await ask(question(1), qid);
const again = await ask(question(1), qid);
check(done(once) && again.status === 409 && again.body.code === 'duplicate_question', 'a duplicate submission is refused and not charged');
check((await status()).used === 2, '2 of 20 used after the duplicate');

const aborted = await ask(question(2), randomUUID(), true);
await new Promise((r) => setTimeout(r, 3000));
check(aborted.status === 200 && (await status()).used === 2, 'an interrupted question (Stop, refresh) is not charged', `used ${(await status()).used}`);
// The interrupted question's lock lapses within 90 s when the platform cancelled it (no clean-up runs after a
// disconnect); the next question is accepted then, and counted.
const waitStart = performance.now();
let next = await ask(question(3));
while (next.status === 409 && performance.now() - waitStart < 120_000) {
  await new Promise((r) => setTimeout(r, 10_000));
  next = await ask(question(3));
}
check(next.status === 200 && done(next) && next.events[0]?.quota?.used === 3, `the code is free again ${Math.round((performance.now() - waitStart) / 1000)} s after the interruption, and the next question counts (3 of 20)`, `HTTP ${next.status}`);

// A burst of 5: one question runs at a time per code. A request that reaches a cold instance after the first question
// finished is accepted legitimately, so the check is that accepted questions never overlap and each is charged once.
const before = (await status()).used;
const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => ask(question(3 + i))));
const accepted = burst.filter((r) => r.status === 200).sort((a, b) => a.sessionAt - b.sessionAt);
const overlap = accepted.some((r, i) => i > 0 && r.sessionAt < accepted[i - 1].doneAt - 250);
check(accepted.length >= 1 && accepted.every(done) && !overlap && burst.every((r) => r.status === 200 || (r.status === 409 && r.body.code === 'question_running')), `a parallel burst of 5 never runs two questions at once (${accepted.length} accepted one after another, ${5 - accepted.length} refused)`, burst.map((r) => r.status).join(','));
check((await status()).used === before + accepted.length, `the burst charged exactly the ${accepted.length} answered question(s)`);

for (let n = (await status()).used + 1; n <= 20; n++) {
  const r = await ask(question(n));
  if (!check(r.status === 200 && done(r) && r.events[0]?.quota?.used === n, `question ${n} is answered and counted (${n} of 20)`, `HTTP ${r.status} ${JSON.stringify(r.body ?? r.events.at(-1))}`)) break;
}
const over = await ask(question(21));
check(over.status === 403 && over.body?.code === 'quota_exhausted' && /contact the developer/.test(over.body?.error ?? ''), 'question 21 gets the friendly message', `HTTP ${over.status}`);
if (over.body?.error) console.log(`      message: ${over.body.error}`);
const final = await status();
check(final.remaining === 0 && final.used === 20 && /contact the developer/.test(final.message ?? ''), 'the access status shows 0 left with the message');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
