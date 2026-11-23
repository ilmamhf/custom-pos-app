/// Local sale tenders table for tender breakdown per payment method.
/// Synced to server via POST /sync/push.

import 'package:drift/drift.dart';
import 'local_sales.dart';

/// Represents a tender record for a sale.
class LocalSaleTenders extends Table {
  /// Primary key - client-generated UUID.
  TextColumn get id => text().withLength(min: 36, max: 36)();

  /// Sale UUID this tender belongs to.
  TextColumn get saleId => text().withLength(min: 36, max: 36)();

  /// Payment method used for this tender.
  TextColumn get paymentMethod => text()();

  /// Amount tendered for this payment method (integer IDR).
  IntColumn get amount => integer()();

  /// Change given (for cash); defaults to 0.
  IntColumn get change => integer().withDefault(const Constant(0))();

  /// External payment reference (QRIS/Card).
  TextColumn get reference => text().nullable()();

  /// Tender creation timestamp (UTC).
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Data class for LocalSaleTenders rows.
class LocalSaleTender {
  const LocalSaleTender({
    required this.id,
    required this.saleId,
    required this.paymentMethod,
    required this.amount,
    required this.change,
    this.reference,
    required this.createdAt,
  });

  final String id;
  final String saleId;
  final PaymentMethod paymentMethod;
  final int amount;
  final int change;
  final String? reference;
  final DateTime createdAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalSaleTender &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          saleId == other.saleId &&
          paymentMethod == other.paymentMethod &&
          amount == other.amount &&
          change == other.change &&
          reference == other.reference &&
          createdAt == other.createdAt);

  @override
  int get hashCode => Object.hash(
        id,
        saleId,
        paymentMethod,
        amount,
        change,
        reference,
        createdAt,
      );

  @override
  String toString() =>
      'LocalSaleTender(id: $id, saleId: $saleId, method: $paymentMethod, amount: $amount, change: $change, reference: $reference)';
}