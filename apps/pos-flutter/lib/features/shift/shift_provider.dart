/// Shift state management with Riverpod.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/network/dio_client.dart';
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
      error: error ?? this.error,
    );
  }

  bool get isOpen => closedAt == null;

  /// Returns the current shift as ShiftState for convenience.
  ShiftState? get currentShift => isOpen ? this : null;
}

/// Shift notifier for managing shift state.
class ShiftNotifier extends StateNotifier<ShiftState> {
  ShiftNotifier(this._dio, this._ref) : super(const ShiftState()) {
    _loadCurrentShift();
  }

  final Dio _dio;
  final Ref _ref;

  /// Loads current open shift for the selected store.
  Future<void> _loadCurrentShift() async {
    final authState = _ref.read(authProvider);
    final store = authState.selectedStore;
    final user = authState.user;
    if (store == null || user == null) return;

    state = state.copyWith(isLoading: true);
    try {
      final response = await _dio.get('/shifts/open', queryParameters: {
        'storeId': store.id,
        'userId': user.id,
      });

      if (response.statusCode == 200 && response.data != null) {
        final data = response.data as Map<String, dynamic>;
        state = state.copyWith(
          id: data['id'] as String,
          storeId: data['storeId'] as String,
          userId: data['userId'] as String,
          openedAt: DateTime.parse(data['openedAt'] as String),
          closedAt: data['closedAt'] != null
              ? DateTime.parse(data['closedAt'] as String)
              : null,
          openingCash: data['openingCash'] as int,
          expectedCash: data['expectedCash'] as int?,
          actualCash: data['actualCash'] as int?,
          variance: data['variance'] as int?,
          isLoading: false,
        );
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Opens a new shift.
  Future<void> openShift(int openingCash) async {
    final authState = _ref.read(authProvider);
    final store = authState.selectedStore;
    final user = authState.user;
    if (store == null || user == null) return;

    state = state.copyWith(isLoading: true);
    try {
      final shiftId = _generateShiftId();
      final response = await _dio.post('/shifts/open', data: {
        'id': shiftId,
        'storeId': store.id,
        'openingCash': openingCash,
      });

      if (response.statusCode == 201) {
        final data = response.data as Map<String, dynamic>;
        state = state.copyWith(
          id: data['id'] as String,
          storeId: store.id,
          userId: _ref.read(authProvider).user!.id,
          openedAt: DateTime.parse(data['openedAt'] as String),
          openingCash: data['openingCash'] as int,
          expectedCash: data['expectedCash'] as int?,
          actualCash: null,
          variance: null,
          isLoading: false,
        );
      } else {
        state = state.copyWith(
          isLoading: false,
          error: 'Failed to open shift',
        );
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Closes the current shift.
  Future<void> closeShift({required int actualCash}) async {
    if (state.id == null) return;

    state = state.copyWith(isClosing: true);
    try {
      final response = await _dio.post('/shifts/${state.id}/close', data: {
        'actualCash': actualCash,
      });

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        state = state.copyWith(
          closedAt: DateTime.parse(data['closedAt'] as String),
          expectedCash: data['expectedCash'] as int?,
          actualCash: data['actualCash'] as int?,
          variance: data['variance'] as int?,
          isClosing: false,
        );
      } else {
        state = state.copyWith(
          isClosing: false,
          error: 'Failed to close shift',
        );
      }
    } catch (e) {
      state = state.copyWith(isClosing: false, error: e.toString());
    }
  }

  /// Clears error.
  void clearError() {
    state = state.copyWith(error: null);
  }

  String _generateShiftId() {
    // Generate UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAllMapped(RegExp(r'[xy]'), (match) {
      final random = (DateTime.now().millisecondsSinceEpoch * 1000 + match.start) % 16;
      return match.group(0) == 'x' ? random.toRadixString(16) : (random & 0x3 | 0x8).toRadixString(16);
    });
  }
}

/// Provider for ShiftNotifier.
final shiftProvider = StateNotifierProvider<ShiftNotifier, ShiftState>((ref) {
  final dio = ref.watch(dioProvider);
  return ShiftNotifier(dio, ref);
});