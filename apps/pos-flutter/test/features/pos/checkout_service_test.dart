import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/app_database.dart';
import 'package:pos_flutter/core/database/tables/local_products.dart';
import 'package:pos_flutter/core/database/tables/local_sales.dart';
import 'package:pos_flutter/features/pos/cart_math.dart';
import 'package:pos_flutter/features/pos/checkout_service.dart';

void main() {
  late AppDatabase db;
  late CheckoutService service;

  setUp(() async {
    db = AppDatabase.inMemory();
    service = CheckoutService(db);
    await db.productsDao.upsertProduct(
      LocalProduct(
        id: 'prod-1',
        sku: 'KOPI-001',
        name: 'Kopi Susu',
        effectivePrice: 18000,
        stockOnHand: 10,
        isActive: true,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
    );
  });

  tearDown(() => db.close());

  const cart = CartState(
    lines: [
      CartLine(productId: 'prod-1', name: 'Kopi Susu', unitPrice: 18000, qty: 2),
    ],
    taxRateBps: 1100,
  );

  Future<dynamic> checkout({
    CartState state = cart,
    PaymentMethod method = PaymentMethod.cash,
    int? tendered,
    DateTime? now,
  }) {
    return service.checkout(
      cart: state,
      paymentMethod: method,
      storeId: 'store-1',
      storeCode: 'BKS',
      shiftId: 'shift-1',
      cashierId: 'user-1',
      amountTendered: tendered,
      now: now,
    );
  }

  test('persists the sale, stock and outbox entry', () async {
    final result = await checkout(now: DateTime(2026, 11, 22, 10));

    final sale = await db.salesDao.getSaleWithItems(result.saleId);
    expect(sale, isNotNull);
    expect(sale!.sale.subtotal, 36000);
    expect(sale.sale.taxTotal, 3960);
    expect(sale.sale.grandTotal, 39960);
    expect(sale.sale.paymentMethod, PaymentMethod.cash);
    expect(sale.sale.receiptNo, 'BKS-20261122-0001');
    expect(sale.items, hasLength(1));
    expect(sale.items.single.qty, 2);
    expect(sale.items.single.lineTotal, 36000);
    expect(sale.items.single.taxAmount, 3960);

    expect((await db.productsDao.getProductById('prod-1'))!.stockOnHand, 8);
    expect(await db.syncDao.getPendingEntries(), hasLength(1));
  });

  test('receipt sequence increments within the same day', () async {
    final first = await checkout(now: DateTime(2026, 11, 22, 9));
    final second = await checkout(now: DateTime(2026, 11, 22, 11));

    expect(first.receiptNo, 'BKS-20261122-0001');
    expect(second.receiptNo, 'BKS-20261122-0002');
  });

  test('receipt sequence resets the next day', () async {
    await checkout(now: DateTime(2026, 11, 22, 23));
    final nextDay = await checkout(now: DateTime(2026, 11, 23, 1));

    expect(nextDay.receiptNo, 'BKS-20261123-0001');
  });

  test('sale item tax shares sum to the sale tax', () async {
    const mixed = CartState(
      lines: [
        CartLine(productId: 'prod-1', name: 'A', unitPrice: 3333, qty: 1),
        CartLine(productId: 'prod-1', name: 'B', unitPrice: 7777, qty: 1),
      ],
      taxRateBps: 1100,
    );

    final result = await checkout(state: mixed);
    final sale = await db.salesDao.getSaleWithItems(result.saleId);

    final itemTax = sale!.items.fold(0, (sum, item) => sum + item.taxAmount);
    expect(itemTax, sale.sale.taxTotal);
  });

  test('rejects an empty cart without writing anything', () async {
    await expectLater(
      checkout(state: const CartState(taxRateBps: 1100)),
      throwsA(isA<CheckoutException>()),
    );

    expect(await db.syncDao.getPendingEntries(), isEmpty);
    expect((await db.productsDao.getProductById('prod-1'))!.stockOnHand, 10);
  });

  test('rejects cash below the total without writing anything', () async {
    await expectLater(
      checkout(tendered: 39959),
      throwsA(isA<CheckoutException>()),
    );

    expect(await db.syncDao.getPendingEntries(), isEmpty);
  });

  test('accepts non-cash payment without tendered cash', () async {
    final result = await checkout(method: PaymentMethod.qris);
    final sale = await db.salesDao.getSaleWithItems(result.saleId);

    expect(sale!.sale.paymentMethod, PaymentMethod.qris);
  });

  test('outbox payload carries the sale total and item snapshot', () async {
    await checkout();

    final pending = await db.syncDao.getPendingEntries();
    final payload = jsonDecode(pending.single.payload) as Map<String, dynamic>;
    final sale = (payload['sales'] as List).single as Map<String, dynamic>;

    expect(sale['grandTotal'], 39960);
    expect(sale['paymentMethod'], 'CASH');
    expect((sale['items'] as List).single['productNameSnapshot'], 'Kopi Susu');
  });
}
