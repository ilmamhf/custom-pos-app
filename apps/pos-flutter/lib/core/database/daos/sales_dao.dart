/// DAO for local sales and sale items tables.
/// Implements atomic checkout transaction.

import '../app_database.dart';
import '../tables/local_sales.dart';
import '../tables/local_sale_items.dart';
import '../tables/local_products.dart';
import '../tables/sync_outbox.dart';
import '../../utils/uuid_helper.dart';

/// Input for a sale item during checkout.
class SaleItemInput {
  const SaleItemInput({
    required this.productId,
    required this.productNameSnapshot,
    required this.unitPrice,
    required this.qty,
    required this.discountAmount,
    required this.taxAmount,
    required this.lineTotal,
  });

  final String productId;
  final String productNameSnapshot;
  final int unitPrice;
  final int qty;
  final int discountAmount;
  final int taxAmount;
  final int lineTotal;
}

/// Result of a completed sale checkout.
class SaleCheckoutResult {
  const SaleCheckoutResult({
    required this.saleId,
    required this.receiptNo,
  });

  final String saleId;
  final String receiptNo;
}

/// Sale with its items for display.
class SaleWithItems {
  const SaleWithItems({
    required this.sale,
    required this.items,
  });

  final LocalSale sale;
  final List<LocalSaleItem> items;
}

/// Data access object for LocalSales and LocalSaleItems.
class SalesDao {
  SalesDao(this._db);

  final AppDatabase _db;

