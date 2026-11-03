import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule, configureApp } from './app.module';

type Handler = (req: Request, res: Response) => void;
let server: Promise<Handler> | undefined;

async function create(): Promise<Handler> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'], abortOnError: false });
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

/**
 * Vercel Function entry (api/index.js): the NestJS app is created once per instance and reused across requests. The
 * React app is served by Vercel's CDN, not by Nest. If startup fails (e.g. production without its access-code storage)
 * every request fails: closed, never open.
 */
export default async function handler(req: Request, res: Response): Promise<void> {
  (await (server ??= create()))(req, res);
}
