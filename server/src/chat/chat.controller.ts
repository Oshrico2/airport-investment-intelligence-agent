import { Body, Controller, Get, Inject, Logger, Post, Req, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import type { ChatEvent, ChatProvider, ProviderInfo } from '../../../shared/api';
import { exhaustedMessage, type AccessControl, type Reserve } from '../access/access';
import { ACCESS, apiError, type AccessRequest } from '../access/access.controller';
import { RateLimiter } from '../api/rate-limit';
import { readEnv } from '../config/env';
import { providerInfo } from './agent.factory';
import { CHAT_AGENTS, type ChatAgents } from './chat-agent';
import { SUGGESTIONS } from './suggestions';

const ChatBody = z.object({
  message: z.string().trim().min(1, 'message is empty').max(2000, 'message is longer than 2,000 characters'),
  sessionId: z.string().uuid().optional(),
  provider: z.enum(['claude', 'gemini', 'demo']).optional(), // omitted: the default provider (Claude when configured)
  questionId: z.string().uuid().optional(), // one per question asked, reused on resubmission: never charged twice (required in production)
});

const RENEW_MS = 15_000; // lock renewal while an answer streams (LOCK_SECONDS is 90)

/** Why a production question was not accepted: HTTP status, code and the message the UI shows. */
const REJECTED = {
  invalid: [401, 'access_required', 'An access code is required. Enter the code you received to use this demo.'],
  revoked: [403, 'access_revoked', 'This access code is no longer active. Please contact the developer for a new one.'],
  busy: [409, 'question_running', 'Another question with this access code is still being answered. Wait for it to finish, then ask again (after an interrupted answer, this can take up to a minute and a half).'],
  duplicate: [409, 'duplicate_question', 'This question was already answered.'],
} as const;

@Controller('chat')
export class ChatController {
  private readonly limiter = new RateLimiter(readEnv().CHAT_RATE_LIMIT_PER_MIN);
  private readonly contact = readEnv().ACCESS_CONTACT;
  private readonly logger = new Logger('Quota');

  constructor(@Inject(CHAT_AGENTS) private readonly agents: ChatAgents, @Inject(ACCESS) private readonly access: AccessControl | null) {}

  /** Which providers can answer, their models, and why the others cannot. Never exposes keys. */
  @Get('providers')
  providers(): { providers: ProviderInfo[]; default: ChatProvider } {
    return providerInfo(this.agents, !!this.access);
  }

  /** Suggested analyses for the first screen; Demo mode answers exactly these. */
  @Get('suggestions')
  suggestions(): { id: string; tile: string; capability: string; question: string }[] {
    return SUGGESTIONS.map(({ id, tile, capability, question }) => ({ id, tile, capability, question }));
  }

  /** One chat turn as Server-Sent Events. The stream always ends with `done` or `error`. */
  @Post()
  async chat(@Body() body: unknown, @Req() req: AccessRequest, @Res() res: Response): Promise<void> {
    const input = ChatBody.parse(body);
    const code = this.access ? req.access : undefined; // set by AccessGuard in production
    if (this.access && (!code || !input.questionId)) throw code ? apiError(400, 'access_required', 'questionId is required.') : apiError(401, 'access_required', REJECTED.invalid[2]);
    const info = providerInfo(this.agents, !!this.access);
    const provider = input.provider ?? info.default;
    const agent = this.agents.get(provider);
    if (!agent) {
      const p = info.providers.find((x) => x.id === provider);
      res.status(400).json({ error: `${p?.label ?? provider} is not configured on this server: ${p?.reason ?? 'no API key'}.` });
      return;
    }
    const wait = this.limiter.check(req.ip ?? 'unknown');
    if (wait) {
      res.status(429).setHeader('Retry-After', String(wait)).json({ error: `Too many questions; try again in ${wait} s (protects the AI quota).` });
      return;
    }
    // Production: charge this question (one running question per code, never past the limit, never twice per questionId).
    let quota: Extract<Reserve, { ok: true }> | undefined;
    if (code && input.questionId) {
      const r = await this.access!.reserve(code.id, input.questionId);
      if (!r.ok) {
        const [status, errorCode, error] = r.reason === 'exhausted' ? ([403, 'quota_exhausted', exhaustedMessage(code.limit, this.contact)] as const) : REJECTED[r.reason];
        res.status(status).json({ error, code: errorCode });
        return;
      }
      quota = r;
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const write = (event: ChatEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    // Production: `done` is held back until the question is charged, so the client never gets a complete answer that
    // was not counted; while the answer streams, the code's lock is renewed (a cancelled request stops renewing it).
    let done: ChatEvent | null = null;
    let renewed = Date.now();
    const emit = (event: ChatEvent) => {
      if (quota && Date.now() - renewed > RENEW_MS) {
        renewed = Date.now();
        void this.access!.touch(code!.id).catch(() => undefined);
      }
      if (quota && event.type === 'done') done = event;
      else write(event);
    };
    const sessionId = input.sessionId ?? randomUUID();
    emit({ type: 'session', sessionId, mode: agent.mode, provider, ...(quota ? { quota: { used: quota.used, limit: quota.limit } } : {}) });
    try {
      // Production histories are per code: another code cannot continue (or read) this conversation.
      await agent.run({ sessionId: code ? `${code.id}:${sessionId}` : sessionId, message: input.message }, emit, abort.signal);
    } catch (e) {
      emit({ type: 'error', message: e instanceof Error ? e.message : 'The agent failed.' });
    } finally {
      if (code && quota) await this.settle(code.id, code.label, input.questionId!, quota, done);
      if (done) write(done);
      res.end();
    }
  }

  /** Charges an answered question (then `done` is sent) or frees the code. Logs the label, never the code. */
  private async settle(id: string, label: string, questionId: string, quota: Extract<Reserve, { ok: true }>, done: ChatEvent | null): Promise<void> {
    try {
      if (done) {
        await this.access!.complete(id, questionId, quota.prepaid);
        this.logger.log(`${label}: question answered (${quota.used} of ${quota.limit} used)`);
      } else {
        await this.access!.release(id);
        this.logger.warn(`${label}: question not completed, not charged${quota.prepaid ? ' (charged when accepted: unfinished-question limit reached)' : ''}`);
      }
    } catch (e) {
      this.logger.error(`${label}: could not settle the question (${e instanceof Error ? e.message : 'unknown error'})`);
    }
  }
}
