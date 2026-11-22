/// GoRouter configuration with auth and shift guards.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/store_selector.dart';
import '../../features/auth/auth_provider.dart';
import '../../features/pos/pos_screen.dart';
import '../../features/receipts/refund_screen.dart';
import '../../features/shift/shift_screen.dart';
import '../../features/shift/shift_provider.dart';

/// Pure route-guard decision, kept separate so it can be unit tested.
///
/// Order matters: authentication first, then store selection, then an open
/// shift. Once all three are satisfied the POS is the only sensible place to be.
String? resolveRedirect({
  required bool isLoggedIn,
  required bool hasStore,
  required bool hasOpenShift,
  required String location,
}) {
  if (!isLoggedIn) {
    return location == '/login' ? null : '/login';
  }
  if (!hasStore) {
    return location == '/store-selector' ? null : '/store-selector';
  }
  if (!hasOpenShift) {
    return location == '/shift' ? null : '/shift';
  }
  if (location == '/login' ||
      location == '/store-selector' ||
      location == '/shift') {
    return '/pos';
  }
  return null;
}

/// Notifies GoRouter when auth or shift state changes without rebuilding it.
class _RouterRefresh extends ChangeNotifier {
  void refresh() => notifyListeners();
}

/// GoRouter provider with auth and shift guards.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh();
  ref.onDispose(refresh.dispose);
  ref.listen(authProvider, (_, __) => refresh.refresh());
  ref.listen(shiftProvider, (_, __) => refresh.refresh());

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (context, state) {
      final authState = ref.read(authProvider);
      final shiftState = ref.read(shiftProvider);
      return resolveRedirect(
        isLoggedIn: authState.isLoggedIn,
        hasStore: authState.hasSelectedStore,
        hasOpenShift: shiftState.isOpen,
        location: state.matchedLocation,
      );
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/store-selector',
        builder: (context, state) => const StoreSelectorScreen(),
      ),
      GoRoute(
        path: '/shift',
        builder: (context, state) => const ShiftScreen(),
      ),
      GoRoute(
        path: '/pos',
        builder: (context, state) => const PosScreen(),
      ),
      GoRoute(
        path: '/refund/:saleId',
        builder: (context, state) => RefundScreen(saleId: state.pathParameters['saleId']!),
      ),
    ],
  );
});


