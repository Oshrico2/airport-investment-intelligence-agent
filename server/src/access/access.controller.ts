import { Body, Controller, Delete, Get, HttpException, Inject, Injectable, Post, Req, Res, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AccessStatus, ApiErrorCode } from '../../../shared/api';
import { readEnv } from '../config/env';
import { HealthController } from '../health.controller';
import { COOKIE, statusOf, type AccessControl, type CodeRecord } from './access';

/** AccessControl in production, null locally (nothing is gated). */
export const ACCESS = Symbol('ACCESS');

export type AccessRequest = Request & { access?: CodeRecord };

/** An API error the UI can act on: `{ error, code }` (ErrorsFilter keeps the code). */
export const apiError = (status: number, code: ApiErrorCode, error: string) => new HttpException({ error, code }, status);

const NO_ACCESS = 'An access code is required. Enter the code you received to use this demo.';
const REVOKED = 'This access code is no longer active. Please contact the developer for a new one.';

export function readCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/** On Vercel the platform sets x-forwarded-for to the client address (overwriting any client value). */
export const clientIp = (req: Request) => (process.env.VERCEL ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : req.ip) || 'unknown';

const cookie = (token: string, maxAge: number) => `${COOKIE}=${encodeURIComponent(token)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/**
 * Production: every API route except health and access needs a valid, unrevoked code cookie. Checked against Redis on
 * every request, so revoking a code takes effect immediately.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(ACCESS) private readonly access: AccessControl | null) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.access || ctx.getClass() === HealthController || ctx.getClass() === AccessController) return true;
    const req = ctx.switchToHttp().getRequest<AccessRequest>();
    const record = await this.access.fromToken(readCookie(req));
    if (!record) throw apiError(401, 'access_required', NO_ACCESS);
    if (record.revoked) throw apiError(403, 'access_revoked', REVOKED);
    req.access = record;
    return true;
  }
}

const LoginBody = z.object({ code: z.string().trim().min(1, 'Enter your access code').max(64) });

@Controller('access')
export class AccessController {
  private readonly contact = readEnv().ACCESS_CONTACT;
  constructor(@Inject(ACCESS) private readonly access: AccessControl | null) {}

  /** Whether this server needs a code and, with a valid cookie, the code's remaining questions. Never reveals the code. */
  @Get()
  async status(@Req() req: Request): Promise<AccessStatus> {
    if (!this.access) return { required: false };
    const record = await this.access.fromToken(readCookie(req));
    return record && !record.revoked ? statusOf(record, this.contact) : { required: true, granted: false };
  }

  @Post()
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AccessStatus> {
    if (!this.access) return { required: false };
    const { code } = LoginBody.parse(body);
    const r = await this.access.login(code, clientIp(req));
    if (!r.ok) {
      if (r.reason === 'throttled') throw apiError(429, 'access_throttled', 'Too many incorrect codes. Try again in 15 minutes.');
      if (r.reason === 'revoked') throw apiError(403, 'access_revoked', REVOKED);
      throw apiError(401, 'access_required', 'That access code is not valid. Check it and try again.');
    }
    res.setHeader('Set-Cookie', cookie(r.token, 30 * 86_400));
    return statusOf(r.record, this.contact);
  }

  @Delete()
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  }
}
