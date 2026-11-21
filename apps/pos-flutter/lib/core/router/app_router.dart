/// GoRouter configuration with auth and shift guards.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/store_selector.dart';
import '../../features/auth/auth_provider.dart';
import '../../features/shift/shift_screen.dart';
import '../../features/shift/shift_provider.dart';

/// GoRouter provider with auth and shift guards.
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);
  final shiftState = ref.watch(shiftProvider);

  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoggedIn = authState.isLoggedIn;
      final hasStore = authState.hasSelectedStore;
      final hasOpenShift = shiftState.isOpen;
      final location = state.matchedLocation;

      // Not logged in - redirect to login
      if (!isLoggedIn) {
        if (location != '/login') {
          return '/login';
        }
        return null;
      }

      // Logged in but no store selected - redirect to store selector
      if (!hasStore) {
        if (location != '/store-selector') {
          return '/store-selector';
        }
        return null;
      }

      // Has store but no open shift - redirect to shift screen
      if (!hasOpenShift) {
        if (location != '/shift') {
          return '/shift';
        }
        return null;
      }

      // Has open shift - allow access to POS
      if (location == '/login' || location == '/store-selector' || location == '/shift') {
        return '/pos';
      }

      return null;
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
      // POS route - placeholder for Phase 4
      GoRoute(
        path: '/pos',
        builder: (context, state) => const _PosPlaceholderScreen(),
      ),
      // Refund route - placeholder for Phase 5
      GoRoute(
        path: '/refund/:saleId',
        builder: (context, state) => const _RefundPlaceholderScreen(),
      ),
    ],
  );
});

/// Placeholder POS screen (Phase 4).
class _PosPlaceholderScreen extends ConsumerWidget {
  const _PosPlaceholderScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final shiftState = ref.watch(shiftProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('POS Checkout'),
        actions: [
          IconButton(
            icon: const Icon(Icons.store),
            onPressed: () => context.go('/store-selector'),
            tooltip: 'Change Store',
          ),
          IconButton(
            icon: const Icon(Icons.lock_clock),
            onPressed: () => context.go('/shift'),
            tooltip: 'Shift Info',
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.point_of_sale,
                size: 96,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 24),
              Text(
                'POS Checkout (Phase 4)',
                style: theme.textTheme.displayMedium?.copyWith(
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Store: ${authState.selectedStore?.name ?? 'None'}\n'
                'Shift: ${shiftState.currentShift?.id?.substring(0, 8) ?? 'None'}...\n'
                'Opening Cash: ${shiftState.currentShift?.openingCash != null ? 'Rp ${shiftState.currentShift!.openingCash!}' : 'N/A'}',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: () => context.go('/shift'),
                icon: const Icon(Icons.lock_clock),
                label: const Text('Manage Shift'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Placeholder Refund screen (Phase 5).
class _RefundPlaceholderScreen extends ConsumerWidget {
  const _RefundPlaceholderScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final saleId = GoRouterState.of(context).pathParameters['saleId'] ?? 'unknown';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Refund (Phase 5)'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.assignment_return,
                size: 96,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 24),
              Text(
                'Refund Screen',
                style: theme.textTheme.displayMedium?.copyWith(
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Sale ID: $saleId\n\nPIN-gated refund flow will be implemented in Phase 5',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}