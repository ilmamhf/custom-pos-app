import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { configureBigIntSerialization } from './common/utils/bigint.util';
import { Request, Response } from 'express';

async function bootstrap() {
  // Ensure BigInt values cleanly serialize to JSON numbers without throwing TypeError
  configureBigIntSerialization();

  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  // Honour X-Forwarded-* only when the deployment says it sits behind a proxy.
  // Trusting it unconditionally lets any client spoof the rate-limit key.
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // CORS: an explicit allowlist in production; the permissive default is
  // development-only so a deployed API is not open to every origin.
  const corsOrigin = process.env.CORS_ORIGIN;
  if (isProduction && (!corsOrigin || corsOrigin.trim() === '*')) {
    throw new Error('CORS_ORIGIN must list explicit origins (comma-separated) in production');
  }

  // An array is an exact-match allowlist in the `cors` package, so a literal
  // "*" must stay a string to act as the wildcard. Splitting it into ['*']
  // silently blocks every browser origin.
  const allowedOrigins = corsOrigin
    ? corsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ['*'];
  const corsOriginOption =
    allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? '*' : allowedOrigins;

  app.enableCors({
    origin: corsOriginOption,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Global Filters & Pipes
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // OpenAPI / Swagger documentation. Disabled by default in production unless
  // explicitly enabled (e.g. SWAGGER_ENABLED=true for an internal deployment).
  const swaggerEnabled = !isProduction || process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Retail POS & Offline Sync API')
      .setDescription('NestJS REST API and Offline Sync Engine for 1–3 retail store POS system')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Store-Id', in: 'header' }, 'X-Store-Id')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    // Expose raw OpenAPI JSON at /api/docs-json for React Admin client code-gen
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get('/api/docs-json', (req: Request, res: Response) => {
      res.json(document);
    });
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  logger.log(`POS API is running on http://localhost:${port}/api/v1`);
  if (swaggerEnabled) {
    logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);
    logger.log(`OpenAPI JSON spec: http://localhost:${port}/api/docs-json`);
  }
}

bootstrap();
