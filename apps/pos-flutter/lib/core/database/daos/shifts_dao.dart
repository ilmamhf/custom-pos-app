/// DAO for local shifts table.
///
/// Real-session writes are paired with a `sync_outbox` entry inside one
/// transaction so an opened/closed shift is never lost. Local-only demo
/// shifts deliberately omit that entry.

import 'dart:convert';
import '../app_database.dart';
import '../tables/local_shifts.dart';
import '../tables/sync_outbox.dart';

/// Data access object for LocalShifts.
class ShiftsDao {
  ShiftsDao(this._db);

  final AppDatabase _db;

  /// Inserts a new shift and optionally enqueues it for sync atomically.
  Future<void> openShift(
    LocalShift shift, {
    bool syncToServer = true,
  }) async {
    _db.transaction(() {
      _insert(shift);
      if (syncToServer) {
        _enqueue(shift, SyncOperationType.createShift);
      }
    });
    await _db.flush();
  }

  /// Inserts a new shift without enqueuing sync (used by delta pull).
  Future<void> insertShift(LocalShift shift) async {
    _insert(shift);
  }

  /// Gets a shift by ID.
  Future<LocalShift?> getShiftById(String id) async {
    final rows = _db.select('SELECT * FROM local_shifts WHERE id = ?', [id]);
    if (rows.isEmpty) return null;
    return _rowToShift(rows.first);
  }

  /// Gets the currently open shift for a store and user.
  Future<LocalShift?> getOpenShift(String storeId, String userId) async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE store_id = ? AND user_id = ? AND closed_at IS NULL
      ORDER BY opened_at DESC
      LIMIT 1
    ''', [storeId, userId]);
    if (rows.isEmpty) return null;
    return _rowToShift(rows.first);
  }

  /// Gets the currently open shift for a store (any user).
  Future<LocalShift?> getOpenShiftForStore(String storeId) async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE store_id = ? AND closed_at IS NULL
      ORDER BY opened_at DESC
      LIMIT 1
    ''', [storeId]);
    if (rows.isEmpty) return null;
    return _rowToShift(rows.first);
  }

  /// Gets all shifts for a store, ordered by opened_at desc.
  Future<List<LocalShift>> getShiftsForStore(String storeId,
      {int limit = 50}) async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE store_id = ?
      ORDER BY opened_at DESC
      LIMIT ?
    ''', [storeId, limit]);
    return rows.map(_rowToShift).toList();
  }

  /// Gets all shifts for a user across stores.
  Future<List<LocalShift>> getShiftsForUser(String userId,
      {int limit = 50}) async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE user_id = ?
      ORDER BY opened_at DESC
      LIMIT ?
    ''', [userId, limit]);
    return rows.map(_rowToShift).toList();
  }

  /// Closes a shift with actual cash and calculated variance, then optionally
  /// enqueues the updated shift for sync. Both writes share one transaction.
  Future<void> closeShift({
    required String shiftId,
    required DateTime closedAt,
    required int expectedCash,
    required int actualCash,
    required int variance,
    bool syncToServer = true,
  }) async {
    _db.transaction(() {
      _db.execute('''
        UPDATE local_shifts 
        SET closed_at = ?, expected_cash = ?, actual_cash = ?, variance = ?
        WHERE id = ?
      ''', [
        closedAt.millisecondsSinceEpoch,
        expectedCash,
        actualCash,
        variance,
        shiftId,
      ]);

      final rows =
          _db.select('SELECT * FROM local_shifts WHERE id = ?', [shiftId]);
      if (rows.isNotEmpty && syncToServer) {
        _enqueue(_rowToShift(rows.first), SyncOperationType.updateShift);
      }
    });
    await _db.flush();
  }

  /// Updates last synced timestamp for a shift.
  Future<void> updateLastSynced(String shiftId, DateTime timestamp) async {
    _db.execute('''
      UPDATE local_shifts 
      SET last_synced_at = ?
      WHERE id = ?
    ''', [timestamp.millisecondsSinceEpoch, shiftId]);
  }

  /// Gets unsynced shifts for push.
  Future<List<LocalShift>> getUnsyncedShifts() async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE last_synced_at IS NULL
    ''');
    return rows.map(_rowToShift).toList();
  }

  void _insert(LocalShift shift) {
    _db.execute('''
      INSERT INTO local_shifts 
      (id, store_id, user_id, opened_at, closed_at, opening_cash, expected_cash, actual_cash, variance, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', [
      shift.id,
      shift.storeId,
      shift.userId,
      shift.openedAt.millisecondsSinceEpoch,
      shift.closedAt?.millisecondsSinceEpoch,
      shift.openingCash,
      shift.expectedCash,
      shift.actualCash,
      shift.variance,
      shift.lastSyncedAt?.millisecondsSinceEpoch,
    ]);
  }

  void _enqueue(LocalShift shift, SyncOperationType operation) {
    _db.execute('''
      INSERT INTO sync_outbox 
      (entity_id, entity_type, operation, payload, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    ''', [
      shift.id,
      'shift',
      operation.name,
      buildShiftPushPayload(shift),
      SyncStatus.pending.name.toUpperCase(),
      DateTime.now().toUtc().millisecondsSinceEpoch,
    ]);
  }

  LocalShift _rowToShift(Map<String, Object?> row) {
    return LocalShift(
      id: row['id'] as String,
      storeId: row['store_id'] as String,
      userId: row['user_id'] as String,
      openedAt: DateTime.fromMillisecondsSinceEpoch(row['opened_at'] as int),
      closedAt: row['closed_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(row['closed_at'] as int)
          : null,
      openingCash: row['opening_cash'] as int,
      expectedCash: row['expected_cash'] as int?,
      actualCash: row['actual_cash'] as int?,
      variance: row['variance'] as int?,
      lastSyncedAt: row['last_synced_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(row['last_synced_at'] as int)
          : null,
    );
  }
}

/// Builds a `POST /sync/push` body carrying a single shift.
String buildShiftPushPayload(LocalShift shift) {
  return jsonEncode({
    'storeId': shift.storeId,
    'shifts': [
      {
        'id': shift.id,
        'userId': shift.userId,
        'openedAt': shift.openedAt.toUtc().toIso8601String(),
        'closedAt': shift.closedAt?.toUtc().toIso8601String(),
        'openingCash': shift.openingCash,
        'actualCash': shift.actualCash,
      }
    ],
    'sales': <Object>[],
  });
}
