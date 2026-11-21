import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { configureBigIntSerialization } from '../src/common/utils/bigint.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth Flow (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cashierToken: string;
  let refreshToken: string;
  let bekasiStoreId: string;

  beforeAll(async () => {
    configureBigIntSerialization();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);

    const bekasi = await prisma.store.findUnique({ where: { code: 'BKS' } });
    if (!bekasi) {
      throw new Error('Seed data missing for store BKS');
    }
    bekasiStoreId = bekasi.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/login - should authenticate Cashier and return tokens & stores', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'kasir1@toko.id',
        password: 'password123',
      })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Budi Kasir',
      role: 'CASHIER',
    });
    expect(Array.isArray(res.body.stores)).toBe(true);
    expect(res.body.stores[0].code).toBe('BKS');

    cashierToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /api/v1/auth/login - should reject invalid credentials with 401 standard error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'kasir1@toko.id',
        password: 'wrongpassword',
      })
      .expect(401);

    expect(res.body).toHaveProperty('statusCode', 401);
    expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
    expect(res.body).toHaveProperty('message', 'Invalid email or password');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('POST /api/v1/auth/refresh - should issue new tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken,
      })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('POST /api/v1/auth/verify-pin - should accept valid Manager PIN for store', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-pin')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        storeId: bekasiStoreId,
        pin: '123456',
      })
      .expect(200);

    expect(res.body).toEqual({
      authorized: true,
      managerId: expect.any(String),
      managerName: expect.stringMatching(/Manager|Owner/),
    });
  });

  it('POST /api/v1/auth/verify-pin - should reject incorrect PIN with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-pin')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        storeId: bekasiStoreId,
        pin: '999999',
      })
      .expect(401);

    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});
