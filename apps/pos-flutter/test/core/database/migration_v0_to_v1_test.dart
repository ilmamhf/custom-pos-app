import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/common.dart';
import 'package:sqlite3/sqlite3.dart';

/// Helper that builds a v0 schema (the original schema without `store_id`
/// on `local_products`) and inserts rows in the legacy format.
class V0DatabaseBuilder {
  final CommonDatabase db;

  V0DatabaseBuilder(this.db);

  void buildSchema() {
    // v0 schema: local_products WITHOUT store_id column
    db.execute('''
      CREATE TABLE IF NOT EXISTS local_products (
        id TEXT PRIMARY KEY NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT,
        name TEXT NOT NULL,
        effective_price INTEGER NOT NULL,
        stock_on_hand INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        last_synced_at INTEGER
      )
    ''');

    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_products_barcode ON local_products(barcode)
    ''');

    db.execute('''
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

    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_shifts_store_user ON local_shifts(store_id, user_id)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_shifts_opened_at ON local_shifts(opened_at)
    ''');

    db.execute('''
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

    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_shift ON local_sales(shift_id)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_store ON local_sales(store_id)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_created_at ON local_sales(created_at)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sales_status ON local_sales(status)
    ''');

    db.execute('''
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

    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sale_items_sale ON local_sale_items(sale_id)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_sale_items_product ON local_sale_items(product_id)
    ''');

    db.execute('''
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

    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity_type, entity_id)
    ''');
    db.execute('''
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_created ON sync_outbox(created_at)
    ''');

    db.execute('''
      CREATE TABLE IF NOT EXISTS local_sync_state (
        store_id TEXT PRIMARY KEY NOT NULL,
        cursor TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    // Ensure the user_version is 0 so the migration runs
    db.execute('PRAGMA user_version = 0');
  }

  void insertLegacyProducts() {
    db.execute('''
      INSERT INTO local_products (id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
      VALUES
        ('prod-1', 'KOPI-001', '8991234567890', 'Kopi Susu', 18000, 10, 1, 1700000000000, 1700000000000),
        ('prod-2', 'ROTI-001', '8991234567891', 'Roti Tawar', 15000, 5, 1, 1700000000000, 1700000000000),
        ('prod-3', 'TEH-001', '8991234567892', 'Teh Manis', 5000, 20, 1, 1700000000000, 1700000000000)
    ''');
  }

  void insertLegacyShifts() {
    db.execute('''
      INSERT INTO local_shifts (id, store_id, user_id, opened_at, opening_cash)
      VALUES ('shift-1', 'store-1', 'user-1', 1700000000000, 500000)
    ''');
  }

  void insertLegacySales() {
    db.execute('''
      INSERT INTO local_sales (id, store_id, shift_id, cashier_id, receipt_no, subtotal, tax_total, discount_total, grand_total, payment_method, created_at)
      VALUES ('sale-1', 'store-1', 'shift-1', 'user-1', 'BKS-20261122-0001', 36000, 3960, 0, 39960, 'CASH', 1700000000000)
    ''');

    db.execute('''
      INSERT INTO local_sale_items (id, sale_id, product_id, product_name_snapshot, unit_price, qty, line_total)
      VALUES ('item-1', 'sale-1', 'prod-1', 'Kopi Susu', 18000, 2, 36000)
    ''');
  }
}

