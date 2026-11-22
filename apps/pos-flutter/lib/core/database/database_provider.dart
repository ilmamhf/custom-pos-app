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
