import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/app_database.dart';
import 'package:pos_flutter/core/database/daos/sales_dao.dart';
import 'package:pos_flutter/core/database/database_provider.dart';
import 'package:pos_flutter/core/database/tables/local_products.dart';
import 'package:pos_flutter/core/database/tables/local_sales.dart';
import 'package:pos_flutter/features/auth/auth_provider.dart';
import 'package:pos_flutter/features/shift/shift_provider.dart';

const _store = UserStore(
  id: 'store-1',
  name: 'Cabang Bekasi',
  code: 'BKS',
  taxRateBps: 1100,
);
const _user = User(id: 'user-1', name: 'Budi', role: 'CASHIER');
const _auth = AuthState(
  user: _user,
  stores: [_store],
  selectedStore: _store,
);

void main() {
  late AppDatabase db;
  late ProviderContainer container;

  setUp(() {
    db = AppDatabase.inMemory();
    container = ProviderContainer(
      overrides: [
        databaseProvider.overrideWithValue(db),
        shiftAuthProvider.overrideWithValue(_auth),
      ],
    );
  });

  tearDown(() {
    container.dispose();
    db.close();
  });

  Future<void> seedProduct({int price = 18000}) {
    return db.productsDao.upsertProduct(
      LocalProduct(
        id: 'prod-1',
        sku: 'KOPI-001',
        barcode: '8991234567890',
        name: 'Kopi Susu',
        effectivePrice: price,
        stockOnHand: 10,
        isActive: true,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
    );
  }

  Future<void> sellOne() {
    return db.salesDao.completeSale(
      saleId: 'sale-1',
      shiftId: container.read(shiftProvider).id!,
      storeId: _store.id,
      cashierId: _user.id,
      receiptNo: 'BKS-20261122-0001',
      subtotal: 36000,
      taxTotal: 3960,
      discountTotal: 0,
      grandTotal: 39960,
      paymentMethod: PaymentMethod.cash,
      items: const [
        SaleItemInput(
          productId: 'prod-1',
          productNameSnapshot: 'Kopi Susu',
          unitPrice: 18000,
          qty: 2,
          discountAmount: 0,
          taxAmount: 3960,
          lineTotal: 36000,
        ),
      ],
    );
  }

  test('opens a shift locally and enqueues it for sync', () async {
    final notifier = container.read(shiftProvider.notifier);

    await notifier.openShift(500000);

    final state = container.read(shiftProvider);
    expect(state.isOpen, isTrue);
    expect(state.openingCash, 500000);
    expect(state.expectedCash, 500000);

    final stored = await db.shiftsDao.getOpenShift(_store.id, _user.id);
    expect(stored, isNotNull);
    expect(stored!.openingCash, 500000);

    final pending = await db.syncDao.getPendingEntries();
    expect(pending, hasLength(1));
    expect(pending.single.entityType, 'shift');
    expect(pending.single.entityId, stored.id);

    final payload = jsonDecode(pending.single.payload) as Map<String, dynamic>;
    expect(payload['storeId'], _store.id);
    final shifts = payload['shifts'] as List;
    expect(shifts, hasLength(1));
    expect((shifts.first as Map)['id'], stored.id);
    expect((shifts.first as Map)['openingCash'], 500000);
  });

  test('rejects a negative opening cash', () async {
    final notifier = container.read(shiftProvider.notifier);

    await notifier.openShift(-1);

    expect(container.read(shiftProvider).isOpen, isFalse);
    expect(container.read(shiftProvider).error, isNotNull);
    expect(await db.syncDao.getPendingEntries(), isEmpty);
  });

  test('close shift derives expected cash from cash sales', () async {
    final notifier = container.read(shiftProvider.notifier);
    await notifier.openShift(500000);
    await seedProduct();
    await sellOne();

    await notifier.closeShift(actualCash: 539960);

    final state = container.read(shiftProvider);
    expect(state.isOpen, isFalse);
    expect(state.expectedCash, 539960);
    expect(state.actualCash, 539960);
    expect(state.variance, 0);

    final pending = await db.syncDao.getPendingEntries();
    // create shift, create sale, update shift
    expect(pending, hasLength(3));
    expect(pending.last.entityType, 'shift');
    expect(pending.last.operation.name, 'updateShift');
  });

  test('close shift reports shortage as negative variance', () async {
    final notifier = container.read(shiftProvider.notifier);
    await notifier.openShift(500000);
    await seedProduct();
    await sellOne();

    await notifier.closeShift(actualCash: 500000);

    final state = container.read(shiftProvider);
    expect(state.expectedCash, 539960);
    expect(state.variance, -39960);
  });

  test('expected cash ignores non-cash payments', () async {
    final notifier = container.read(shiftProvider.notifier);
    await notifier.openShift(500000);
    await seedProduct();
    await db.salesDao.completeSale(
      saleId: 'sale-qris',
      shiftId: container.read(shiftProvider).id!,
      storeId: _store.id,
      cashierId: _user.id,
      receiptNo: 'BKS-20261122-0002',
      subtotal: 18000,
      taxTotal: 1980,
      discountTotal: 0,
      grandTotal: 19980,
      paymentMethod: PaymentMethod.qris,
      items: const [
        SaleItemInput(
          productId: 'prod-1',
          productNameSnapshot: 'Kopi Susu',
          unitPrice: 18000,
          qty: 1,
          discountAmount: 0,
          taxAmount: 1980,
          lineTotal: 18000,
        ),
      ],
    );

    await notifier.closeShift(actualCash: 500000);

    expect(container.read(shiftProvider).expectedCash, 500000);
    expect(container.read(shiftProvider).variance, 0);
  });
}
