import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';

describe('GET /api/health', () => {
  it('responds ok', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    await app.close();
  });
});
