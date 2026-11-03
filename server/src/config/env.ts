import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// server/.env is optional and gitignored; real environment variables win (Node's own loader, no dotenv dependency).
// Never on Vercel: production configuration comes only from the project's environment variables.
const envFile = path.resolve(__dirname, '..', '..', '.env');
if (!process.env.VERCEL && existsSync(envFile)) process.loadEnvFile(envFile);
const optional = z.string().trim().optional().transform((v) => (v ? v : undefined));

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  GEMINI_API_KEY: z.string().trim().optional().transform((v) => (v ? v : undefined)),
  // Primary 3.5 Flash-Lite (fast, verified live), fallback 3.8 Flash. 2.5 models are closed to new keys.
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().trim().default('gemini-3.8-flash').transform((v) => (v ? v : undefined)),
  // Free-tier limits verified in AI Studio, enforced locally per model (quotas are separate, never pooled).
  GEMINI_RPM: z.coerce.number().int().positive().default(10),
  GEMINI_RPD: z.coerce.number().int().positive().default(20),
  GEMINI_FALLBACK_RPM: z.coerce.number().int().positive().default(5),
  GEMINI_FALLBACK_RPD: z.coerce.number().int().positive().default(20),
  // Gemini 2.5 thinking budget in tokens (0 = off, lowest latency). Gemini 3 models use the level instead.
  GEMINI_THINKING_BUDGET: z.coerce.number().int().min(0).default(0),
  // First-reply windows. Measured 2026-11-03: a degraded but working Flash-Lite took ~19.5 s to its first chunk,
  // so the primary gets 25 s; the fallback (overloaded 3.8 Flash) gets 10 s so a dead fallback fails fast.
  GEMINI_FIRST_CHUNK_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  GEMINI_FALLBACK_FIRST_CHUNK_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  GEMINI_THINKING_LEVEL: z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']).default('LOW'),
  // Claude (paid API, billed to this key). Server-side only, like the Gemini key.
  ANTHROPIC_API_KEY: z.string().trim().optional().transform((v) => (v ? v : undefined)),
  // Haiku 5.5, the model verified live in the acceptance review; claude-haiku-4-5,
  // claude-sonnet-5 or claude-opus-5 are one setting away.
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  // SDK retries for 429/5xx/overloaded (with backoff). 0 = every request is a single attempt (budgeted live tests).
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  // Demo pacing in ms: labelled Demo steps and a streamed template instead of an instant answer. 0 = off.
  DEMO_PACE_MS: z.coerce.number().int().min(0).max(10000).default(1500),
  CHAT_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  LIVE_CHECK: z.enum(['on', 'off']).default('on'),
  WEB_DIST: z.string().optional(),
  // Production access codes and quotas (access/access.ts). Vercel sets VERCEL=1 and VERCEL_ENV; ACCESS_CONTROL=on
  // turns the same checks on elsewhere (tests). Locally nothing below is needed.
  VERCEL: optional,
  VERCEL_ENV: optional,
  ACCESS_CONTROL: z.enum(['on', 'off']).optional(),
  ACCESS_CODE_SECRET: z.string().trim().min(32, 'ACCESS_CODE_SECRET must be at least 32 characters').optional(),
  ACCESS_CONTACT: optional, // shown when a code is used up, e.g. an email address; omitted: "contact the developer"
  // Upstash Redis REST credentials: the Vercel Marketplace integration sets the KV_* names, a direct Upstash setup the others
  KV_REST_API_URL: optional,
  KV_REST_API_TOKEN: optional,
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
});
export type Env = z.infer<typeof Env>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}
