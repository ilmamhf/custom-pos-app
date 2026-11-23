/// DAO for local sales and sale items tables.
/// Implements atomic checkout transaction.

import 'dart:convert';
import '../app_database.dart';
import '../tables/local_sales.dart';
import '../tables/local_sale_items.dart';
import '../tables/local_sale_tenders.dart';
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

/// Input for a sale tender during checkout.
class SaleTenderInput {
  const SaleTenderInput({
    required this.paymentMethod,
    required this.amount,
    this.change = 0,
    this.reference,
  });

  final PaymentMethod paymentMethod;
  final int amount;
  final int change;
  final String? reference;
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
  /// 3. Insert tenders
  /// 4. Optionally enqueue a server-sync outbox entry
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
    required List<SaleTenderInput> tenders,
    bool syncToServer = true,
    DateTime? createdAt,
  }) async {
    final result = _db.transactionResult<SaleCheckoutResult>(() {
      final created = (createdAt ?? DateTime.now()).toUtc();

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
        created.millisecondsSinceEpoch,
      ]);

      // 2. Insert sale items and decrement stock. Item IDs are generated once
      // here and reused in the outbox payload so local rows and the server
      // copy share the same idempotency keys.
      final itemIds = <String>[];
      for (final item in items) {
        final saleItemId = generateUuid();
        itemIds.add(saleItemId);
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

        // Decrement stock for this store only (allows negative).
        _db.execute('''
          UPDATE local_products 
          SET stock_on_hand = stock_on_hand - ?
          WHERE store_id = ? AND id = ?
        ''', [item.qty, storeId, item.productId]);
      }

      // 3. Insert tenders.
      for (final tender in tenders) {
        final tenderId = generateUuid();
        _db.execute('''
          INSERT INTO local_sale_tenders 
          (id, sale_id, payment_method, amount, change, reference, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', [
          tenderId,
          saleId,
          tender.paymentMethod.name.toUpperCase(),
          tender.amount,
          tender.change,
          tender.reference,
          created.millisecondsSinceEpoch,
        ]);
      }

      // 4. Enqueue a server-sync entry unless this is a local-only demo sale.
      if (syncToServer) {
        final payload = buildSalePushPayload(
          saleId: saleId,
          shiftId: shiftId,
          storeId: storeId,
          receiptNo: receiptNo,
          subtotal: subtotal,
          taxTotal: taxTotal,
          discountTotal: discountTotal,
          grandTotal: grandTotal,
          paymentMethod: paymentMethod,
          createdAt: created,
          items: items,
          itemIds: itemIds,
          tenders: tenders,
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
          created.millisecondsSinceEpoch,
        ]);
      }

      return SaleCheckoutResult(saleId: saleId, receiptNo: receiptNo);
    });
    await _db.flush();
    return result;
  }

  /// Gets a sale by ID with its items.
  Future<SaleWithItems?> getSaleWithItems(String saleId) async {
    final saleRows =
        _db.select('SELECT * FROM local_sales WHERE id = ?', [saleId]);
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
    final rows = _db
        .select('SELECT * FROM local_sales WHERE receipt_no = ?', [receiptNo]);
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

  /// Cash expected in the drawer for a shift: cash tenders minus proportional
  /// refunds, using each line's immutable line total (which includes the
  /// sale-time tax and discount) rather than a gross unit price.
  Future<int> getCashTotalForShift(String shiftId) async {
    // Get all sales for the shift with their tenders
    final salesRows = _db.select('''
      SELECT s.id, s.grand_total, s.payment_method,
             t.payment_method as tender_method, t.amount, t.change
      FROM local_sales s
      LEFT JOIN local_sale_tenders t ON t.sale_id = s.id
      WHERE s.shift_id = ?
    ''', [shiftId]);

    // Group tenders by sale
    final Map<String, List<Map<String, Object?>>> tendersBySale = {};
    for (final row in salesRows) {
      final saleId = row['id'] as String;
      final tenderMethod = row['tender_method'] as String?;
      if (tenderMethod != null) {
        tendersBySale.putIfAbsent(saleId, () => []).add({
          'payment_method': tenderMethod,
          'amount': row['amount'] as int,
          'change': row['change'] as int,
        });
      }
    }

    // Calculate cash total using tenders
    int cashTotal = 0;
    for (final row in salesRows) {
      final saleId = row['id'] as String;
      final tenders = tendersBySale[saleId] ?? [];
      
      if (tenders.isEmpty) {
        // Legacy fallback: check payment_method
        if (row['payment_method'] == PaymentMethod.cash.name.toUpperCase()) {
          cashTotal += row['grand_total'] as int;
        }
      } else {
        // Use tender records
        for (final tender in tenders) {
          if (tender['payment_method'] == PaymentMethod.cash.name.toUpperCase()) {
            cashTotal += (tender['amount'] as int) - (tender['change'] as int);
          }
        }
      }
    }

    // Subtract refunds for cash tenders
    final refundRows = _db.select('''
      SELECT i.sale_id, SUM((i.line_total * i.refunded_qty) / i.qty) AS refunded
      FROM local_sale_items i
      JOIN local_sales s ON s.id = i.sale_id
      LEFT JOIN local_sale_tenders t ON t.sale_id = s.id AND t.payment_method = ?
      WHERE s.shift_id = ? AND i.refunded_qty > 0
      GROUP BY i.sale_id
    ''', [PaymentMethod.cash.name.toUpperCase(), shiftId]);

    for (final row in refundRows) {
      cashTotal -= row['refunded'] as int;
    }

    return cashTotal;
  }

  /// Quantities of products sold locally whose sale has not been acknowledged
  /// by the server (outbox still PENDING or FAILED). A pull subtracts these
  /// from authoritative server stock so an unsynced sale is not erased.
  Future<Map<String, int>> getPendingStockDelta(String storeId) async {
    final rows = _db.select('''
      SELECT i.product_id AS product_id, SUM(i.qty) AS qty
      FROM local_sale_items i
      JOIN local_sales s ON s.id = i.sale_id
      JOIN sync_outbox o ON o.entity_type = 'sale' AND o.entity_id = s.id
      WHERE s.store_id = ? AND o.status IN ('PENDING', 'FAILED')
      GROUP BY i.product_id
    ''', [storeId]);
    return {
      for (final row in rows)
        row['product_id'] as String: (row['qty'] as int?) ?? 0,
    };
  }

  /// Number of sales already recorded for [storeId] on the local calendar day
  /// containing [at]. Used to build the daily receipt sequence.
  Future<int> countSalesForDay(String storeId, DateTime at) async {
    final local = at.toLocal();
    final start = DateTime(local.year, local.month, local.day);
    final end = start.add(const Duration(days: 1));
    final rows = _db.select('''
      SELECT COUNT(*) AS count FROM local_sales
      WHERE store_id = ? AND created_at >= ? AND created_at < ?
    ''', [
      storeId,
      start.toUtc().millisecondsSinceEpoch,
      end.toUtc().millisecondsSinceEpoch,
    ]);
    return rows.first['count'] as int;
  }

  /// Gets all sales for a store.
  Future<List<LocalSale>> getSalesForStore(String storeId,
      {int limit = 100}) async {
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

  /// Updates last_synced_at for a sale (called after successful push).
  Future<void> updateLastSynced(String saleId, DateTime timestamp) async {
    _db.execute('''
      UPDATE local_sales SET last_synced_at = ? WHERE id = ?
    ''', [timestamp.millisecondsSinceEpoch, saleId]);
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

  LocalSaleTender _rowToSaleTender(Map<String, Object?> row) {
    return LocalSaleTender(
      id: row['id'] as String,
      saleId: row['sale_id'] as String,
      paymentMethod: _paymentMethodFromString(row['payment_method'] as String),
      amount: row['amount'] as int,
      change: row['change'] as int,
      reference: row['reference'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
    );
  }

  /// Gets tenders for a sale.
  Future<List<LocalSaleTender>> getTendersForSale(String saleId) async {
    final rows = _db.select('''
      SELECT * FROM local_sale_tenders 
      WHERE sale_id = ? 
      ORDER BY created_at ASC
    ''', [saleId]);
    return rows.map(_rowToSaleTender).toList();
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

/// Builds a `POST /sync/push` body carrying a single sale and its items.
String buildSalePushPayload({
  required String saleId,
  required String shiftId,
  required String storeId,
  required String receiptNo,
  required int subtotal,
  required int taxTotal,
  required int discountTotal,
  required int grandTotal,
  required PaymentMethod paymentMethod,
  required DateTime createdAt,
  required List<SaleItemInput> items,
  required List<String> itemIds,
  required List<SaleTenderInput> tenders,
}) {
  assert(items.length == itemIds.length);
  return jsonEncode({
    'storeId': storeId,
    'shifts': <Object>[],
    'sales': [
      {
        'id': saleId,
        'shiftId': shiftId,
        'receiptNo': receiptNo,
        'subtotal': subtotal,
        'taxTotal': taxTotal,
        'discountTotal': discountTotal,
        'grandTotal': grandTotal,
        'paymentMethod': paymentMethod.name.toUpperCase(),
        'createdAt': createdAt.toUtc().toIso8601String(),
        'items': [
          for (var i = 0; i < items.length; i++)
            {
              'id': itemIds[i],
              'productId': items[i].productId,
              'productNameSnapshot': items[i].productNameSnapshot,
              'unitPrice': items[i].unitPrice,
              'qty': items[i].qty,
              // Reconciliation hints: the server recomputes the authoritative
              // price/tax but needs the line discount to preserve a discounted
              // offline sale.
              'discountAmount': items[i].discountAmount,
              'taxAmount': items[i].taxAmount,
              'lineTotal': items[i].lineTotal,
            }
        ],
        'tenders': [
          for (final tender in tenders)
            {
              'paymentMethod': tender.paymentMethod.name.toUpperCase(),
              'amount': tender.amount,
              'change': tender.change,
              'reference': tender.reference,
            }
        ],
      }
    ],
  });
}
