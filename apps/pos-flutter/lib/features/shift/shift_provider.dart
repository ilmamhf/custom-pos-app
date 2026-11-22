/// Shift state management with Riverpod.
///
/// Shifts are written to the local database first (offline-first) and queued in
/// the sync outbox. The POS is reachable only while an open shift exists for the
/// active store and cashier.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/database/app_database.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_shifts.dart';
import '../../core/utils/uuid_helper.dart';
import '../../features/auth/auth_provider.dart';

/// Current shift data.
class ShiftState {
  const ShiftState({
    this.id,
    this.storeId,
    this.userId,
    this.openedAt,
    this.closedAt,
    this.openingCash,
    this.expectedCash,
    this.actualCash,
    this.variance,
    this.isLoading = false,
    this.isClosing = false,
    this.error,
  });

  factory ShiftState.fromShift(LocalShift shift) {
    return ShiftState(
      id: shift.id,
      storeId: shift.storeId,
      userId: shift.userId,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingCash: shift.openingCash,
      expectedCash: shift.expectedCash,
      actualCash: shift.actualCash,
      variance: shift.variance,
    );
  }

  final String? id;
  final String? storeId;
  final String? userId;
  final DateTime? openedAt;
  final DateTime? closedAt;
  final int? openingCash;
  final int? expectedCash;
  final int? actualCash;
  final int? variance;
  final bool isLoading;
  final bool isClosing;
  final String? error;

  ShiftState copyWith({
    String? id,
    String? storeId,
    String? userId,
    DateTime? openedAt,
    DateTime? closedAt,
    int? openingCash,
    int? expectedCash,
    int? actualCash,
    int? variance,
    bool? isLoading,
    bool? isClosing,
    String? error,
    bool clearError = false,
  }) {
    return ShiftState(
      id: id ?? this.id,
      storeId: storeId ?? this.storeId,
      userId: userId ?? this.userId,
      openedAt: openedAt ?? this.openedAt,
      closedAt: closedAt ?? this.closedAt,
      openingCash: openingCash ?? this.openingCash,
      expectedCash: expectedCash ?? this.expectedCash,
      actualCash: actualCash ?? this.actualCash,
      variance: variance ?? this.variance,
      isLoading: isLoading ?? this.isLoading,
      isClosing: isClosing ?? this.isClosing,
      error: clearError ? null : (error ?? this.error),
    );
  }

  /// True only when a shift row exists and it has not been closed.
  bool get isOpen => id != null && closedAt == null;

  /// Returns the current shift as ShiftState for convenience.
  ShiftState? get currentShift => isOpen ? this : null;
}

/// Shift notifier for managing shift state.
class ShiftNotifier extends StateNotifier<ShiftState> {
  ShiftNotifier(this._db, this._ref) : super(const ShiftState()) {
    _loadCurrentShift();
  }

  final AppDatabase _db;
  final Ref _ref;

  /// Guards against an in-flight load overwriting a newer shift action.
  int _loadToken = 0;

  /// Loads the open shift for the selected store and cashier, including the
  /// expected drawer cash derived from local cash sales.
  Future<void> _loadCurrentShift() async {
    final token = ++_loadToken;
    final authState = _ref.read(shiftAuthProvider);
    final store = authState.selectedStore;
    final user = authState.user;
    if (store == null || user == null) return;

    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final shift = await _db.shiftsDao.getOpenShift(store.id, user.id);
      if (!mounted || token != _loadToken) return;
      if (shift == null) {
        state = const ShiftState();
        return;
      }
      final cashSales = await _db.salesDao.getCashTotalForShift(shift.id);
      if (!mounted || token != _loadToken) return;
      state = ShiftState.fromShift(shift).copyWith(
        expectedCash: shift.openingCash + cashSales,
        isLoading: false,
      );
    } catch (e) {
      if (!mounted || token != _loadToken) return;
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Re-reads the local shift (used after a sync pull or a sale).
  Future<void> refresh() => _loadCurrentShift();

  /// Opens a new shift locally and optionally queues it for sync.
  ///
  /// Browser demo sessions pass [syncToServer] as false so sample records stay
  /// local even after the page is reloaded.
  Future<void> openShift(int openingCash, {bool syncToServer = true}) async {
    _loadToken++;
    final authState = _ref.read(shiftAuthProvider);
    final store = authState.selectedStore;
    final user = authState.user;
    if (store == null || user == null) {
      state = state.copyWith(error: 'Select a store before opening a shift');
      return;
    }
    if (openingCash < 0) {
      state = state.copyWith(error: 'Opening cash cannot be negative');
      return;
    }

    state = state.copyWith(isLoading: true, clearError: true);
    _loadToken++;
    try {
      final shift = LocalShift(
        id: generateUuid(),
        storeId: store.id,
        userId: user.id,
        openedAt: DateTime.now().toUtc(),
        openingCash: openingCash,
      );
      await _db.shiftsDao.openShift(
        shift,
        syncToServer: syncToServer,
      );
      if (!mounted) return;
      state = ShiftState.fromShift(shift).copyWith(
        expectedCash: openingCash,
        isLoading: false,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Closes the current shift, computing expected cash and variance locally.
  Future<void> closeShift({
    required int actualCash,
    bool syncToServer = true,
  }) async {
    _loadToken++;
    final shiftId = state.id;
    if (shiftId == null || !state.isOpen) return;
    if (actualCash < 0) {
      state = state.copyWith(error: 'Actual cash cannot be negative');
      return;
    }

    state = state.copyWith(isClosing: true, clearError: true);
    _loadToken++;
    try {
      final openingCash = state.openingCash ?? 0;
      final cashSales = await _db.salesDao.getCashTotalForShift(shiftId);
      final expectedCash = openingCash + cashSales;
      final variance = actualCash - expectedCash;
      final closedAt = DateTime.now().toUtc();

      await _db.shiftsDao.closeShift(
        shiftId: shiftId,
        closedAt: closedAt,
        expectedCash: expectedCash,
        actualCash: actualCash,
        variance: variance,
        syncToServer: syncToServer,
      );

      if (!mounted) return;
      state = state.copyWith(
        closedAt: closedAt,
        expectedCash: expectedCash,
        actualCash: actualCash,
        variance: variance,
        isClosing: false,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isClosing: false, error: e.toString());
    }
  }

  /// Clears error.
  void clearError() {
    state = state.copyWith(clearError: true);
  }
}

/// Auth identity used by shift logic. Overridden in tests to avoid network.
final shiftAuthProvider = Provider<AuthState>((ref) => ref.watch(authProvider));

/// Provider for ShiftNotifier.
///
/// Rebuilt whenever the signed-in store or user changes so the matching open
/// shift is loaded.
final shiftProvider = StateNotifierProvider<ShiftNotifier, ShiftState>((ref) {
  final db = ref.watch(databaseProvider);
  ref.watch(shiftAuthProvider.select((s) => s.selectedStore?.id));
  ref.watch(shiftAuthProvider.select((s) => s.user?.id));
  return ShiftNotifier(db, ref);
});
