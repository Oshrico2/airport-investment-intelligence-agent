import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule, configureApp } from './app.module';
import { readEnv } from './config/env';
import { DataService } from './data/data.service';

async function bootstrap(): Promise<void> {
  const env = readEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  configureApp(app);
  app.enableShutdownHooks();

  // Production: serve the built React app from the same origin (npm run build && npm start).
  const webDist = path.resolve(env.WEB_DIST ?? path.join(__dirname, '..', '..', 'web', 'dist'));
  if (existsSync(path.join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  await app.listen(env.PORT);
  app.get(DataService).maybeCheck(env.LIVE_CHECK === 'on'); // background freshness check, never blocks
  console.log(`API ready on http://localhost:${env.PORT}/api (AI providers: ${[env.ANTHROPIC_API_KEY && 'Claude', env.GEMINI_API_KEY && 'Gemini'].filter(Boolean).join(', ') || 'none, Demo only'})`);
}

void bootstrap();
