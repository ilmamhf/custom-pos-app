import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/features/auth/auth_provider.dart';

void main() {
  group('User.fromJson', () {
    test('parses contract payload without email', () {
      final user = User.fromJson({
        'id': 'user-1',
        'name': 'Budi',
        'role': 'CASHIER',
      });

      expect(user.id, 'user-1');
      expect(user.name, 'Budi');
      expect(user.role, 'CASHIER');
      expect(user.email, isNull);
    });
  });

  group('UserStore.fromJson', () {
    test('parses tax rate basis points', () {
      final store = UserStore.fromJson({
        'id': 'store-1',
        'name': 'Cabang Bekasi',
        'code': 'BKS',
        'taxRateBps': 1100,
      });

      expect(store.taxRateBps, 1100);
      expect(store.code, 'BKS');
    });

    test('defaults missing tax rate to zero', () {
      final store = UserStore.fromJson({
        'id': 'store-1',
        'name': 'Cabang Bekasi',
        'code': 'BKS',
      });

      expect(store.taxRateBps, 0);
    });
  });

  group('AuthState', () {
    test('starts logged out with no store', () {
      const state = AuthState();

      expect(state.isLoggedIn, isFalse);
      expect(state.hasSelectedStore, isFalse);
      expect(state.stores, isEmpty);
    });

    test('copyWith updates user and store independently', () {
      const user = User(id: 'u1', name: 'Budi', role: 'CASHIER');
      const store = UserStore(
        id: 's1',
        name: 'Store',
        code: 'STR',
        taxRateBps: 1100,
      );

      final state = const AuthState().copyWith(user: user).copyWith(
            selectedStore: store,
          );

      expect(state.isLoggedIn, isTrue);
      expect(state.hasSelectedStore, isTrue);
      expect(state.selectedStore, store);
    });

    test('clearStore removes the selected store', () {
      const store = UserStore(
        id: 's1',
        name: 'Store',
        code: 'STR',
        taxRateBps: 0,
      );

      final state = const AuthState(selectedStore: store)
          .copyWith(clearStore: true);

      expect(state.selectedStore, isNull);
    });

    test('clearError clears a previous error', () {
      final state = const AuthState(error: 'bad credentials')
          .copyWith(clearError: true);

      expect(state.error, isNull);
    });

    test('copyWith keeps the previous error unless cleared', () {
      final state = const AuthState(error: 'bad credentials')
          .copyWith(isLoading: true);

      expect(state.error, 'bad credentials');
      expect(state.isLoading, isTrue);
    });
  });
}
