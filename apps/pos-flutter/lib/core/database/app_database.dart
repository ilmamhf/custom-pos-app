/// Simple SQLite database wrapper for offline-first POS operations.

import 'package:sqlite3/common.dart';
import 'database_connection.dart';
import 'daos/products_dao.dart';
import 'daos/shifts_dao.dart';
import 'daos/sales_dao.dart';
import 'daos/sync_dao.dart';

/// The main database class for the POS app.
class AppDatabase {
  late final CommonDatabase _db;

  // DAOs
  late final ProductsDao productsDao;
  late final ShiftsDao shiftsDao;
  late final SalesDao salesDao;
  late final SyncDao syncDao;

  /// Private constructor - use open() or inMemory()
  AppDatabase._(this._db) {
    _db.execute('PRAGMA foreign_keys = ON');
    _createTables();
    _migrate();
    _initDaos();
  }

  /// Opens the persistent database for the current platform.
  static Future<AppDatabase> open() async {
    final db = await openPlatformDatabase();
    final appDatabase = AppDatabase._(db);
    await appDatabase.flush();
    return appDatabase;
  }

  /// Creates an in-memory database for testing.
  static Future<AppDatabase> inMemory() async {
    final db = await openInMemoryPlatformDatabase();
    return AppDatabase._(db);
  }

  void _createTables() {
    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_products (
        store_id TEXT NOT NULL,
        id TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        effective_price INTEGER NOT NULL,
        stock_on_hand INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        last_synced_at INTEGER,
        PRIMARY KEY (store_id, id),
        UNIQUE (store_id, sku)
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_products_barcode ON local_products(store_id, barcode)
    ''');

    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_shifts (
        id TEXT PRIMARY KEY NOT NULL,
        store_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        opening_cash INTEGER NOT NULL,
        expected_cash INTEGER,
        actual_cash INTEGER,
        variance INTEGER,
        last_synced_at INTEGER
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_shifts_store_user ON local_shifts(store_id, user_id)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_shifts_opened_at ON local_shifts(opened_at)
    ''');

    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_sales (
        id TEXT PRIMARY KEY NOT NULL,
        store_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        receipt_no TEXT NOT NULL UNIQUE,
        subtotal INTEGER NOT NULL,
        tax_total INTEGER NOT NULL,
        discount_total INTEGER NOT NULL,
        grand_total INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        created_at INTEGER NOT NULL,
        last_synced_at INTEGER,
        FOREIGN KEY (shift_id) REFERENCES local_shifts(id)
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_shift ON local_sales(shift_id)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_store ON local_sales(store_id)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_created_at ON local_sales(created_at)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_status ON local_sales(status)
    ''');

    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_sale_items (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name_snapshot TEXT NOT NULL,
        unit_price INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        refunded_qty INTEGER NOT NULL DEFAULT 0,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES local_sales(id) ON DELETE CASCADE
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sale_items_sale ON local_sale_items(sale_id)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sale_items_product ON local_sale_items(product_id)
    ''');

    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_sale_tenders (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount INTEGER NOT NULL,
        change INTEGER NOT NULL DEFAULT 0,
        reference TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES local_sales(id) ON DELETE CASCADE
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sale_tenders_sale ON local_sale_tenders(sale_id)
    ''');

    _db.execute('''
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        last_attempt_at INTEGER,
        synced_at INTEGER
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity_type, entity_id)
    ''');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_created ON sync_outbox(created_at)
    ''');

    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_sync_state (
        store_id TEXT PRIMARY KEY NOT NULL,
        cursor TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');
  }

  /// Ordered, idempotent schema migrations keyed by `PRAGMA user_version`.
  void _migrate() {
    final versionRow = _db.select('PRAGMA user_version').first;
    final version = (versionRow['user_version'] as int?) ?? 0;

    if (version < 1) {
      _migrateProductsToStoreScoped();
      _db.execute('PRAGMA user_version = 1');
    }

    if (version < 2) {
      _migrateAddSaleTenders();
      _db.execute('PRAGMA user_version = 2');
    }
  }

