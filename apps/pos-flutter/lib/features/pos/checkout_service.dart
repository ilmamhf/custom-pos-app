/// Offline checkout orchestration: cart -> local atomic sale.
///
/// This service never touches the network. The sale, its items, and the stock
/// decrement are committed in one transaction by `SalesDao.completeSale`.
/// Real sessions also commit a sync-outbox entry in that transaction; the
/// browser demo can keep its sale local-only.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/database/app_database.dart';
import '../../core/database/daos/sales_dao.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_sales.dart';
import '../../core/utils/uuid_helper.dart';
import 'cart_math.dart';

/// Raised when a checkout cannot be completed (validation, not I/O).
class CheckoutException implements Exception {
  const CheckoutException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Turns a [CartState] into a persisted sale.
class CheckoutService {
  CheckoutService(this._db);

  final AppDatabase _db;

  Future<SaleCheckoutResult> checkout({
    required CartState cart,
    required PaymentMethod paymentMethod,
    required String storeId,
    required String storeCode,
    required String shiftId,
    required String cashierId,
    int? amountTendered,
    DateTime? now,
    bool syncToServer = true,
  }) async {
    if (cart.isEmpty) {
      throw const CheckoutException('Cart is empty');
    }
    if (cart.grandTotal < 0) {
      throw const CheckoutException('Total cannot be negative');
    }
    if (paymentMethod == PaymentMethod.cash) {
      final tendered = amountTendered ?? cart.grandTotal;
      if (tendered < cart.grandTotal) {
        throw const CheckoutException('Cash tendered is less than the total');
      }
    }

    final createdAt = now ?? DateTime.now();
    final sequence =
        await _db.salesDao.countSalesForDay(storeId, createdAt) + 1;
    final receiptNo = generateReceiptNo(
      storeCode: storeCode,
      date: createdAt,
      sequence: sequence,
    );

    final taxShares = cart.allocatedTax;
    final items = <SaleItemInput>[
      for (var i = 0; i < cart.lines.length; i++)
        SaleItemInput(
          productId: cart.lines[i].productId,
          productNameSnapshot: cart.lines[i].name,
          unitPrice: cart.lines[i].unitPrice,
          qty: cart.lines[i].qty,
          discountAmount: cart.lines[i].gross - cart.lines[i].net,
          taxAmount: taxShares[i],
          lineTotal: cart.lines[i].net,
        ),
    ];

    return _db.salesDao.completeSale(
      saleId: generateUuid(),
      shiftId: shiftId,
      storeId: storeId,
      cashierId: cashierId,
      receiptNo: receiptNo,
      subtotal: cart.subtotal,
      taxTotal: cart.taxTotal,
      discountTotal: cart.discountTotal,
      grandTotal: cart.grandTotal,
      paymentMethod: paymentMethod,
      items: items,
      syncToServer: syncToServer,
      createdAt: createdAt,
    );
  }
}

/// Checkout service bound to the app database.
final checkoutServiceProvider = Provider<CheckoutService>((ref) {
  return CheckoutService(ref.watch(databaseProvider));
});
