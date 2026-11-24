import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { applyGlobalPrefix } from '../src/common/config/http.config';
import { configureBigIntSerialization } from '../src/common/utils/bigint.util';

describe('Observability (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    configureBigIntSerialization();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics - serves the Prometheus scrape outside the /api/v1 prefix', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# HELP pos_http_requests_total');
    expect(res.text).toContain('pos_http_requests_total');
  });

  it('GET /api/v1/metrics - is not exposed under the prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);
  });

  it('returns a correlation id and a trace context on every response', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['traceparent']).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
  });

  it('echoes a valid inbound request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'req-123.abc')
      .expect(200);

    expect(res.headers['x-request-id']).toBe('req-123.abc');
  });

  it('replaces an unsafe inbound request id instead of echoing it', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'not a safe value')
      .expect(200);

    expect(res.headers['x-request-id']).not.toBe('not a safe value');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('continues an inbound W3C trace and mints a new span id', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('traceparent', `00-${traceId}-00f067aa0ba902b7-01`)
      .expect(200);

    expect(res.headers['traceparent']).toMatch(
      new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`),
    );
    expect(res.headers['traceparent']).not.toContain('00f067aa0ba902b7');
  });

  it('counts the request in the HTTP metrics with the route template', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).toMatch(/pos_http_requests_total\{method="GET",route="\/api\/v1\/health"/);
  });

  it('includes the correlation id in an error response body', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'err-req-1')
      .expect(404);

    expect(res.body.correlationId).toBe('err-req-1');
    expect(res.headers['x-request-id']).toBe('err-req-1');
    expect(res.body.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('reports readiness through the metrics gauge', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).toContain('pos_readiness_up 1');
  });
});
