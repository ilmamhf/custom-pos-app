import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { configureBigIntSerialization } from '../src/common/utils/bigint.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Inventory & Atomic Transfers (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let managerToken: string;
  let bekasiStoreId: string;
  let kemangStoreId: string;
  let productId: string;

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

    const [bekasi, kemang, product] = await Promise.all([
      prisma.store.findUnique({ where: { code: 'BKS' } }),
      prisma.store.findUnique({ where: { code: 'KMG' } }),
      prisma.product.findUnique({ where: { sku: 'KOPI-001' } }),
    ]);

    bekasiStoreId = bekasi!.id;
    kemangStoreId = kemang!.id;
    productId = product!.id;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/inventory/adjust - should restock product and write ledger row', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        storeId: bekasiStoreId,
        productId,
        deltaQty: 20,
        reason: 'RESTOCK',
        note: 'Supplier restock delivery #101',
      })
      .expect(201);

    expect(res.body.storeId).toBe(bekasiStoreId);
    expect(res.body.productId).toBe(productId);
    expect(res.body.stockOnHand).toBeGreaterThanOrEqual(70);

    // Verify ledger row exists
    const ledger = await prisma.stockLedger.findFirst({
      where: {
        storeId: bekasiStoreId,
        productId,
        reason: 'RESTOCK',
        note: 'Supplier restock delivery #101',
      },
    });
    expect(ledger).toBeTruthy();
    expect(ledger?.deltaQty).toBe(20);
  });

  it('POST /api/v1/inventory/transfer - Owner atomically transfers stock between stores', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fromStoreId: bekasiStoreId,
        toStoreId: kemangStoreId,
        productId,
        qty: 10,
        note: 'Urgent transfer to Kemang',
      })
      .expect(201);

    expect(res.body).toHaveProperty('transferId');
    expect(res.body).toHaveProperty('fromStoreStock');
    expect(res.body).toHaveProperty('toStoreStock');

    // Verify two ledger rows exist for this transferId
    const ledgerRows = await prisma.stockLedger.findMany({
      where: { referenceId: res.body.transferId },
      orderBy: { deltaQty: 'asc' },
    });
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows[0].reason).toBe('TRANSFER_OUT');
    expect(ledgerRows[0].deltaQty).toBe(-10);
    expect(ledgerRows[1].reason).toBe('TRANSFER_IN');
    expect(ledgerRows[1].deltaQty).toBe(10);
  });

  it('GET /api/v1/inventory/ledger - should retrieve paginated ledger audit trail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/inventory/ledger?storeId=${bekasiStoreId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0]).toHaveProperty('reason');
    expect(res.body.items[0]).toHaveProperty('deltaQty');
  });
});
