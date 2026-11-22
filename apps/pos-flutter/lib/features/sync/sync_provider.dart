/// Sync engine: push outbox → pull delta.
///
/// Watches connectivity and drains the outbox FIFO. On success marks entries
/// `SYNCED`, on failure `FAILED` with retry count. After a successful push,
/// pulls server changes since the last sync timestamp.

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../core/database/app_database.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_products.dart';
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
  SyncNotifier(this._db, this._dio, this._ref) : super(const SyncStatusState()) {
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
    // Skip initialization in test mode (when _db is null)
    if (_db == null) return;

    await _refreshCounts();
    _connSub = Connectivity().onConnectivityChanged.listen(_onConnectivityChanged);
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
    state = state.copyWith(pendingCount: pending, failedCount: failed, lastSyncedAt: lastSynced);
  }

  Future<void> _maybeSync() async {
    if (!state.isOnline || state.isSyncing || state.pendingCount == 0 || _db == null) return;
    await syncNow();
  }

  /// Manual trigger (e.g., pull-to-refresh).
  Future<void> syncNow() async {
    if (state.isSyncing || !state.isOnline || _db == null || _dio == null) return;
    state = state.copyWith(isSyncing: true, clearError: true);
    try {
      await _pushOutbox();
      await _pullDelta();
    } catch (e) {
      if (!mounted || _disposed) return;
      state = state.copyWith(isSyncing: false, lastError: e.toString());
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
      final entries = await db.syncDao.getPendingEntries(limit: 10);
      if (entries.isEmpty) break;

      for (final entry in entries) {
        await db.syncDao.markAttempting(entry.id);
        try {
          final payload = jsonDecode(entry.payload) as Map<String, dynamic>;
          final storeId = payload['storeId'] as String;
          final response = await dio.post('/sync/push', data: payload, options: Options(headers: {'X-Store-Id': storeId}));
          if (response.statusCode == 200) {
            final data = response.data as Map<String, dynamic>;
            final syncedShifts = (data['syncedShiftIds'] as List?)?.cast<String>() ?? const [];
            final syncedSales = (data['syncedSaleIds'] as List?)?.cast<String>() ?? const [];
            await _markLocalSynced(syncedShifts, syncedSales);
            await db.syncDao.markSynced(entry.id);
          } else {
            throw Exception('Push failed: ${response.statusCode}');
          }
        } catch (e) {
          await db.syncDao.markFailed(entry.id, e.toString());
          rethrow;
        }
      }
    }
  }

  Future<void> _markLocalSynced(List<String> shiftIds, List<String> saleIds) async {
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
    final dio = _dio;
    final ref = _ref;
    final auth = ref.read(shiftAuthProvider);
    final store = auth.selectedStore;
    if (store == null) return;

    final lastSync = state.lastSyncedAt;
    final queryParams = {'storeId': store.id};
    if (lastSync != null) {
      queryParams['since'] = lastSync.toUtc().toIso8601String();
    }

    final response = await dio.get('/sync/pull', queryParameters: queryParams);
    if (response.statusCode != 200) return;

    final data = response.data as Map<String, dynamic>;
    final productsJson = data['products'] as List? ?? const [];
    if (productsJson.isNotEmpty) {
      final products = productsJson
          .map((p) => LocalProduct(
                id: p['id'] as String,
                sku: p['sku'] as String,
                barcode: p['barcode'] as String?,
                name: p['name'] as String,
                effectivePrice: p['effectivePrice'] as int,
                stockOnHand: p['stockOnHand'] as int,
                isActive: p['isActive'] as bool,
                updatedAt: DateTime.parse(p['updatedAt'] as String),
                lastSyncedAt: DateTime.now().toUtc(),
              ))
          .toList();
      await _db.productsDao.upsertProducts(products);
    }

    // Server time can be used to update lastSyncedAt for the store context
    if (data['serverTime'] != null) {
      // final serverTime = DateTime.parse(data['serverTime'] as String);
      // Optionally store as a global last-pull timestamp
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
final syncProvider = StateNotifierProvider<SyncNotifier, SyncStatusState>((ref) {
  final db = ref.watch(databaseProvider);
  final dio = ref.watch(dioProvider);
  return SyncNotifier(db, dio, ref);
});

/// Exposes just the status for the app-bar badge.
final syncStatusProvider = Provider<SyncStatusState>((ref) => ref.watch(syncProvider));