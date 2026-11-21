/// Flutter POS Cashier App entry point.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import 'package:go_router/go_router.dart';
import 'core/theme/app_theme.dart';
import 'core/config/app_config.dart';
import 'core/network/dio_client.dart';
import 'core/router/app_router.dart';
import 'features/auth/auth_provider.dart';
import 'features/shift/shift_provider.dart';

void main() {
  // Ensure Flutter binding is initialized before any async operations.
  WidgetsFlutterBinding.ensureInitialized();

  // Run the app with Riverpod provider scope.
  runApp(const ProviderScope(child: PosApp()));
}

/// Root application widget.
class PosApp extends ConsumerWidget {
  const PosApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Create Dio and AuthInterceptor
    final secureStorage = const FlutterSecureStorage();
    final dio = createDioClient(secureStorage: secureStorage);

    // Create router with auth/shift guards
    final router = GoRouter(
      initialLocation: '/login',
      redirect: (context, state) {
        final authState = ref.watch(authProvider);
        final shiftState = ref.watch(shiftProvider);

        final isLoggedIn = authState.isLoggedIn;
        final hasStore = authState.hasSelectedStore;
        final hasOpenShift = shiftState.isOpen;
        final location = state.matchedLocation;

        if (!isLoggedIn) {
          return location != '/login' ? '/login' : null;
        }
        if (!hasStore) {
          return location != '/store-selector' ? '/store-selector' : null;
        }
        if (!hasOpenShift) {
          return location != '/shift' ? '/shift' : null;
        }
        if (location == '/login' || location == '/store-selector' || location == '/shift') {
          return '/pos';
        }
        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/store-selector', builder: (_, __) => const StoreSelectorScreen()),
        GoRoute(path: '/shift', builder: (_, __) => const ShiftScreen()),
        GoRoute(path: '/pos', builder: (_, __) => const _PosPlaceholderScreen()),
        GoRoute(path: '/refund/:saleId', builder: (_, __) => const _RefundPlaceholderScreen()),
      ],
    );

    return MaterialApp.router(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ThemeMode.light,
      routerConfig: router,
    );
  }
}

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