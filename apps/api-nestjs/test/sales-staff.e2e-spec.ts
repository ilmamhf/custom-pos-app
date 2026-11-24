import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { applyGlobalPrefix } from '../src/common/config/http.config';
import { configureBigIntSerialization } from '../src/common/utils/bigint.util';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The sales date filter and the staff edit workflow.
 *
 * Both are owner-facing surfaces: the filter narrows the receipts an owner
 * reconciles, and the edit dialog is the only way to change who works in
 * which branch.
 */
describe('Sales date filter & staff edit (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let managerToken: string;
  let bekasiStoreId: string;
  let kemangStoreId: string;

  // Two sales on the same branch, one day apart, so a range that covers one
  // of them can be told apart from a range that covers both.
  const earlySaleId = randomUUID();
  const lateSaleId = randomUUID();
  const shiftId = randomUUID();
  const earlySaleAt = new Date('2026-03-10T02:00:00.000Z');
  const lateSaleAt = new Date('2026-03-12T02:00:00.000Z');

  // The accounts the tests create, so the seeded directory is left as it was.
  const createdUserIds: string[] = [];

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
    prisma = app.get(PrismaService);

    const [bekasi, kemang] = await Promise.all([
      prisma.store.findUnique({ where: { code: 'BKS' } }),
      prisma.store.findUnique({ where: { code: 'KMG' } }),
    ]);
    bekasiStoreId = bekasi!.id;
    kemangStoreId = kemang!.id;

    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@toko.id', password: 'password123' });
    ownerToken = ownerRes.body.accessToken;

    const managerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'manager.bks@toko.id', password: 'password123' });
    managerToken = managerRes.body.accessToken;

    const cashier = await prisma.user.findUnique({
      where: { email: 'kasir1@toko.id' },
    });

    await prisma.shift.create({
      data: {
        id: shiftId,
        storeId: bekasiStoreId,
        userId: cashier!.id,
        openedAt: new Date('2026-03-01T00:00:00.000Z'),
        openingCash: 500000n,
      },
    });

    const sale = (id: string, receiptNo: string, createdAt: Date) => ({
      id,
      storeId: bekasiStoreId,
      shiftId,
      cashierId: cashier!.id,
      receiptNo,
      subtotal: 18000n,
      taxTotal: 1980n,
      discountTotal: 0n,
      grandTotal: 19980n,
      taxRateBps: 1100,
      paymentMethod: 'CASH' as const,
      status: 'COMPLETED' as const,
      createdAt,
    });

    await prisma.sale.create({
      data: sale(earlySaleId, `RANGE-EARLY-${Date.now()}`, earlySaleAt),
    });
    await prisma.sale.create({
      data: sale(lateSaleId, `RANGE-LATE-${Date.now()}`, lateSaleAt),
    });
  });

  afterAll(async () => {
    await prisma.sale.deleteMany({
      where: { id: { in: [earlySaleId, lateSaleId] } },
    });
    await prisma.shift.deleteMany({ where: { id: shiftId } });
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  it('GET /api/v1/sales - returns only the sales inside the picked range', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/sales?storeId=${bekasiStoreId}&from=${earlySaleAt.toISOString()}&to=${earlySaleAt.toISOString()}`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const ids = res.body.items.map((item: any) => item.id);
    expect(ids).toContain(earlySaleId);
    expect(ids).not.toContain(lateSaleId);
  });

  it('GET /api/v1/sales - a wider range covers both sales', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/sales?storeId=${bekasiStoreId}&from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const ids = res.body.items.map((item: any) => item.id);
    expect(ids).toContain(earlySaleId);
    expect(ids).toContain(lateSaleId);
  });

  it('GET /api/v1/sales - the bounds are inclusive on both ends', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/sales?storeId=${bekasiStoreId}&from=${earlySaleAt.toISOString()}&to=${earlySaleAt.toISOString()}`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    // The sale sits exactly on the boundary, so an exclusive bound would
    // have dropped it.
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/sales - rejects a malformed date with 400 instead of failing later', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/sales?from=not-a-date`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('GET /api/v1/sales - rejects a reversed range with 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales?from=2026-03-31T00:00:00.000Z&to=2026-03-01T00:00:00.000Z')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(res.body.message).toContain('from');
  });

  it('GET /api/v1/users - reports whether a PIN is set without leaking the hash', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const manager = res.body.find((u: any) => u.email === 'manager.bks@toko.id');
    expect(manager).toBeTruthy();
    expect(manager.hasPin).toBe(true);
    expect(manager.pinHash).toBeUndefined();

    const cashier = res.body.find((u: any) => u.email === 'kasir1@toko.id');
    expect(cashier.hasPin).toBe(false);
  });

  it('PATCH /api/v1/users/:id - updates the name, the role, and the branch assignment', async () => {
    const email = `edit.${Date.now()}@toko.id`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Before Edit',
        email,
        password: 'password123',
        role: 'CASHIER',
        storeIds: [bekasiStoreId],
      })
      .expect(201);
    createdUserIds.push(created.body.id);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'After Edit',
        role: 'MANAGER',
        pin: '123456',
        storeIds: [kemangStoreId],
      })
      .expect(200);

    expect(res.body.name).toBe('After Edit');
    expect(res.body.role).toBe('MANAGER');
    // The edit response carries the same shape as the list, so the Admin
    // does not have to refetch to learn the new assignment.
    expect(res.body.hasPin).toBe(true);
    expect(res.body.stores.map((s: any) => s.storeId)).toEqual([kemangStoreId]);

    const list = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const updated = list.body.find((u: any) => u.id === created.body.id);
    expect(updated.name).toBe('After Edit');
    expect(updated.role).toBe('MANAGER');
    expect(updated.hasPin).toBe(true);
    // The assignment is replaced, not merged: the old branch is gone.
    expect(updated.stores.map((s: any) => s.storeId)).toEqual([kemangStoreId]);
  });

  it('PATCH /api/v1/users/:id - refuses an email that belongs to somebody else', async () => {
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { email: 'kasir1@toko.id' },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${cashier.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'manager.bks@toko.id' })
      .expect(409);

    expect(res.body.message).toContain('already exists');
  });

  it('PATCH /api/v1/users/:id - refuses to deactivate the last active owner', async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'owner@toko.id' },
    });

    // A second owner makes the hand-over possible, so the guard has a
    // defined answer in both directions.
    const coOwnerEmail = `co.owner.${Date.now()}@toko.id`;
    const coOwner = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Co Owner',
        email: coOwnerEmail,
        password: 'password123',
        role: 'OWNER',
        storeIds: [],
      })
      .expect(201);
    createdUserIds.push(coOwner.body.id);

    const coOwnerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: coOwnerEmail, password: 'password123' });
    const coOwnerToken = coOwnerLogin.body.accessToken;

    try {
      // Another active owner remains, so the owner may step down.
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${owner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isActive: false })
        .expect(200);

      // Now the co-owner is the last active owner and cannot step down.
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${coOwner.body.id}`)
        .set('Authorization', `Bearer ${coOwnerToken}`)
        .send({ isActive: false })
        .expect(400);

      expect(res.body.message).toContain('last active owner');
    } finally {
      // Put the seeded owner back the way it was, whatever happened above.
      await prisma.user.update({
        where: { id: owner.id },
        data: { isActive: true },
      });
    }
  });

  it('PATCH /api/v1/users/:id - a manager can still read the branch they belong to', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/sales?storeId=${bekasiStoreId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
  });
});
