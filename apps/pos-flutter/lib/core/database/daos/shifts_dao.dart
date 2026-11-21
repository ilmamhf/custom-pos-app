/// DAO for local shifts table.

import '../app_database.dart';
import '../tables/local_shifts.dart';

/// Data access object for LocalShifts.
class ShiftsDao {
  ShiftsDao(this._db);

  final AppDatabase _db;

  /// Inserts a new shift.
  Future<void> insertShift(LocalShift shift) async {
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
  Future<List<LocalShift>> getShiftsForStore(String storeId, {int limit = 50}) async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE store_id = ?
      ORDER BY opened_at DESC
      LIMIT ?
    ''', [storeId, limit]);
    return rows.map(_rowToShift).toList();
  }

  /// Gets all shifts for a user across stores.
  Future<List<LocalShift>> getShiftsForUser(String userId, {int limit = 50}) async {
    final rows = _db.select('''
      SELECT * FROM local_shifts 
      WHERE user_id = ?
      ORDER BY opened_at DESC
      LIMIT ?
    ''', [userId, limit]);
    return rows.map(_rowToShift).toList();
  }

  /// Closes a shift with actual cash and calculated variance.
  Future<void> closeShift({
    required String shiftId,
    required DateTime closedAt,
    required int expectedCash,
    required int actualCash,
    required int variance,
  }) async {
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