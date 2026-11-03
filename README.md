# Airport Investment Intelligence Agent

A chat workspace for airport investors. Ask in plain language; an AI agent (**Claude** or **Gemini**) picks the analysis, and **deterministic TypeScript tools** compute every figure from official **U.S. DOT / BTS** data. Answers show as tables and charts with sources and limitations, plus a short narrative that is checked against the tool results.

- Rank U.S. airports for investment, nationally or by region, with the reasons others are excluded.
- Profile or compare any airport, analyse long-haul share and delays, and assess capacity pressure.
- Follow-up questions keep context. Questions can be typed or dictated (English or Hebrew).

**Live demo:** https://airport-investment-agent-three.vercel.app (access code required, see below)
**Design document:** [docs/DESIGN.pdf](docs/DESIGN.pdf) (2 pages)

## Live demo

The hosted demo answers with Claude (`claude-haiku-5-5`) on the developer's paid API key, so it asks for a personal **access code**. Reviewers receive one privately; each code allows **20 questions**.

- A question counts once, when its answer completes. Follow-ups, refreshes and duplicate submissions do not use extra questions, and a question that fails or is stopped is not charged.
- When a code's questions are used up, the app says so and asks you to contact the developer for more.
- Running the project locally (below) needs **no code and has no limit**: it uses your own API key.

## Quick start (local)

Requires **Node.js 22** (22.12 or later) and npm. No database or Docker; the BTS data snapshot is committed, so the app runs offline.

```bash
nvm install                          # installs/uses Node 22 from .nvmrc
npm install
cp server/.env.example server/.env   # optional: add an API key (below)
npm run dev                          # UI http://localhost:5173, API :3000
```

Single-origin production build: `npm run build && npm start`, then open http://localhost:3000.

## API keys

Add one key to `server/.env`. Keys stay on the server. Pick the provider in the composer (**Claude · Gemini · Demo**).

| Mode | Setting | Notes |
|---|---|---|
| Claude | `ANTHROPIC_API_KEY` ([console.anthropic.com](https://console.anthropic.com/settings/keys)) | Paid API. Preselected when set |
| Gemini | `GEMINI_API_KEY` ([Google AI Studio](https://aistudio.google.com/apikey)) | Free tier with a low daily request limit |
| Demo | none | Runs the suggested questions with fixed tool plans and template text. No AI; free text is not interpreted |

Optional settings are listed in `server/.env.example`.

## Try it

The four assignment questions (also on the start screen):

1. Rank the New England airports and explain which ones are excluded.
2. What share of Anchorage's passenger flights are long-haul (3,000+ miles)?
3. Compare delays at LAX and SNA. Is either more congested?
4. Is there unmet demand for flights at SFO?

Follow-up after question 2: *"What about the previous year?"*

## How it works

```
Browser (React + Vite) ──► NestJS API ──► AI agent: chooses tools (≤3 rounds)
        ▲                                     │
        └── cards, then narrative (SSE) ◄── 9 deterministic tools over an in-memory BTS snapshot
```

- **The model never produces a number.** Cards render from tool results only, and every figure in the narrative must match a tool result; otherwise the UI shows a warning.
- **Score:** `0.60 × GrowthScore + 0.40 × LoadScore`, from passenger growth in 2025 vs 2024 and 2025 seat load factor. Eligible airports need ≥ 500,000 departing passengers in 2025 and complete 2024 and 2025 data. Missing months are never filled. Details: [docs/SCORING.md](docs/SCORING.md).
- **Data:** versioned snapshot in `data/snapshots/2026-11-03` (BTS T-100 and On-Time / Delay Causes); sources in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md). `npm run refresh` downloads and validates a new one.

## Production access codes

Production only (on Vercel, `VERCEL=1`); local development is never gated. Code in `server/src/access/`.

- Every API route except `health` and `access` needs a valid code. The browser holds only a signed `HttpOnly; Secure; SameSite=Strict` cookie, never the code.
- Codes, quotas and conversations live in Upstash Redis, shared by every serverless instance. Redis stores an HMAC of each code plus an encrypted copy, never the code in clear.
- One question runs at a time per code (an atomic lock), so parallel requests cannot overspend. Per question: at most 3 Claude requests, 4,096 output tokens each, 120,000 input tokens in total.
- The owner manages codes from their own machine with `npm run codes -- setup | list | show | issue | grant | revoke | rotate` (credentials from the macOS Keychain).

## Deploying to Vercel

`npm run deploy:preview` and `npm run deploy:production` build locally (`vercel build --standalone`), scan the build output for secrets (`scripts/deploy-guard.mjs`: env files, key-shaped strings and the actual local secret values), and upload only that output (`vercel deploy --prebuilt`). Production is deployed without its domain, verified with `scripts/verify-deployment.mjs`, then promoted with `vercel promote`. The Vercel project needs `ANTHROPIC_API_KEY` (production only), `ACCESS_CODE_SECRET`, `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

## Tests

```bash
npm run typecheck   # strict TypeScript, server + web
npm test            # Jest (server) + Vitest (web)
npm run e2e         # Playwright flows, accessibility, performance (Demo mode)
                    # first time: npm exec -w web -- playwright install chromium
```

No test calls an AI API; the agents are tested against scripted SDK clients.

## Limitations

- **Terminal expansion is ranked by demand pressure, not terminal capacity:** BTS publishes no terminal, gate or TSA capacity data.
- **Unmet demand at SFO cannot be quantified from BTS data,** which records only passengers who flew. The app shows proxies (traffic vs 2019 and 2024, peak load factors) and says so.
- Delay data covers domestic arrivals of U.S. reporting carriers. It is a punctuality measure, not a direct congestion measure.
- 2026 data is partial and compared only with the same months of 2025.
- Conversations are kept in memory locally (lost on restart) and in Redis for 24 hours on the live demo.
