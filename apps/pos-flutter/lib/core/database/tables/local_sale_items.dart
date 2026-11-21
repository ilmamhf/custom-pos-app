/// Local sale items table for sale line items with snapshots.
/// Synced to server via POST /sync/push.

import 'package:drift/drift.dart';

/// Represents a line item in a sale.
/// Contains product snapshot (name, price) at time of sale.
class LocalSaleItems extends Table {
  /// Primary key - client-generated UUID.
  TextColumn get id => text().withLength(min: 36, max: 36)();

  /// Foreign key to LocalSales.
  TextColumn get saleId => text().withLength(min: 36, max: 36)();

  /// Product UUID from server.
  TextColumn get productId => text().withLength(min: 36, max: 36)();

  /// Product name snapshot at time of sale.
  TextColumn get productNameSnapshot => text().withLength(min: 1, max: 150)();

  /// Unit price snapshot at time of sale (integer IDR).
  IntColumn get unitPrice => integer()();

  /// Quantity sold.
  IntColumn get qty => integer()();

  /// Quantity refunded (for partial refunds).
  IntColumn get refundedQty => integer().withDefault(const Constant(0))();

  /// Item-level discount amount (integer IDR).
  IntColumn get discountAmount => integer().withDefault(const Constant(0))();

  /// Tax amount for this line item (integer IDR).
  IntColumn get taxAmount => integer().withDefault(const Constant(0))();

  /// Line total = (unitPrice * qty) - discountAmount + taxAmount.
  IntColumn get lineTotal => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Data class for LocalSaleItems rows.
class LocalSaleItem {
  const LocalSaleItem({
    required this.id,
    required this.saleId,
    required this.productId,
    required this.productNameSnapshot,
    required this.unitPrice,
    required this.qty,
    required this.refundedQty,
    required this.discountAmount,
    required this.taxAmount,
    required this.lineTotal,
  });

  final String id;
  final String saleId;
  final String productId;
  final String productNameSnapshot;
  final int unitPrice;
  final int qty;
  final int refundedQty;
  final int discountAmount;
  final int taxAmount;
  final int lineTotal;

  /// Net quantity after refunds.
  int get netQty => qty - refundedQty;

  /// Whether this item has been fully refunded.
  bool get isFullyRefunded => refundedQty >= qty;

  /// Whether this item can be refunded (has remaining qty).
  bool get canRefund => refundedQty < qty;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalSaleItem &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          saleId == other.saleId &&
          productId == other.productId &&
          productNameSnapshot == other.productNameSnapshot &&
          unitPrice == other.unitPrice &&
          qty == other.qty &&
          refundedQty == other.refundedQty &&
          discountAmount == other.discountAmount &&
          taxAmount == other.taxAmount &&
          lineTotal == other.lineTotal);

  @override
  int get hashCode => Object.hash(
        id,
        saleId,
        productId,
        productNameSnapshot,
        unitPrice,
        qty,
        refundedQty,
        discountAmount,
        taxAmount,
        lineTotal,
      );

  @override
  String toString() =>
      'LocalSaleItem(id: $id, sale: $saleId, product: $productNameSnapshot, qty: $qty, price: $unitPrice)';
}