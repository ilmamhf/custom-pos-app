/// Riverpod provider for the local SQLite database.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app_database.dart';

/// Holds the opened [AppDatabase] instance.
///
/// Overridden in `main()` with the real file-backed database and in tests
/// with [AppDatabase.inMemory].
final databaseProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('databaseProvider must be overridden');
});

/// Legacy bucket used by unit tests and pre-store-selection preview data.
const defaultLocalStoreId = 'store-1';

/// The store whose catalog the POS should read from.
///
/// `main()` overrides this to follow the selected store; tests and the initial
/// pre-login state fall back to [defaultLocalStoreId].
final activeStoreIdProvider = Provider<String>((ref) {
  return defaultLocalStoreId;
});