/// Runs the v0 → v1 migration logic extracted from AppDatabase._migrateProductsToStoreScoped.
void _runV0ToV1Migration(CommonDatabase db) {
  final columns = db.select('PRAGMA table_info(local_products)');
  final hasStoreId = columns.any((c) => c['name'] == 'store_id');
  if (hasStoreId) return;

  db.execute('''
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

  db.execute('''
    INSERT INTO local_products_migrated
      (store_id, id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
    SELECT 'store-1', id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at
    FROM local_products
  ''');

  db.execute('DROP TABLE local_products');
  db.execute('ALTER TABLE local_products_migrated RENAME TO local_products');
  db.execute('DROP INDEX IF EXISTS idx_local_products_barcode');
  db.execute('''
    CREATE INDEX IF NOT EXISTS idx_local_products_barcode ON local_products(store_id, barcode)
  ''');

  db.execute('PRAGMA user_version = 1');
}

void main() {
  group('v0 → v1 database migration', () {
    test('migrates legacy products to store-scoped schema', () {
      // Create an in-memory database with v0 schema
      final db = sqlite3.openInMemory();
      final builder = V0DatabaseBuilder(db);
      builder.buildSchema();
      builder.insertLegacyProducts();
      builder.insertLegacyShifts();
      builder.insertLegacySales();

      // Verify v0 state: products table has no store_id column
      final v0Columns = db.select('PRAGMA table_info(local_products)');
      final hasStoreIdBefore = v0Columns.any((c) => c['name'] == 'store_id');
      expect(hasStoreIdBefore, isFalse);

      final v0Products = db.select('SELECT * FROM local_products');
      expect(v0Products.length, 3);
      expect(v0Products[0]['id'], 'prod-1');
      expect(v0Products[0]['store_id'], isNull);

      // Run the migration on the same database
      _runV0ToV1Migration(db);

      // Verify v1 state
      final v1Columns = db.select('PRAGMA table_info(local_products)');
      final hasStoreIdAfter = v1Columns.any((c) => c['name'] == 'store_id');
      expect(hasStoreIdAfter, isTrue);

      final v1Products = db.select('SELECT * FROM local_products');
      expect(v1Products.length, 3);

      for (final p in v1Products) {
        expect(p['store_id'], 'store-1'); // legacy bucket
        expect(p['id'], isNotNull);
        expect(p['sku'], isNotNull);
      }

      // Verify the primary key is now (store_id, id)
      final indexes = db.select('PRAGMA index_list(local_products)');
      var pkFound = false;
      for (final i in indexes) {
        if (i['origin'] == 'pk') {
          pkFound = true;
          break;
        }
      }
      expect(pkFound, isTrue);

      // Verify the barcode index is now on (store_id, barcode)
      final barcodeIndex = db.select(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_local_products_barcode'"
      );
      expect(barcodeIndex.single['sql'], contains('store_id'));

      // Verify user_version is now 1
      final versionRow = db.select('PRAGMA user_version').first;
      expect(versionRow['user_version'], 1);

      db.dispose();
    });

    test('migration is idempotent - running twice does not duplicate data', () {
      final db = sqlite3.openInMemory();
      final builder = V0DatabaseBuilder(db);
      builder.buildSchema();
      builder.insertLegacyProducts();

      _runV0ToV1Migration(db);
      _runV0ToV1Migration(db); // run again

      final products = db.select('SELECT * FROM local_products');
      expect(products.length, 3);

      final versionRow = db.select('PRAGMA user_version').first;
      expect(versionRow['user_version'], 1);

      db.dispose();
    });

    test('migration preserves existing store_id if already present (v1 already)', () {
      final db = sqlite3.openInMemory();

      // Create v1 schema directly (simulating an already-migrated DB)
      db.execute('''
        CREATE TABLE local_products (
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
      db.execute('''
        CREATE INDEX idx_local_products_barcode ON local_products(store_id, barcode)
      ''');

      db.execute('''
        INSERT INTO local_products (store_id, id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
        VALUES ('store-2', 'prod-3', 'NEW-001', '8999999999999', 'New Product', 25000, 100, 1, 1800000000000, 1800000000000)
      ''');

      db.execute('PRAGMA user_version = 1');

      _runV0ToV1Migration(db);

      final products = db.select('SELECT * FROM local_products');
      expect(products.length, 1);
      expect(products[0]['store_id'], 'store-2');
      expect(products[0]['id'], 'prod-3');

      final versionRow = db.select('PRAGMA user_version').first;
      expect(versionRow['user_version'], 1);

      db.dispose();
    });
  });
}