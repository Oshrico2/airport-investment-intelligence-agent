import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ChatProvider, ProviderInfo, ToolResult } from '../../../shared/api';
import type { AccessControl } from '../access/access';
import { readEnv, type Env } from '../config/env';
import type { ToolContext } from '../tools/registry';
import type { ChatAgents } from './chat-agent';
import { ClaudeAgent, type ClaudeLimits } from './claude-agent';
import { DemoAgent } from './demo-agent';
import { GeminiAgent } from './gemini-agent';
import { ModelBudget } from './model-budget';
import { systemInstruction } from './system-prompt';
import { claudeTools } from './tool-declarations';

/** Production cost ceilings per question: with MAX_ROUNDS = 3, at most 3 requests of ≤ 4,096 tokens. */
const PRODUCTION_LIMITS: ClaudeLimits = { maxTokens: 4096, maxInputTokens: 120_000 };

/**
 * Provider order is also the default preference: Claude first, then Gemini, then Demo. The first
 * configured one is preselected; choosing a default never calls a model.
 */
const PROVIDERS: { id: ChatProvider; label: string; missing: string }[] = [
  { id: 'claude', label: 'Claude', missing: 'Set ANTHROPIC_API_KEY in server/.env' },
  { id: 'gemini', label: 'Gemini', missing: 'Set GEMINI_API_KEY in server/.env' },
  { id: 'demo', label: 'Demo', missing: '' },
];

/** Every provider whose key is configured, plus the always-available Demo. Keys stay in server memory. */
export function createChatAgents(ctx: ToolContext, env = readEnv(), access: AccessControl | null = null): ChatAgents {
  if (access) return productionAgents(ctx, env, access);
  const logger = new Logger('Agent');
  const agents: ChatAgents = new Map();
  if (env.GEMINI_API_KEY) {
    const budgets = [new ModelBudget(env.GEMINI_MODEL, env.GEMINI_RPM, env.GEMINI_RPD)];
    if (env.GEMINI_FALLBACK_MODEL && env.GEMINI_FALLBACK_MODEL !== env.GEMINI_MODEL) budgets.push(new ModelBudget(env.GEMINI_FALLBACK_MODEL, env.GEMINI_FALLBACK_RPM, env.GEMINI_FALLBACK_RPD));
    logger.log(`Gemini agent enabled: ${budgets.map((b) => `${b.model} (${b.rpm}/min, ${b.rpd}/day)`).join(' → fallback ')}`);
    agents.set(
      'gemini',
      new GeminiAgent(new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }).models, ctx, {
        budgets,
        thinkingLevel: ThinkingLevel[env.GEMINI_THINKING_LEVEL],
        thinkingBudget: env.GEMINI_THINKING_BUDGET,
        firstChunkTimeoutMs: env.GEMINI_FIRST_CHUNK_TIMEOUT_MS,
        fallbackFirstChunkTimeoutMs: env.GEMINI_FALLBACK_FIRST_CHUNK_TIMEOUT_MS,
      }),
    );
  }
  if (env.ANTHROPIC_API_KEY) {
    logger.log(`Claude agent enabled: ${env.ANTHROPIC_MODEL}`);
    // An explicit apiKey stops the SDK from picking up other credentials (auth tokens, CLI profiles) on its own.
    agents.set('claude', new ClaudeAgent(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: env.ANTHROPIC_TIMEOUT_MS, maxRetries: env.ANTHROPIC_MAX_RETRIES }).messages, ctx, env.ANTHROPIC_MODEL));
  }
  if (!agents.size) logger.warn('No AI key set: only the limited Demo mode is available. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to server/.env.');
  agents.set('demo', new DemoAgent(ctx, env.DEMO_PACE_MS));
  return agents;
}

/**
 * Production: Claude only, with the history in Redis so follow-ups work on any instance, and the
 * production cost ceilings. A Vercel preview without the Claude key runs Demo instead (free, used to test the quota
 * flow); production without the key runs nothing.
 */
function productionAgents(ctx: ToolContext, env: Env, access: AccessControl): ChatAgents {
  const agents: ChatAgents = new Map();
  if (env.ANTHROPIC_API_KEY) {
    // Claude rejects a conversation whose system prompt, tools or model changed (preserved thinking), so a deployment
    // that changes any of them starts conversations afresh instead of failing the next follow-up with HTTP 400.
    const fingerprint = createHash('sha256').update(JSON.stringify([env.ANTHROPIC_MODEL, systemInstruction(ctx.index), claudeTools()])).digest('hex').slice(0, 12);
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: Math.min(env.ANTHROPIC_TIMEOUT_MS, 30_000), maxRetries: Math.min(env.ANTHROPIC_MAX_RETRIES, 1) });
    agents.set('claude', new ClaudeAgent(client.messages, ctx, env.ANTHROPIC_MODEL, {
      sessions: access.sessions<Anthropic.MessageParam>(`claude:${fingerprint}:m`),
      evidence: access.sessions<ToolResult>(`claude:${fingerprint}:e`),
      limits: PRODUCTION_LIMITS,
    }));
    new Logger('Agent').log(`Claude agent enabled (production limits): ${env.ANTHROPIC_MODEL}`);
  } else if (env.VERCEL_ENV !== 'production') {
    agents.set('demo', new DemoAgent(ctx, env.DEMO_PACE_MS));
  } else {
    new Logger('Agent').error('ANTHROPIC_API_KEY is not set in production: the chat is unavailable.');
  }
  return agents;
}

/** With `onlyAvailable` (production) unconfigured providers are left out instead of listed with a setup hint. */
export function providerInfo(agents: ChatAgents, onlyAvailable = false): { providers: ProviderInfo[]; default: ChatProvider } {
  const providers = PROVIDERS.map(({ id, label, missing }) => {
    const agent = agents.get(id);
    return agent ? { id, label, available: true, ...(agent.model ? { model: agent.model } : {}) } : { id, label, available: false, reason: missing };
  }).filter((p) => p.available || !onlyAvailable);
  return { providers, default: providers.find((p) => p.available)?.id ?? 'demo' };
}
