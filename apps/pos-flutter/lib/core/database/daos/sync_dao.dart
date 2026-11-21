/// DAO for sync outbox table.

import '../app_database.dart';
import '../tables/sync_outbox.dart';

/// Data access object for SyncOutbox.
class SyncDao {
  SyncDao(this._db);

  final AppDatabase _db;

  /// Inserts a new outbox entry.
  Future<int> insertOutboxEntry(SyncOutboxEntry entry) async {
    return _db.insert('sync_outbox', {
      'entity_id': entry.entityId,
      'entity_type': entry.entityType,
      'operation': entry.operation.name,
      'payload': entry.payload,
      'status': entry.status.name.toUpperCase(),
      'retry_count': entry.retryCount,
      'last_error': entry.lastError,
      'created_at': entry.createdAt.millisecondsSinceEpoch,
      'last_attempt_at': entry.lastAttemptAt?.millisecondsSinceEpoch,
      'synced_at': entry.syncedAt?.millisecondsSinceEpoch,
    });
  }

  /// Gets pending outbox entries for processing (FIFO order).
  Future<List<SyncOutboxEntry>> getPendingEntries({int limit = 50}) async {
    final rows = _db.select('''
      SELECT * FROM sync_outbox 
      WHERE status = ?
      ORDER BY created_at ASC
      LIMIT ?
    ''', [SyncStatus.pending.name.toUpperCase(), limit]);
    return rows.map(_rowToEntry).toList();
  }

  /// Gets failed entries ready for retry.
  Future<List<SyncOutboxEntry>> getFailedEntriesForRetry({int limit = 50, int maxRetries = 3}) async {
    final rows = _db.select('''
      SELECT * FROM sync_outbox 
      WHERE status = ? AND retry_count < ?
      ORDER BY last_attempt_at ASC
      LIMIT ?
    ''', [SyncStatus.failed.name.toUpperCase(), maxRetries, limit]);
    return rows.map(_rowToEntry).toList();
  }

  /// Marks an entry as currently being attempted.
  Future<void> markAttempting(int id) async {
    _db.execute('''
      UPDATE sync_outbox 
      SET status = ?, last_attempt_at = ?, retry_count = retry_count + 1
      WHERE id = ?
    ''', [
      SyncStatus.pending.name.toUpperCase(),
      DateTime.now().toUtc().millisecondsSinceEpoch,
      id,
    ]);
  }

  /// Marks an entry as successfully synced.
  Future<void> markSynced(int id) async {
    _db.execute('''
      UPDATE sync_outbox 
      SET status = ?, synced_at = ?
      WHERE id = ?
    ''', [
      SyncStatus.synced.name.toUpperCase(),
      DateTime.now().toUtc().millisecondsSinceEpoch,
      id,
    ]);
  }

  /// Marks an entry as failed with error.
  Future<void> markFailed(int id, String error) async {
    _db.execute('''
      UPDATE sync_outbox 
      SET status = ?, last_error = ?, last_attempt_at = ?
      WHERE id = ?
    ''', [
      SyncStatus.failed.name.toUpperCase(),
      error,
      DateTime.now().toUtc().millisecondsSinceEpoch,
      id,
    ]);
  }

  /// Gets count of pending entries.
  Future<int> getPendingCount() async {
    final rows = _db.select('''
      SELECT COUNT(*) as count FROM sync_outbox WHERE status = ?
    ''', [SyncStatus.pending.name.toUpperCase()]);
    return rows.first['count'] as int;
  }

  /// Gets count of failed entries.
  Future<int> getFailedCount() async {
    final rows = _db.select('''
      SELECT COUNT(*) as count FROM sync_outbox WHERE status = ?
    ''', [SyncStatus.failed.name.toUpperCase()]);
    return rows.first['count'] as int;
  }

  /// Deletes old synced entries (cleanup).
  Future<int> deleteOldSyncedEntries({Duration olderThan = const Duration(days: 30)}) async {
    final cutoff = DateTime.now().toUtc().subtract(olderThan).millisecondsSinceEpoch;
    return _db.delete(
      'sync_outbox',
      'status = ? AND synced_at < ?',
      [SyncStatus.synced.name.toUpperCase(), cutoff],
    );
  }

  /// Gets an entry by entity ID and type.
  Future<SyncOutboxEntry?> getEntryByEntity(String entityType, String entityId) async {
    final rows = _db.select('''
      SELECT * FROM sync_outbox 
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    ''', [entityType, entityId]);
    if (rows.isEmpty) return null;
    return _rowToEntry(rows.first);
  }

  /// Resets a failed entry to pending for retry.
  Future<void> resetToPending(int id) async {
    _db.execute('''
      UPDATE sync_outbox 
      SET status = ?, last_error = NULL
      WHERE id = ?
    ''', [SyncStatus.pending.name.toUpperCase(), id]);
  }

  SyncOutboxEntry _rowToEntry(Map<String, Object?> row) {
    return SyncOutboxEntry(
      id: row['id'] as int,
      entityId: row['entity_id'] as String,
      entityType: row['entity_type'] as String,
      operation: _operationFromString(row['operation'] as String),
      payload: row['payload'] as String,
      status: _statusFromString(row['status'] as String),
      retryCount: row['retry_count'] as int,
      lastError: row['last_error'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
      lastAttemptAt: row['last_attempt_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(row['last_attempt_at'] as int)
          : null,
      syncedAt: row['synced_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(row['synced_at'] as int)
          : null,
    );
  }

  SyncOperationType _operationFromString(String value) {
    return SyncOperationType.values.firstWhere(
      (e) => e.name == value,
      orElse: () => SyncOperationType.createSale,
    );
  }

  SyncStatus _statusFromString(String value) {
    return SyncStatus.values.firstWhere(
      (e) => e.name.toUpperCase() == value.toUpperCase(),
      orElse: () => SyncStatus.pending,
    );
  }
}