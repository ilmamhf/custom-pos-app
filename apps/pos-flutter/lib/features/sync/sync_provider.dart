/// Sync engine: push outbox → pull delta.
///
/// Watches connectivity and drains pending + retryable outbox entries. The
/// server response is authoritative per entity: an outbox row is only marked
/// `SYNCED` when its own id appears in the matching success set. A per-entity
/// rejection is retained for retry instead of being silently discarded.

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../core/database/app_database.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_products.dart';
import '../../core/database/tables/sync_outbox.dart';
import '../auth/auth_provider.dart';
import '../shift/shift_provider.dart';

/// Current sync status for the UI badge.
class SyncStatusState {
  const SyncStatusState({
    this.isOnline = false,
    this.isSyncing = false,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.lastSyncedAt,
    this.lastError,
  });

  final bool isOnline;
  final bool isSyncing;
  final int pendingCount;
  final int failedCount;
  final DateTime? lastSyncedAt;
  final String? lastError;

  SyncStatusState copyWith({
    bool? isOnline,
    bool? isSyncing,
    int? pendingCount,
    int? failedCount,
    DateTime? lastSyncedAt,
    String? lastError,
    bool clearError = false,
  }) {
    return SyncStatusState(
      isOnline: isOnline ?? this.isOnline,
      isSyncing: isSyncing ?? this.isSyncing,
      pendingCount: pendingCount ?? this.pendingCount,
      failedCount: failedCount ?? this.failedCount,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      lastError: clearError ? null : (lastError ?? this.lastError),
    );
  }
}

/// Notifier that runs the sync loop.
class SyncNotifier extends StateNotifier<SyncStatusState> {
  SyncNotifier(this._db, this._dio, this._ref)
      : super(const SyncStatusState()) {
    _init();
  }

  /// Creates a test instance with default offline status.
  factory SyncNotifier.test() => SyncNotifier._test();

  SyncNotifier._test()
      : _db = null,
        _dio = null,
        _ref = null,
        super(const SyncStatusState(isOnline: false));

  final AppDatabase? _db;
  final Dio? _dio;
  final Ref? _ref;

  Timer? _timer;
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  bool _disposed = false;