  /// v1: add `store_id` to `local_products` and rebuild the primary key as
  /// `(store_id, id)`. Existing rows are assigned to the `'store-1'` legacy
  /// bucket so no local data is discarded.
  void _migrateProductsToStoreScoped() {
    final columns = _db.select('PRAGMA table_info(local_products)');
    final hasStoreId = columns.any((c) => c['name'] == 'store_id');
    if (hasStoreId) return;

    _db.execute('''
      CREATE TABLE local_products_migrated (
        store_id TEXT NOT NULL,
        id TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        effective_price INTEGER NOT NULL,
        stock_on_hand INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        last_synced_at INTEGER,
        PRIMARY KEY (store_id, id),
        UNIQUE (store_id, sku)
      )
    ''');

    _db.execute('''
      INSERT INTO local_products_migrated
        (store_id, id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
      SELECT 'store-1', id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at
      FROM local_products
    ''');

    _db.execute('DROP TABLE local_products');
    _db.execute('ALTER TABLE local_products_migrated RENAME TO local_products');
    _db.execute('DROP INDEX IF EXISTS idx_local_products_barcode');
    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_products_barcode ON local_products(store_id, barcode)
    ''');
  }

  /// v2: add `local_sale_tenders` table for tender breakdown per payment method.
  void _migrateAddSaleTenders() {
    final columns = _db.select('PRAGMA table_info(local_sale_tenders)');
    if (columns.isNotEmpty) return;

    _db.execute('''
      CREATE TABLE IF NOT EXISTS local_sale_tenders (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount INTEGER NOT NULL,
        change INTEGER NOT NULL DEFAULT 0,
        reference TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES local_sales(id) ON DELETE CASCADE
      )
    ''');

    _db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sale_tenders_sale ON local_sale_tenders(sale_id)
    ''');
  }

  void _initDaos() {
    productsDao = ProductsDao(this);
    shiftsDao = ShiftsDao(this);
    salesDao = SalesDao(this);
    syncDao = SyncDao(this);
  }

  /// Executes a function within a transaction.
  void transaction(void Function() body) {
    _db.execute('BEGIN IMMEDIATE TRANSACTION');
    try {
      body();
      _db.execute('COMMIT');
    } catch (e) {
      _db.execute('ROLLBACK');
      rethrow;
    }
  }

  /// Executes a function within a transaction and returns a result.
  T transactionResult<T>(T Function() body) {
    _db.execute('BEGIN IMMEDIATE TRANSACTION');
    try {
      final result = body();
      _db.execute('COMMIT');
      return result;
    } catch (e) {
      _db.execute('ROLLBACK');
      rethrow;
    }
  }

  /// Executes a batch of operations.
  void batch(void Function(Batch) body) {
    final batch = Batch(_db);
    body(batch);
    batch.execute();
  }

  /// Flushes pending writes to persistent storage.
  Future<void> flush() => flushPlatformDatabase();

  /// Closes the database.
  void close() {
    _db.dispose();
  }

  // Raw query helpers for DAOs
  List<Map<String, Object?>> select(String sql, [List<Object?>? args]) {
    return _db.select(sql, args ?? []);
  }

  void execute(String sql, [List<Object?>? args]) {
    _db.execute(sql, args ?? []);
  }

  int insert(String table, Map<String, Object?> values) {
    final columns = values.keys.join(', ');
    final placeholders = values.keys.map((_) => '?').join(', ');
    final sql = 'INSERT INTO $table ($columns) VALUES ($placeholders)';
    _db.execute(sql, values.values.toList());
    return _db.lastInsertRowId;
  }

  int update(String table, Map<String, Object?> values, String where, List<Object?> whereArgs) {
    final setClause = values.keys.map((k) => '$k = ?').join(', ');
    final sql = 'UPDATE $table SET $setClause WHERE $where';
    final args = [...values.values, ...whereArgs];
    _db.execute(sql, args);
    return _db.updatedRows;
  }

  int delete(String table, String where, List<Object?> whereArgs) {
    final sql = 'DELETE FROM $table WHERE $where';
    _db.execute(sql, whereArgs);
    return _db.updatedRows;
  }
}

/// Simple batch implementation
class Batch {
  final CommonDatabase _db;
  final List<_BatchOperation> _operations = [];

  Batch(this._db);

  void insert(String table, Map<String, Object?> values) {
    _operations.add(_BatchOperation('insert', table, values));
  }

  void update(String table, Map<String, Object?> values, String where, List<Object?> whereArgs) {
    _operations.add(_BatchOperation('update', table, values, where: where, whereArgs: whereArgs));
  }

  void delete(String table, String where, List<Object?> whereArgs) {
    _operations.add(_BatchOperation('delete', table, null, where: where, whereArgs: whereArgs));
  }

  void execute() {
    _db.execute('BEGIN IMMEDIATE TRANSACTION');
    try {
      for (final op in _operations) {
        switch (op.type) {
          case 'insert':
            _db.execute(
              'INSERT INTO ${op.table} (${op.values!.keys.join(', ')}) VALUES (${op.values!.keys.map((_) => '?').join(', ')})',
              op.values!.values.toList(),
            );
            break;
          case 'update':
            _db.execute(
              'UPDATE ${op.table} SET ${op.values!.keys.map((k) => '$k = ?').join(', ')} WHERE ${op.where}',
              [...op.values!.values, ...op.whereArgs!],
            );
            break;
          case 'delete':
            _db.execute(
              'DELETE FROM ${op.table} WHERE ${op.where}',
              op.whereArgs!,
            );
            break;
        }
      }
      _db.execute('COMMIT');
    } catch (e) {
      _db.execute('ROLLBACK');
      rethrow;
    }
  }
}

class _BatchOperation {
  final String type;
  final String table;
  final Map<String, Object?>? values;
  final String? where;
  final List<Object?>? whereArgs;

  _BatchOperation(this.type, this.table, this.values, {this.where, this.whereArgs});
}