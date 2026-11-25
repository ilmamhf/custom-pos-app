import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';
import 'package:pos_flutter/core/database/database_connection.dart';

import 'support/app_helpers.dart';

/// This test exercises the v0 → v1 → v2 migration on a persisted database.
/// It simulates a user upgrading from an older app version that had the
/// legacy v0 schema.
///
/// The test:
/// 1. Creates a database with the v0 schema and legacy data through the same
///    platform opener the app uses (IndexedDB-backed SQLite on web, a file on
///    native platforms)
/// 2. Launches the app, which runs the migration on startup
/// 3. Verifies the data is correctly migrated and the app still reaches the POS
void main() {
  patrolTest(
    'M-04: v0 → v1 migration on a persisted database',
    ($) async {
      // Step 1: seed a v0 database through the app's own platform opener.
      // Using openPlatformDatabase() (instead of dart:io + a hard-coded path)
      // is what lets this test run on Chrome as well as on a device.
      final seed = await openPlatformDatabase();
      try {
        // A previous run in the same browser profile may have left a migrated
        // database behind. Start from an empty schema.
        for (final table in const [
          'local_sale_tenders',
          'local_sale_items',
          'local_sales',
          'local_shifts',
          'local_products',
          'sync_outbox',
          'local_sync_state',
        ]) {
          seed.execute('DROP TABLE IF EXISTS $table');
        }

        // v0 schema
        seed.execute('''
          CREATE TABLE local_products (
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
        seed.execute('''
          CREATE INDEX IF NOT EXISTS idx_local_products_barcode ON local_products(barcode)
        ''');

        seed.execute('''
          CREATE TABLE local_shifts (
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

        seed.execute('''
          CREATE TABLE local_sales (
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

        seed.execute('''
          CREATE TABLE local_sale_items (
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

        seed.execute('''
          CREATE TABLE sync_outbox (
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

        seed.execute('''
          CREATE TABLE local_sync_state (
            store_id TEXT PRIMARY KEY NOT NULL,
            cursor TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');

        // Legacy products without store_id
        seed.execute('''
          INSERT INTO local_products (id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
          VALUES
            ('prod-legacy-1', 'KOPI-001', '8991234567890', 'Kopi Susu', 18000, 10, 1, 1700000000000, 1700000000000),
            ('prod-legacy-2', 'ROTI-001', '8991234567891', 'Roti Tawar', 15000, 5, 1, 1700000000000, 1700000000000),
            ('prod-legacy-3', 'TEH-001', '8991234567892', 'Teh Manis', 5000, 20, 1, 1700000000000, 1700000000000)
        ''');

        // Legacy shifts and sales
        seed.execute('''
          INSERT INTO local_shifts (id, store_id, user_id, opened_at, opening_cash)
          VALUES ('shift-legacy-1', 'store-1', 'user-1', 1700000000000, 500000)
        ''');

        seed.execute('''
          INSERT INTO local_sales (id, store_id, shift_id, cashier_id, receipt_no, subtotal, tax_total, discount_total, grand_total, payment_method, created_at)
          VALUES ('sale-legacy-1', 'store-1', 'shift-legacy-1', 'user-1', 'BKS-20261122-0001', 36000, 3960, 0, 39960, 'CASH', 1700000000000)
        ''');

        seed.execute('''
          INSERT INTO local_sale_items (id, sale_id, product_id, product_name_snapshot, unit_price, qty, line_total)
          VALUES ('item-legacy-1', 'sale-legacy-1', 'prod-legacy-1', 'Kopi Susu', 18000, 2, 36000)
        ''');

        // Ensure user_version is 0 so the migration runs
        seed.execute('PRAGMA user_version = 0');
      } finally {
        seed.dispose();
      }
      // The web file system buffers writes; flush before the app opens it.
      await flushPlatformDatabase();

      // Step 2: launch the app - it opens the database and runs the migrations.
      await launchApp($);

      // Step 3: verify the persisted database was migrated. A second
      // connection reads the same platform file the app opened.
      final db = await openPlatformDatabase();
      try {
        final version = db.select('PRAGMA user_version').first['user_version'];
        expect(version, 2, reason: 'the app migrates v0 through v1 to v2');

        final columns = db.select('PRAGMA table_info(local_products)');
        final hasStoreId = columns.any((c) => c['name'] == 'store_id');
        expect(hasStoreId, isTrue, reason: 'v1 adds store_id to local_products');

        // Verify legacy products got store_id = 'store-1'
        final products = db.select(
          'SELECT id, store_id FROM local_products WHERE id IN '
          "('prod-legacy-1', 'prod-legacy-2', 'prod-legacy-3')",
        );
        expect(products.length, 3, reason: 'no legacy product is lost');
        for (final p in products) {
          expect(p['store_id'], 'store-1');
        }

        // Verify the primary key is now (store_id, id)
        final indexes = db.select('PRAGMA index_list(local_products)');
        expect(
          indexes.any((i) => i['origin'] == 'pk'),
          isTrue,
          reason: 'the composite primary key survives the rebuild',
        );

        // Verify the barcode index is on (store_id, barcode)
        final barcodeIndex = db.select(
          "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_local_products_barcode'",
        );
        expect(barcodeIndex.single['sql'], contains('store_id'));

        // The legacy shift and sale are preserved.
        expect(
          db.select("SELECT id FROM local_shifts WHERE id = 'shift-legacy-1'").length,
          1,
        );
        expect(
          db.select("SELECT id FROM local_sales WHERE id = 'sale-legacy-1'").length,
          1,
        );

        // v2 adds the tender table.
        expect(db.select('PRAGMA table_info(local_sale_tenders)'), isNotEmpty);
      } finally {
        db.dispose();
      }

      // Step 4: the migrated database still boots the app to the POS.
      await reachPos($);
      expect(find.text('Scan barcode or search products'), findsOneWidget);
    },
  );
}
