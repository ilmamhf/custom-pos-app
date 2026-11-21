import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { configureBigIntSerialization } from '../src/common/utils/bigint.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'crypto';

describe('Offline Sync & Refund Lifecycle (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cashierToken: string;
  let managerToken: string;
  let bekasiStoreId: string;
  let productId: string;
  let initialStock: number;

  const clientShiftId = randomUUID();
  const clientSaleId = randomUUID();
  const clientSaleItemId = randomUUID();

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

    const [bekasi, product] = await Promise.all([
      prisma.store.findUnique({ where: { code: 'BKS' } }),
      prisma.product.findUnique({ where: { sku: 'KOPI-001' } }),
    ]);

    bekasiStoreId = bekasi!.id;
    productId = product!.id;

    const currentInv = await prisma.storeInventory.findUnique({
      where: { storeId_productId: { storeId: bekasiStoreId, productId } },
    });
    initialStock = currentInv?.stockOnHand ?? 0;

    // Login Cashier
    const cashierRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'kasir1@toko.id', password: 'password123' });
    cashierToken = cashierRes.body.accessToken;

    // Login Manager
    const managerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'manager.bks@toko.id', password: 'password123' });
    managerToken = managerRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. POST /api/v1/sync/push - Idempotent offline batch sync uploads shift and sale', async () => {
    const payload = {
      storeId: bekasiStoreId,
      shifts: [
        {
          id: clientShiftId,
          openedAt: '2026-11-21T08:00:00.000Z',
          closedAt: null,
          openingCash: 500000,
          actualCash: null,
        },
      ],
      sales: [
        {
          id: clientSaleId,
          shiftId: clientShiftId,
          receiptNo: `BKS-E2E-${Date.now()}`,
          subtotal: 36000,
          taxTotal: 3960,
          discountTotal: 0,
          grandTotal: 39960,
          paymentMethod: 'QRIS',
          createdAt: '2026-11-21T14:10:00.000Z',
          items: [
            {
              id: clientSaleItemId,
              productId,
              productNameSnapshot: 'Kopi Susu Gula Aren',
              unitPrice: 18000,
              qty: 2,
            },
          ],
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('X-Store-Id', bekasiStoreId)
      .send(payload)
      .expect(200);

    expect(res.body.syncedShiftIds).toContain(clientShiftId);
    expect(res.body.syncedSaleIds).toContain(clientSaleId);
    expect(res.body.failed).toHaveLength(0);

    // Verify inventory decremented by 2
    const invAfter = await prisma.storeInventory.findUnique({
      where: { storeId_productId: { storeId: bekasiStoreId, productId } },
    });
    expect(invAfter?.stockOnHand).toBe(initialStock - 2);

    // Verify stock ledger entry created
    const ledger = await prisma.stockLedger.findFirst({
      where: { referenceId: clientSaleId, productId },
    });
    expect(ledger).toBeTruthy();
    expect(ledger?.reason).toBe('SALE');
    expect(ledger?.deltaQty).toBe(-2);
  });

  it('2. POST /api/v1/sync/push - Re-submitting the same payload is completely idempotent', async () => {
    const payload = {
      storeId: bekasiStoreId,
      shifts: [
        {
          id: clientShiftId,
          openedAt: '2026-11-21T08:00:00.000Z',
          closedAt: null,
          openingCash: 500000,
          actualCash: null,
        },
      ],
      sales: [
        {
          id: clientSaleId,
          shiftId: clientShiftId,
          receiptNo: `BKS-E2E-DUPLICATE`,
          subtotal: 36000,
          taxTotal: 3960,
          discountTotal: 0,
          grandTotal: 39960,
          paymentMethod: 'QRIS',
          createdAt: '2026-11-21T14:10:00.000Z',
          items: [
            {
              id: clientSaleItemId,
              productId,
              productNameSnapshot: 'Kopi Susu Gula Aren',
              unitPrice: 18000,
              qty: 2,
            },
          ],
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('X-Store-Id', bekasiStoreId)
      .send(payload)
      .expect(200);

    expect(res.body.syncedSaleIds).toContain(clientSaleId);

    // Stock must NOT have decremented a second time!
    const invAfter = await prisma.storeInventory.findUnique({
      where: { storeId_productId: { storeId: bekasiStoreId, productId } },
    });
    expect(invAfter?.stockOnHand).toBe(initialStock - 2);
  });

  it('3. GET /api/v1/sync/pull - Returns latest products and delta cursor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/sync/pull?storeId=${bekasiStoreId}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('X-Store-Id', bekasiStoreId)
      .expect(200);

    expect(res.body).toHaveProperty('serverTime');
    expect(res.body.store.code).toBe('BKS');
    expect(Array.isArray(res.body.products)).toBe(true);

    const kopi = res.body.products.find((p: any) => p.id === productId);
    expect(kopi).toBeTruthy();
    expect(kopi.stockOnHand).toBe(initialStock - 2);
    expect(kopi.effectivePrice).toBe(18000);
  });

  it('4. POST /api/v1/sales/:id/refund - Item-level refund restores stock and creates REFUND ledger row', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales/${clientSaleId}/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        managerPin: '123456',
        reason: 'Wrong item ordered',
        items: [
          {
            saleItemId: clientSaleItemId,
            refundQty: 1,
          },
        ],
      })
      .expect(200);

    expect(res.body.saleId).toBe(clientSaleId);
    expect(res.body.status).toBe('PARTIALLY_REFUNDED');
    expect(res.body.refundedAmount).toBe(19980); // 18000 + 11% tax (1980)

    // Verify stock restored by 1
    const invRestored = await prisma.storeInventory.findUnique({
      where: { storeId_productId: { storeId: bekasiStoreId, productId } },
    });
    expect(invRestored?.stockOnHand).toBe(initialStock - 1);

    // Verify REFUND ledger row
    const refundLedger = await prisma.stockLedger.findFirst({
      where: {
        referenceId: clientSaleId,
        reason: 'REFUND',
      },
    });
    expect(refundLedger).toBeTruthy();
    expect(refundLedger?.deltaQty).toBe(1);
  });

  it('5. GET /api/v1/reports/summary - Reports consolidated analytics and top products', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/summary?storeId=${bekasiStoreId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('grossSales');
    expect(res.body).toHaveProperty('refundTotal');
    expect(res.body).toHaveProperty('netSales');
    expect(res.body).toHaveProperty('transactionCount');
    expect(Array.isArray(res.body.paymentBreakdown)).toBe(true);
    expect(Array.isArray(res.body.topProducts)).toBe(true);
  });
});
