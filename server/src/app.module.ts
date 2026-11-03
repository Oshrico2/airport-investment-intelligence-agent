import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createAccess, type AccessControl } from './access/access';
import { ACCESS, AccessController, AccessGuard } from './access/access.controller';
import { DataController } from './api/data.controller';
import { ErrorsFilter } from './api/errors.filter';
import { createChatAgents } from './chat/agent.factory';
import { CHAT_AGENTS } from './chat/chat-agent';
import { ChatController } from './chat/chat.controller';
import { readEnv } from './config/env';
import { DataService } from './data/data.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, AccessController, DataController, ChatController],
  providers: [
    DataService,
    { provide: APP_FILTER, useClass: ErrorsFilter },
    // Production only (VERCEL=1): access codes and question quotas; null locally, where nothing is gated
    { provide: ACCESS, useFactory: () => createAccess(readEnv()) },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: CHAT_AGENTS, useFactory: (data: DataService, access: AccessControl | null) => createChatAgents(data, readEnv(), access), inject: [DataService, ACCESS] },
  ],
})
export class AppModule {}

/** Settings shared by `npm start` (main.ts) and the Vercel function (serverless.ts). */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
}
