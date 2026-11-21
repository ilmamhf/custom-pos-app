/// Local sales table for completed transactions.
/// Synced to server via POST /sync/push.

import 'package:drift/drift.dart';

/// Payment method enum.
enum PaymentMethod { cash, qris, card, split }

/// Sale status enum.
enum SaleStatus { completed, partiallyRefunded, refunded }

/// Represents a completed sale transaction.
class LocalSales extends Table {
  /// Primary key - client-generated UUID (idempotency key for sync).
  TextColumn get id => text().withLength(min: 36, max: 36)();

  /// Store UUID.
  TextColumn get storeId => text().withLength(min: 36, max: 36)();

  /// Shift UUID this sale belongs to.
  TextColumn get shiftId => text().withLength(min: 36, max: 36)();

  /// Cashier user UUID.
  TextColumn get cashierId => text().withLength(min: 36, max: 36)();

  /// Human-readable receipt number (e.g., BKS-20261121-0042).
  TextColumn get receiptNo => text().withLength(min: 1, max: 40)();

  /// Subtotal before tax and discounts (integer IDR).
  IntColumn get subtotal => integer()();

  /// Total tax amount (integer IDR).
  IntColumn get taxTotal => integer()();

  /// Total discount amount (integer IDR).
  IntColumn get discountTotal => integer()();

  /// Grand total = subtotal + taxTotal - discountTotal (integer IDR).
  IntColumn get grandTotal => integer()();

  /// Payment method used.
  TextColumn get paymentMethod => text()();

  /// Sale status.
  TextColumn get status => text().withDefault(const Constant('COMPLETED'))();

  /// Sale creation timestamp (UTC).
  DateTimeColumn get createdAt => dateTime()();

  /// Local last synced timestamp.
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<String> get customConstraints => [
        'UNIQUE(receipt_no)',
      ];
}

/// Data class for LocalSales rows.
class LocalSale {
  const LocalSale({
    required this.id,
    required this.storeId,
    required this.shiftId,
    required this.cashierId,
    required this.receiptNo,
    required this.subtotal,
    required this.taxTotal,
    required this.discountTotal,
    required this.grandTotal,
    required this.paymentMethod,
    required this.status,
    required this.createdAt,
    this.lastSyncedAt,
  });

  final String id;
  final String storeId;
  final String shiftId;
  final String cashierId;
  final String receiptNo;
  final int subtotal;
  final int taxTotal;
  final int discountTotal;
  final int grandTotal;
  final PaymentMethod paymentMethod;
  final SaleStatus status;
  final DateTime createdAt;
  final DateTime? lastSyncedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalSale &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          storeId == other.storeId &&
          shiftId == other.shiftId &&
          cashierId == other.cashierId &&
          receiptNo == other.receiptNo &&
          subtotal == other.subtotal &&
          taxTotal == other.taxTotal &&
          discountTotal == other.discountTotal &&
          grandTotal == other.grandTotal &&
          paymentMethod == other.paymentMethod &&
          status == other.status &&
          createdAt == other.createdAt &&
          lastSyncedAt == other.lastSyncedAt);

  @override
  int get hashCode => Object.hash(
        id,
        storeId,
        shiftId,
        cashierId,
        receiptNo,
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        paymentMethod,
        status,
        createdAt,
        lastSyncedAt,
      );

  @override
  String toString() =>
      'LocalSale(id: $id, receipt: $receiptNo, total: $grandTotal, method: $paymentMethod)';
}