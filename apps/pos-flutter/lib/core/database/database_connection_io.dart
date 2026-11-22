/// Native SQLite connection using FFI and the app documents directory.

import 'dart:io';

import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/common.dart';
import 'package:sqlite3/sqlite3.dart';

Future<CommonDatabase> openPlatformDatabase() async {
  final documents = await getApplicationDocumentsDirectory();
  final file = File(path.join(documents.path, 'pos_flutter.sqlite'));
  return sqlite3.open(file.path);
}

Future<CommonDatabase> openInMemoryPlatformDatabase() async {
  return sqlite3.openInMemory();
}

Future<void> flushPlatformDatabase() async {}
