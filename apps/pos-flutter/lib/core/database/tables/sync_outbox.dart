/// Sync outbox table for offline-first sync engine.
/// Stores pending changes to be pushed to server via POST /sync/push.

import 'package:drift/drift.dart';

/// Sync operation types.
enum SyncOperationType {
  createShift,
  updateShift,
  createSale,
  // Future: updateSale, createRefund, etc.
}

/// Sync status enum.
enum SyncStatus { pending, synced, failed }

/// Represents a pending sync operation in the outbox.
class SyncOutbox extends Table {
  /// Primary key - auto-incrementing ID for FIFO ordering.
  IntColumn get id => integer().autoIncrement()();

  /// Client-generated UUID for the entity (shift, sale, etc.).
  TextColumn get entityId => text().withLength(min: 36, max: 36)();

  /// Type of entity being synced.
  TextColumn get entityType => text()();

  /// Operation type (create, update, etc.).
  TextColumn get operation => text()();

  /// JSON payload for the sync push request.
  TextColumn get payload => text()();

  /// Current sync status.
  TextColumn get status => text().withDefault(const Constant('PENDING'))();

  /// Number of retry attempts.
  IntColumn get retryCount => integer().withDefault(const Constant(0))();

  /// Last error message if failed.
  TextColumn get lastError => text().nullable()();

  /// Created timestamp.
  DateTimeColumn get createdAt => dateTime()();

  /// Last attempted timestamp.
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  /// Successfully synced timestamp.
  DateTimeColumn get syncedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Data class for SyncOutbox rows.
class SyncOutboxEntry {
  const SyncOutboxEntry({
    required this.id,
    required this.entityId,
    required this.entityType,
    required this.operation,
    required this.payload,
    required this.status,
    required this.retryCount,
    this.lastError,
    required this.createdAt,
    this.lastAttemptAt,
    this.syncedAt,
  });

  final int id;
  final String entityId;
  final String entityType;
  final SyncOperationType operation;
  final String payload;
  final SyncStatus status;
  final int retryCount;
  final String? lastError;
  final DateTime createdAt;
  final DateTime? lastAttemptAt;
  final DateTime? syncedAt;

  /// Whether this entry is ready for retry (pending or failed with retries left).
  bool get isReadyForRetry => status == SyncStatus.pending || (status == SyncStatus.failed && retryCount < 3);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncOutboxEntry &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          entityId == other.entityId &&
          entityType == other.entityType &&
          operation == other.operation &&
          payload == other.payload &&
          status == other.status &&
          retryCount == other.retryCount &&
          lastError == other.lastError &&
          createdAt == other.createdAt &&
          lastAttemptAt == other.lastAttemptAt &&
          syncedAt == other.syncedAt);

  @override
  int get hashCode => Object.hash(
        id,
        entityId,
        entityType,
        operation,
        payload,
        status,
        retryCount,
        lastError,
        createdAt,
        lastAttemptAt,
        syncedAt,
      );

  @override
  String toString() =>
      'SyncOutboxEntry(id: $id, entity: $entityType/$entityId, status: $status, retries: $retryCount)';
}