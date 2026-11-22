/// Platform-specific SQLite connection factory.
///
/// Native builds use the FFI library shipped by `sqlite3_flutter_libs`.
/// Web builds load the same SQLite engine from `sqlite3.wasm` and persist the
/// database in IndexedDB.

import 'package:sqlite3/common.dart';

import 'database_connection_stub.dart'
    if (dart.library.io) 'database_connection_io.dart'
    if (dart.library.js_interop) 'database_connection_web.dart' as implementation;

/// Opens the persistent platform database.
Future<CommonDatabase> openPlatformDatabase() {
  return implementation.openPlatformDatabase();
}

/// Opens a temporary in-memory database, primarily for tests.
Future<CommonDatabase> openInMemoryPlatformDatabase() {
  return implementation.openInMemoryPlatformDatabase();
}

/// Flushes pending platform writes.
///
/// This is a no-op on native platforms. The web IndexedDB file system writes
/// asynchronously, so critical checkout writes call this before completing.
Future<void> flushPlatformDatabase() {
  return implementation.flushPlatformDatabase();
}
