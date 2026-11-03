import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ToolError } from '../tools/tool-error';

/** One error shape for the API: { error: string }. Unexpected errors are logged and never leak internals. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    if (err instanceof ToolError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') });
    } else if (err instanceof HttpException) {
      const body = err.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        res.status(err.getStatus()).json(body); // apiError: { error, code }
        return;
      }
      res.status(err.getStatus()).json({ error: typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? err.message).toString() });
    } else {
      this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      res.status(500).json({ error: 'Internal error' });
    }
  }
}
