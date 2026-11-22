import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/tables/local_shifts.dart';
import 'package:pos_flutter/features/shift/shift_provider.dart';

void main() {
  group('ShiftState', () {
    test('empty state is not an open shift', () {
      const state = ShiftState();

      expect(state.isOpen, isFalse);
      expect(state.currentShift, isNull);
    });

    test('shift with id and no closedAt is open', () {
      final state = ShiftState(
        id: 'shift-1',
        storeId: 'store-1',
        userId: 'user-1',
        openedAt: DateTime.utc(2026, 11, 22, 8),
        openingCash: 500000,
      );

      expect(state.isOpen, isTrue);
      expect(state.currentShift, state);
    });

    test('closed shift is not open', () {
      final state = ShiftState(
        id: 'shift-1',
        closedAt: DateTime.utc(2026, 11, 22, 17),
        openingCash: 500000,
      );

      expect(state.isOpen, isFalse);
      expect(state.currentShift, isNull);
    });

    test('fromShift maps every field', () {
      final shift = LocalShift(
        id: 'shift-1',
        storeId: 'store-1',
        userId: 'user-1',
        openedAt: DateTime.utc(2026, 11, 22, 8),
        openingCash: 500000,
        expectedCash: 1250000,
        actualCash: 1240000,
        variance: -10000,
      );

      final state = ShiftState.fromShift(shift);

      expect(state.id, 'shift-1');
      expect(state.storeId, 'store-1');
      expect(state.userId, 'user-1');
      expect(state.openingCash, 500000);
      expect(state.expectedCash, 1250000);
      expect(state.actualCash, 1240000);
      expect(state.variance, -10000);
      expect(state.isOpen, isTrue);
    });

    test('copyWith can clear an error', () {
      final state = const ShiftState(error: 'boom').copyWith(clearError: true);

      expect(state.error, isNull);
    });

    test('copyWith keeps error when not cleared', () {
      final state = const ShiftState(error: 'boom').copyWith(isLoading: true);

      expect(state.error, 'boom');
      expect(state.isLoading, isTrue);
    });
  });
}
