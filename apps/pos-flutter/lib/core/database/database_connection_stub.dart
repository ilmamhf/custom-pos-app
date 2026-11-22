/// Fallback connection implementation for unsupported platforms.

import 'package:sqlite3/common.dart';

Future<CommonDatabase> openPlatformDatabase() {
  throw UnsupportedError('This platform does not provide a SQLite connection.');
}

Future<CommonDatabase> openInMemoryPlatformDatabase() {
  throw UnsupportedError('This platform does not provide a SQLite connection.');
}

Future<void> flushPlatformDatabase() async {}