  Future<void> _init() async {
    if (_db == null) return;

    await _refreshCounts();
    _connSub =
        Connectivity().onConnectivityChanged.listen(_onConnectivityChanged);
    final initial = await Connectivity().checkConnectivity();
    _onConnectivityChanged(initial);
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _maybeSync());
  }

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    final online = results.any((r) => r != ConnectivityResult.none);
    if (!mounted || _disposed) return;
    state = state.copyWith(isOnline: online, clearError: online);
    if (online) _maybeSync();
  }

  Future<void> _refreshCounts() async {
    if (!mounted || _disposed || _db == null) return;
    final pending = await _db.syncDao.getPendingCount();
    final failed = await _db.syncDao.getFailedCount();
    final lastSynced = await _db.syncDao.getLastSyncedAt();
    state = state.copyWith(
        pendingCount: pending, failedCount: failed, lastSyncedAt: lastSynced);
  }

  Future<void> _maybeSync() async {
    if (!state.isOnline ||
        state.isSyncing ||
        (state.pendingCount + state.failedCount) == 0 ||
        _db == null) return;
    await syncNow();
  }

  /// Manual trigger (e.g., pull-to-refresh).
  Future<void> syncNow() async {
    if (state.isSyncing || !state.isOnline || _db == null || _dio == null) {
      return;
    }
    final auth = _ref?.read(shiftAuthProvider);
    if (auth?.isDemo ?? false) return;
    state = state.copyWith(isSyncing: true, clearError: true);
    try {
      await _pushOutbox();
      await _pullDelta();
    } catch (e) {
      if (!mounted || _disposed) return;
      state = state.copyWith(isSyncing: false, lastError: e.toString());
      // Reflect the newly failed rows so the retry gate and badge are accurate.
      await _refreshCounts();
      return;
    }
    if (!mounted || _disposed) return;
    state = state.copyWith(isSyncing: false, clearError: true);
    await _refreshCounts();
  }

  Future<void> _pushOutbox() async {
    if (_db == null || _dio == null) return;
    final db = _db;
    final dio = _dio;

    while (true) {
      final entries = await db.syncDao.getRetryableEntries(limit: 10);
      if (entries.isEmpty) break;

      var progressed = false;
      for (final entry in entries) {
        await db.syncDao.markAttempting(entry.id);

        final payload = jsonDecode(entry.payload) as Map<String, dynamic>;
        final storeId = payload['storeId'] as String;
        if (storeId == demoStoreId) {
          await db.syncDao.deleteEntry(entry.id);
          continue;
        }

        try {
          final response = await dio.post(
            '/sync/push',
            data: payload,
            options: Options(headers: {
              'X-Store-Id': storeId,
              // Allows the retry interceptor to safely resend this request.
              'Idempotency-Key': '${entry.entityType}:${entry.entityId}',
            }),
          );

          if (response.statusCode != 200) {
            throw Exception('Push failed: ${response.statusCode}');
          }

          final data = response.data as Map<String, dynamic>;
          final syncedShifts =
              (data['syncedShiftIds'] as List?)?.cast<String>() ?? const [];
          final syncedSales =
              (data['syncedSaleIds'] as List?)?.cast<String>() ?? const [];
          final syncedRefunds =
              (data['syncedRefundIds'] as List?)?.cast<String>() ?? const [];

          await _markLocalSynced(syncedShifts, syncedSales);

          if (_isAcknowledged(entry, syncedShifts, syncedSales, syncedRefunds)) {
            await db.syncDao.markSynced(entry.id);
            progressed = true;
          } else {
            await db.syncDao.markFailed(
              entry.id,
              _failureReason(data, entry),
            );
          }
        } catch (e) {
          await db.syncDao.markFailed(entry.id, e.toString());
          // Transport/server failure: stop this pass and retry later.
          rethrow;
        }
      }

      // Nothing was acknowledged: avoid spinning forever on terminal rejects.
      if (!progressed) break;
    }
  }

  bool _isAcknowledged(
    SyncOutboxEntry entry,
    List<String> shiftIds,
    List<String> saleIds,
    List<String> refundIds,
  ) {
    switch (entry.entityType) {
      case 'shift':
        return shiftIds.contains(entry.entityId);
      case 'sale':
        return saleIds.contains(entry.entityId);
      case 'refund':
        return refundIds.contains(entry.entityId);
      default:
        return false;
    }
  }

  String _failureReason(Map<String, dynamic> data, SyncOutboxEntry entry) {
    final failures = data['failed'] as List? ?? const [];
    for (final failure in failures) {
      if (failure is Map && failure['id'] == entry.entityId) {
        return (failure['error'] as String?) ?? 'Server rejected this item';
      }
    }
    return 'Server did not acknowledge this item';
  }

  Future<void> _markLocalSynced(
      List<String> shiftIds, List<String> saleIds) async {
    if (_db == null) return;
    final db = _db;
    final now = DateTime.now().toUtc();
    for (final id in shiftIds) {
      await db.shiftsDao.updateLastSynced(id, now);
    }
    for (final id in saleIds) {
      await db.salesDao.updateLastSynced(id, now);
    }
  }

  Future<void> _pullDelta() async {
    if (_db == null || _dio == null || _ref == null) return;
    final db = _db;
    final dio = _dio;
    final ref = _ref;

    final storeId = ref.read(activeStoreIdProvider);
    final cursor = await db.syncDao.getCursor(storeId) ?? state.lastSyncedAt;

    final queryParams = <String, String>{'storeId': storeId};
    if (cursor != null) {
      queryParams['since'] = cursor.toUtc().toIso8601String();
    }

    final response = await dio.get('/sync/pull', queryParameters: queryParams);
    if (response.statusCode != 200) return;

    final data = response.data as Map<String, dynamic>;
    final productsJson = data['products'] as List? ?? const [];

    if (productsJson.isNotEmpty) {
      // Preserve local stock decrements from sales the server has not yet
      // acknowledged instead of overwriting them with authoritative stock.
      final pendingDelta = await db.salesDao.getPendingStockDelta(storeId);

      final products = productsJson.map((p) {
        final id = p['id'] as String;
        final serverStock = p['stockOnHand'] as int;
        final localDelta = pendingDelta[id] ?? 0;
        return LocalProduct(
          storeId: storeId,
          id: id,
          sku: p['sku'] as String,
          barcode: p['barcode'] as String?,
          name: p['name'] as String,
          effectivePrice: p['effectivePrice'] as int,
          stockOnHand: serverStock - localDelta,
          isActive: p['isActive'] as bool,
          updatedAt: DateTime.parse(p['updatedAt'] as String),
          lastSyncedAt: DateTime.now().toUtc(),
        );
      }).toList();

      await db.productsDao.upsertProducts(products);
    }

    // Persist a durable per-store cursor so deltas survive restarts.
    final serverTime = data['serverTime'];
    if (serverTime != null) {
      await db.syncDao.setCursor(storeId, DateTime.parse(serverTime as String));
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _connSub?.cancel();
    super.dispose();
  }
}

/// Provider for the sync notifier.
final syncProvider =
    StateNotifierProvider<SyncNotifier, SyncStatusState>((ref) {
  final db = ref.watch(databaseProvider);
  final dio = ref.watch(dioProvider);
  return SyncNotifier(db, dio, ref);
});

/// Exposes just the status for the app-bar badge.
final syncStatusProvider =
    Provider<SyncStatusState>((ref) => ref.watch(syncProvider));
