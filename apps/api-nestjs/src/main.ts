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

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
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

  // OpenAPI / Swagger Documentation
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

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  logger.log(`POS API is running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`OpenAPI JSON spec: http://localhost:${port}/api/docs-json`);
}

bootstrap();