  /// Completes a sale atomically:
  /// 1. Insert sale and sale items
  /// 2. Decrement product stock
  /// 3. Enqueue sync outbox entry
  /// All in a single transaction.
  Future<SaleCheckoutResult> completeSale({
    required String saleId,
    required String shiftId,
    required String storeId,
    required String cashierId,
    required String receiptNo,
    required int subtotal,
    required int taxTotal,
    required int discountTotal,
    required int grandTotal,
    required PaymentMethod paymentMethod,
    required List<SaleItemInput> items,
  }) async {
    return _db.transactionResult<SaleCheckoutResult>(() {
      // 1. Insert sale
      _db.execute('''
        INSERT INTO local_sales 
        (id, store_id, shift_id, cashier_id, receipt_no, subtotal, tax_total, discount_total, grand_total, payment_method, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ''', [
        saleId,
        storeId,
        shiftId,
        cashierId,
        receiptNo,
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        paymentMethod.name.toUpperCase(),
        SaleStatus.completed.name.toUpperCase(),
        DateTime.now().toUtc().millisecondsSinceEpoch,
      ]);

      // 2. Insert sale items and decrement stock
      for (final item in items) {
        final saleItemId = generateUuid();
        _db.execute('''
          INSERT INTO local_sale_items 
          (id, sale_id, product_id, product_name_snapshot, unit_price, qty, refunded_qty, discount_amount, tax_amount, line_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
          saleItemId,
          saleId,
          item.productId,
          item.productNameSnapshot,
          item.unitPrice,
          item.qty,
          0, // refunded_qty
          item.discountAmount,
          item.taxAmount,
          item.lineTotal,
        ]);

        // Decrement stock (allows negative)
        _db.execute('''
          UPDATE local_products 
          SET stock_on_hand = stock_on_hand - ?
          WHERE id = ?
        ''', [item.qty, item.productId]);
      }

      // 3. Enqueue sync outbox entry
      final payload = _buildSalePushPayload(
        saleId: saleId,
        shiftId: shiftId,
        storeId: storeId,
        cashierId: cashierId,
        receiptNo: receiptNo,
        subtotal: subtotal,
        taxTotal: taxTotal,
        discountTotal: discountTotal,
        grandTotal: grandTotal,
        paymentMethod: paymentMethod,
        items: items,
      );

      _db.execute('''
        INSERT INTO sync_outbox 
        (entity_id, entity_type, operation, payload, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      ''', [
        saleId,
        'sale',
        SyncOperationType.createSale.name,
        payload,
        SyncStatus.pending.name.toUpperCase(),
        DateTime.now().toUtc().millisecondsSinceEpoch,
      ]);

      return SaleCheckoutResult(saleId: saleId, receiptNo: receiptNo);
    });
  }

  /// Builds the JSON payload for sync push.
  String _buildSalePushPayload({
    required String saleId,
    required String shiftId,
    required String storeId,
    required String cashierId,
    required String receiptNo,
    required int subtotal,
    required int taxTotal,
    required int discountTotal,
    required int grandTotal,
    required PaymentMethod paymentMethod,
    required List<SaleItemInput> items,
  }) {
    final buffer = StringBuffer();
    buffer.write('{"storeId":"$storeId",');
    buffer.write('"shifts":[],');
    buffer.write('"sales":[{"id":"$saleId",');
    buffer.write('"shiftId":"$shiftId",');
    buffer.write('"receiptNo":"$receiptNo",');
    buffer.write('"subtotal":$subtotal,');
    buffer.write('"taxTotal":$taxTotal,');
    buffer.write('"discountTotal":$discountTotal,');
    buffer.write('"grandTotal":$grandTotal,');
    buffer.write('"paymentMethod":"${paymentMethod.name.toUpperCase()}",');
    buffer.write('"createdAt":"${DateTime.now().toUtc().toIso8601String()}",');
    buffer.write('"items":[');
    for (int i = 0; i < items.length; i++) {
      final item = items[i];
      buffer.write('{"id":"${generateUuid()}",');
      buffer.write('"productId":"${item.productId}",');
      buffer.write('"productNameSnapshot":"${item.productNameSnapshot}",');
      buffer.write('"unitPrice":${item.unitPrice},');
      buffer.write('"qty":${item.qty}}');
      if (i < items.length - 1) buffer.write(',');
    }
    buffer.write(']}]}');
    return buffer.toString();
  }

  /// Gets a sale by ID with its items.
  Future<SaleWithItems?> getSaleWithItems(String saleId) async {
    final saleRows = _db.select('SELECT * FROM local_sales WHERE id = ?', [saleId]);
    if (saleRows.isEmpty) return null;
    final sale = _rowToSale(saleRows.first);

    final itemRows = _db.select('''
      SELECT * FROM local_sale_items 
      WHERE sale_id = ? 
      ORDER BY id ASC
    ''', [saleId]);
    final items = itemRows.map(_rowToSaleItem).toList();

    return SaleWithItems(sale: sale, items: items);
  }

  /// Gets a sale by receipt number.
  Future<LocalSale?> getSaleByReceiptNo(String receiptNo) async {
    final rows = _db.select('SELECT * FROM local_sales WHERE receipt_no = ?', [receiptNo]);
    if (rows.isEmpty) return null;
    return _rowToSale(rows.first);
  }

  /// Gets all sales for a shift.
  Future<List<LocalSale>> getSalesForShift(String shiftId) async {
    final rows = _db.select('''
      SELECT * FROM local_sales 
      WHERE shift_id = ?
      ORDER BY created_at DESC
    ''', [shiftId]);
    return rows.map(_rowToSale).toList();
  }

  /// Gets all sales for a store.
  Future<List<LocalSale>> getSalesForStore(String storeId, {int limit = 100}) async {
    final rows = _db.select('''
      SELECT * FROM local_sales 
      WHERE store_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    ''', [storeId, limit]);
    return rows.map(_rowToSale).toList();
  }

  /// Gets unsynced sales for push.
  Future<List<LocalSale>> getUnsyncedSales() async {
    final rows = _db.select('''
      SELECT * FROM local_sales 
      WHERE status = ?
      ORDER BY created_at ASC
    ''', [SaleStatus.completed.name.toUpperCase()]);
    return rows.map(_rowToSale).toList();
  }

  /// Updates sale status (e.g., for refunds).
  Future<void> updateSaleStatus(String saleId, SaleStatus status) async {
    _db.execute('''
      UPDATE local_sales 
      SET status = ?
      WHERE id = ?
    ''', [status.name.toUpperCase(), saleId]);
  }

  /// Increments refunded quantity for a sale item.
  Future<void> incrementRefundedQty(String saleItemId, int quantity) async {
    _db.execute('''
      UPDATE local_sale_items 
      SET refunded_qty = refunded_qty + ?
      WHERE id = ?
    ''', [quantity, saleItemId]);
  }

  /// Gets sale items for a sale.
  Future<List<LocalSaleItem>> getSaleItems(String saleId) async {
    final rows = _db.select('''
      SELECT * FROM local_sale_items 
      WHERE sale_id = ? 
      ORDER BY id ASC
    ''', [saleId]);
    return rows.map(_rowToSaleItem).toList();
  }

  LocalSale _rowToSale(Map<String, Object?> row) {
    return LocalSale(
      id: row['id'] as String,
      storeId: row['store_id'] as String,
      shiftId: row['shift_id'] as String,
      cashierId: row['cashier_id'] as String,
      receiptNo: row['receipt_no'] as String,
      subtotal: row['subtotal'] as int,
      taxTotal: row['tax_total'] as int,
      discountTotal: row['discount_total'] as int,
      grandTotal: row['grand_total'] as int,
      paymentMethod: _paymentMethodFromString(row['payment_method'] as String),
      status: _saleStatusFromString(row['status'] as String),
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
      lastSyncedAt: row['last_synced_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(row['last_synced_at'] as int)
          : null,
    );
  }

  LocalSaleItem _rowToSaleItem(Map<String, Object?> row) {
    return LocalSaleItem(
      id: row['id'] as String,
      saleId: row['sale_id'] as String,
      productId: row['product_id'] as String,
      productNameSnapshot: row['product_name_snapshot'] as String,
      unitPrice: row['unit_price'] as int,
      qty: row['qty'] as int,
      refundedQty: row['refunded_qty'] as int,
      discountAmount: row['discount_amount'] as int,
      taxAmount: row['tax_amount'] as int,
      lineTotal: row['line_total'] as int,
    );
  }

  PaymentMethod _paymentMethodFromString(String value) {
    return PaymentMethod.values.firstWhere(
      (e) => e.name.toUpperCase() == value.toUpperCase(),
      orElse: () => PaymentMethod.cash,
    );
  }

  SaleStatus _saleStatusFromString(String value) {
    return SaleStatus.values.firstWhere(
      (e) => e.name.toUpperCase() == value.toUpperCase(),
      orElse: () => SaleStatus.completed,
    );
  }
}