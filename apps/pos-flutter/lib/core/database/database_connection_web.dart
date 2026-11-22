/// Web SQLite connection using WebAssembly and IndexedDB persistence.

import 'package:sqlite3/wasm.dart';

const _databaseName = 'pos_flutter';
const _databaseFile = '/pos_flutter.sqlite';

Future<WasmSqlite3>? _sqliteFuture;
Future<IndexedDbFileSystem>? _fileSystemFuture;
bool _vfsRegistered = false;

Future<WasmSqlite3> _loadSqlite3() {
  return _sqliteFuture ??= WasmSqlite3.loadFromUrl(
    Uri.parse('sqlite3.wasm'),
  );
}

Future<IndexedDbFileSystem> _loadFileSystem() {
  return _fileSystemFuture ??= IndexedDbFileSystem.open(
    dbName: _databaseName,
  );
}

Future<CommonDatabase> openPlatformDatabase() async {
  final sqlite = await _loadSqlite3();
  final fileSystem = await _loadFileSystem();

  if (!_vfsRegistered) {
    sqlite.registerVirtualFileSystem(fileSystem, makeDefault: true);
    _vfsRegistered = true;
  }

  return sqlite.open(_databaseFile);
}

Future<CommonDatabase> openInMemoryPlatformDatabase() async {
  final sqlite = await _loadSqlite3();
  return sqlite.openInMemory();
}

Future<void> flushPlatformDatabase() async {
  final fileSystem = await _fileSystemFuture;
  await fileSystem?.flush();
}
