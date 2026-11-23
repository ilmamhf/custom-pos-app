/// Flutter POS Cashier App entry point.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'core/config/app_config.dart';
import 'core/database/app_database.dart';
import 'core/database/database_provider.dart';
import 'core/network/dio_client.dart';
import 'core/platform/web_app_shell.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/pin_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final secureStorage = const FlutterSecureStorage();
  final authInterceptor = AuthInterceptor(secureStorage);
  final dio = createDioClient(
    secureStorage: secureStorage,
    authInterceptor: authInterceptor,
  );
  final database = await AppDatabase.open();

  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(database),
        dioProvider.overrideWithValue(dio),
        authInterceptorProvider.overrideWithValue(authInterceptor),
        secureStorageProvider.overrideWithValue(secureStorage),
        // The catalog always follows the cashier's selected store.
        activeStoreIdProvider.overrideWith(
          (ref) =>
              ref.watch(authProvider.select((s) => s.selectedStore?.id)) ??
              defaultLocalStoreId,
        ),
      ],
      child: const PosApp(),
    ),
  );
}

/// Root application widget.
class PosApp extends ConsumerWidget {
  const PosApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ThemeMode.light,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        final app = child ?? const SizedBox.shrink();
        return kIsWeb ? WebAppShell(child: app) : app;
      },
    );
  }
}
