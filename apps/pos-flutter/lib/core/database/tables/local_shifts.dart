/// Local shifts table for cash drawer tracking.
/// Synced to server via POST /sync/push.

import 'package:drift/drift.dart';

/// Represents a cashier shift (cash drawer session).
class LocalShifts extends Table {
  /// Primary key - client-generated UUID.
  TextColumn get id => text().withLength(min: 36, max: 36)();

  /// Store UUID this shift belongs to.
  TextColumn get storeId => text().withLength(min: 36, max: 36)();

  /// Cashier user UUID.
  TextColumn get userId => text().withLength(min: 36, max: 36)();

  /// Shift opened timestamp (UTC).
  DateTimeColumn get openedAt => dateTime()();

  /// Shift closed timestamp (UTC), null if still open.
  DateTimeColumn get closedAt => dateTime().nullable()();

  /// Opening cash amount (integer IDR).
  IntColumn get openingCash => integer()();

  /// Expected cash calculated on close (opening + cash sales - cash refunds).
  IntColumn get expectedCash => integer().nullable()();

  /// Actual cash entered by cashier on close.
  IntColumn get actualCash => integer().nullable()();

  /// Variance (actual - expected), calculated on close.
  IntColumn get variance => integer().nullable()();

  /// Local last synced timestamp.
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Data class for LocalShifts rows.
class LocalShift {
  const LocalShift({
    required this.id,
    required this.storeId,
    required this.userId,
    required this.openedAt,
    this.closedAt,
    required this.openingCash,
    this.expectedCash,
    this.actualCash,
    this.variance,
    this.lastSyncedAt,
  });

  final String id;
  final String storeId;
  final String userId;
  final DateTime openedAt;
  final DateTime? closedAt;
  final int openingCash;
  final int? expectedCash;
  final int? actualCash;
  final int? variance;
  final DateTime? lastSyncedAt;

  /// Whether the shift is currently open.
  bool get isOpen => closedAt == null;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalShift &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          storeId == other.storeId &&
          userId == other.userId &&
          openedAt == other.openedAt &&
          closedAt == other.closedAt &&
          openingCash == other.openingCash &&
          expectedCash == other.expectedCash &&
          actualCash == other.actualCash &&
          variance == other.variance &&
          lastSyncedAt == other.lastSyncedAt);

  @override
  int get hashCode => Object.hash(
        id,
        storeId,
        userId,
        openedAt,
        closedAt,
        openingCash,
        expectedCash,
        actualCash,
        variance,
        lastSyncedAt,
      );

  @override
  String toString() =>
      'LocalShift(id: $id, store: $storeId, user: $userId, open: $isOpen, openingCash: $openingCash)';
}