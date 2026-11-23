import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/app_database.dart';
import 'package:pos_flutter/core/database/daos/sales_dao.dart';
import 'package:pos_flutter/core/database/tables/local_products.dart';
import 'package:pos_flutter/core/database/tables/local_sales.dart';
import 'package:pos_flutter/core/database/tables/local_shifts.dart';

void main() {
  late AppDatabase db;

  setUp(() async {
    db = await AppDatabase.inMemory();
    await db.shiftsDao.openShift(
      LocalShift(
        id: 'shift-1',
        storeId: 'store-1',
        userId: 'user-1',
        openedAt: DateTime.utc(2026, 11, 22, 8),
        openingCash: 0,
      ),
      syncToServer: false,
    );
    await db.productsDao.upsertProduct(
      LocalProduct(
        id: 'prod-1',
        sku: 'KOPI-001',
        barcode: '8991234567890',
        name: 'Kopi Susu',
        effectivePrice: 18000,
        stockOnHand: 10,
        isActive: true,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
    );
  });

  tearDown(() => db.close());

  Future<SaleCheckoutResult> checkout({String receiptNo = 'BKS-20261122-0001'}) {
    return db.salesDao.completeSale(
      saleId: 'sale-1',
      shiftId: 'shift-1',
      storeId: 'store-1',
      cashierId: 'user-1',
      receiptNo: receiptNo,
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
      tenders: const [
        SaleTenderInput(paymentMethod: PaymentMethod.cash, amount: 40000, change: 40),
      ],
    );
  }

  test('checkout writes sale, items, stock and outbox atomically', () async {
    final result = await checkout();

    expect(result.saleId, 'sale-1');
    expect(result.receiptNo, 'BKS-20261122-0001');

    final sale = await db.salesDao.getSaleWithItems('sale-1');
    expect(sale, isNotNull);
    expect(sale!.sale.grandTotal, 39960);
    expect(sale.items, hasLength(1));
    expect(sale.items.single.productNameSnapshot, 'Kopi Susu');
    expect(sale.items.single.unitPrice, 18000);

    final product = await db.productsDao.getProductById('prod-1');
    expect(product!.stockOnHand, 8);

    final pending = await db.syncDao.getPendingEntries();
    expect(pending, hasLength(1));
    expect(pending.single.entityType, 'sale');
    expect(pending.single.entityId, 'sale-1');
  });

  test('outbox payload item ids match persisted sale item ids', () async {
    await checkout();

    final sale = await db.salesDao.getSaleWithItems('sale-1');
    final pending = await db.syncDao.getPendingEntries();
    final payload = jsonDecode(pending.single.payload) as Map<String, dynamic>;
    final sales = payload['sales'] as List;
    final items = (sales.single as Map)['items'] as List;

    expect(
      items.map((i) => (i as Map)['id']).toList(),
      sale!.items.map((i) => i.id).toList(),
    );
    expect((items.single as Map)['productId'], 'prod-1');
    expect((items.single as Map)['qty'], 2);
  });

  test('a failed insert rolls back stock and outbox', () async {
    await checkout();

    // Duplicate receipt number violates UNIQUE(receipt_no).
    await expectLater(
      db.salesDao.completeSale(
        saleId: 'sale-2',
        shiftId: 'shift-1',
        storeId: 'store-1',
        cashierId: 'user-1',
        receiptNo: 'BKS-20261122-0001',
        subtotal: 18000,
        taxTotal: 1980,
        discountTotal: 0,
        grandTotal: 19980,
        paymentMethod: PaymentMethod.cash,
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
        tenders: const [
          SaleTenderInput(paymentMethod: PaymentMethod.cash, amount: 20000, change: 20),
        ],
      ),
      throwsA(isA<Exception>()),
    );

    expect(await db.salesDao.getSaleWithItems('sale-2'), isNull);
    expect((await db.productsDao.getProductById('prod-1'))!.stockOnHand, 8);
    expect(await db.syncDao.getPendingEntries(), hasLength(1));
  });
}
