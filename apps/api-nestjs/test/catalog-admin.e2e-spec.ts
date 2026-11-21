import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { configureBigIntSerialization } from '../src/common/utils/bigint.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Catalog, Stores & Users (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let bekasiStoreId: string;
  let kemangStoreId: string;
  let createdProductId: string;

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

    const [bekasi, kemang] = await Promise.all([
      prisma.store.findUnique({ where: { code: 'BKS' } }),
      prisma.store.findUnique({ where: { code: 'KMG' } }),
    ]);

    bekasiStoreId = bekasi!.id;
    kemangStoreId = kemang!.id;

    // Login Owner
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@toko.id', password: 'password123' });
    ownerToken = ownerRes.body.accessToken;

    // Login Manager (assigned to Bekasi only)
    const managerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'manager.bks@toko.id', password: 'password123' });
    managerToken = managerRes.body.accessToken;

    // Login Cashier (assigned to Bekasi only)
    const cashierRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'kasir1@toko.id', password: 'password123' });
    cashierToken = cashierRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const testSku = `CROISSANT-${Date.now()}`;
  const testEmail = `andi.${Date.now()}@toko.id`;

  it('GET /api/v1/stores - should list all stores', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/v1/products - Owner creates master product and auto-initializes store inventory', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sku: testSku,
        barcode: `899${Date.now()}`.slice(0, 13),
        name: 'Croissant Butter Spec',
        basePrice: 22000,
        costPrice: 11000,
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.sku).toBe(testSku);
    expect(res.body.basePrice).toBe(22000);
    createdProductId = res.body.id;

    // Verify inventory initialized for both stores with 0 stock
    const inventories = await prisma.storeInventory.findMany({
      where: { productId: createdProductId },
    });
    expect(inventories.length).toBeGreaterThanOrEqual(2);
    expect(inventories.every((i) => i.stockOnHand === 0)).toBe(true);
  });

  it('PUT /api/v1/stores/:storeId/products/:productId/price - Manager sets price override on assigned store', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/stores/${bekasiStoreId}/products/${createdProductId}/price`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        priceOverride: 25000,
      })
      .expect(200);

    expect(res.body).toEqual({
      storeId: bekasiStoreId,
      productId: createdProductId,
      priceOverride: 25000,
    });
  });

  it('StoreAccessGuard enforcement: Manager rejected when overriding price on unassigned store (403)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/stores/${kemangStoreId}/products/${createdProductId}/price`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        priceOverride: 30000,
      })
      .expect(403);

    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('GET /api/v1/products?storeId=... - should return store-specific effectivePrice and stockOnHand', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products?storeId=${bekasiStoreId}&search=${testSku}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item.sku).toBe(testSku);
    expect(item.basePrice).toBe(22000);
    expect(item.priceOverride).toBe(25000);
    expect(item.effectivePrice).toBe(25000);
    expect(item.stockOnHand).toBe(0);
  });

  it('POST /api/v1/users - Owner creates a new Cashier with store assignment', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Andi Kasir Baru',
        email: testEmail,
        password: 'password123',
        role: 'CASHIER',
        storeIds: [bekasiStoreId],
      })
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Andi Kasir Baru',
      email: testEmail,
      role: 'CASHIER',
      isActive: true,
    });
  });
});
