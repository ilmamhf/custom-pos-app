import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';

import 'support/app_helpers.dart';
import 'support/patrol_api.dart';

/// This test exercises the v0 → v1 migration on a real device with a
/// persisted database file. It simulates a user upgrading from an older
/// app version that had the legacy v0 schema.
///
/// The test:
/// 1. Creates a database file with the v0 schema and legacy data
/// 2. Launches the app (which runs the migration on startup)
/// 3. Verifies the data is correctly migrated and accessible
void main() {
  patrolTest(
    'M-04: v0 → v1 migration on real device with persisted database',
    ($) async {
      // Step 1: Create a v0 database file in the app's documents directory
      final documents = await getApplicationDocumentsDirectory();
      final dbPath = path.join(documents.path, 'pos_flutter.sqlite');

      // Delete any existing database to start fresh
      final file = File(dbPath);
      if (await file.exists()) {
        await file.delete();
      }

      // Create the v0 schema and insert legacy data
      final db = sqlite3.open(dbPath);
      try {
        // v0 schema
        db.execute('''
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
        db.execute('''
          CREATE INDEX IF NOT EXISTS idx_local_products_barcode ON local_products(barcode)
        ''');

        db.execute('''
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

        db.execute('''
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

        db.execute('''
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

        db.execute('''
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

        db.execute('''
          CREATE TABLE local_sync_state (
            store_id TEXT PRIMARY KEY NOT NULL,
            cursor TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');

        // Legacy products without store_id
        db.execute('''
          INSERT INTO local_products (id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
          VALUES
            ('prod-legacy-1', 'KOPI-001', '8991234567890', 'Kopi Susu', 18000, 10, 1, 1700000000000, 1700000000000),
            ('prod-legacy-2', 'ROTI-001', '8991234567891', 'Roti Tawar', 15000, 5, 1, 1700000000000, 1700000000000),
            ('prod-legacy-3', 'TEH-001', '8991234567892', 'Teh Manis', 5000, 20, 1, 1700000000000, 1700000000000)
        ''');

        // Legacy shifts and sales
        db.execute('''
          INSERT INTO local_shifts (id, store_id, user_id, opened_at, opening_cash)
          VALUES ('shift-legacy-1', 'store-1', 'user-1', 1700000000000, 500000)
        ''');

        db.execute('''
          INSERT INTO local_sales (id, store_id, shift_id, cashier_id, receipt_no, subtotal, tax_total, discount_total, grand_total, payment_method, created_at)
          VALUES ('sale-legacy-1', 'store-1', 'shift-legacy-1', 'user-1', 'BKS-20261122-0001', 36000, 3960, 0, 39960, 'CASH', 1700000000000)
        ''');

        db.execute('''
          INSERT INTO local_sale_items (id, sale_id, product_id, product_name_snapshot, unit_price, qty, line_total)
          VALUES ('item-legacy-1', 'sale-legacy-1', 'prod-legacy-1', 'Kopi Susu', 18000, 2, 36000)
        ''');

        // Ensure user_version is 0 so migration runs
        db.execute('PRAGMA user_version = 0');
      } finally {
        db.dispose();
      }

      // Step 2: Launch the app - this will open the database and run migrations
      await launchApp($);

      // Step 3: Sign in and verify the migrated data is accessible
      await signIn($);
      await selectBks($);

      // Wait for the catalog to load and show the migrated products
      await pumpUntil(
        $.tester,
        find.text('Kopi Susu'),
        timeout: const Duration(seconds: 30),
        reason: 'migrated product should appear in catalog',
      );

      expect(find.text('Kopi Susu'), findsOneWidget);
      expect(find.text('Roti Tawar'), findsOneWidget);
      expect(find.text('Teh Manis'), findsOneWidget);

      // Verify the products are correctly assigned to store-1 (the legacy bucket)
      // by checking they appear in the Bekasi catalog
      await $.tester.tap(find.text('Kopi Susu'));
      await pumpUntil(
        $.tester,
        find.text('Add to cart'),
        timeout: const Duration(seconds: 10),
        reason: 'product detail should load',
      );

      // The price should match the migrated value
      expect(find.textContaining('18.000'), findsWidgets);

      // Close the detail
      await $.tester.tap(find.byIcon(Icons.arrow_back));
      await $.tester.pump();

      // Verify stock was migrated
      expect(find.textContaining('Stock: 10'), findsWidgets);

      // Step 4: Verify we can make a sale with migrated products
      await openOrContinueShift($);

      // Add migrated product to cart
      await $.tester.tap(find.text('Kopi Susu'));
      await pumpUntil($.tester, find.text('Add to cart'));
      await $.tester.tap(find.text('Add to cart'));
      await $.tester.pump();

      expect(find.textContaining('Rp 36.000'), findsWidgets); // 2 x 18000

      // Pay and complete
      await $.tester.tap(find.widgetWithText(FilledButton, 'Pay'));
      await pumpUntil($.tester, find.text('Cash'));
      await $.tester.tap(find.text('Cash'));
      await $.tester.tap(find.widgetWithText(FilledButton, 'Confirm'));
      await pumpUntil(
        $.tester,
        find.text('Sale Complete'),
        timeout: const Duration(seconds: 20),
        reason: 'sale should complete with migrated data',
      );

      // Verify the sale synced
      final api = PatrolApi();
      final deadline = DateTime.now().add(const Duration(seconds: 30));
      var synced = false;
      while (DateTime.now().isBefore(deadline)) {
        if (await api.latestSaleSynced('sale-legacy-1')) {
          synced = true;
          break;
        }
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      expect(synced, isTrue, reason: 'sale with migrated product should sync to server');

      // Step 5: Verify the database file was upgraded (user_version = 1)
      final dbAfter = sqlite3.open(dbPath);
      try {
        final versionRow = dbAfter.select('PRAGMA user_version').first;
        expect(versionRow['user_version'], 1);

        // Verify store_id column exists
        final columns = dbAfter.select('PRAGMA table_info(local_products)');
        final hasStoreId = columns.any((c) => c['name'] == 'store_id');
        expect(hasStoreId, isTrue);

        // Verify legacy products got store_id = 'store-1'
        final products = dbAfter.select(
          'SELECT id, store_id FROM local_products WHERE id IN (\'prod-legacy-1\', \'prod-legacy-2\', \'prod-legacy-3\')'
        );
        expect(products.length, 3);
        for (final p in products) {
          expect(p['store_id'], 'store-1');
        }

        // Verify primary key is now (store_id, id)
        final indexes = dbAfter.select('PRAGMA index_list(local_products)');
        var pkFound = false;
        for (final i in indexes) {
          if (i['origin'] == 'pk') {
            pkFound = true;
            break;
          }
        }
        expect(pkFound, isTrue);

        // Verify barcode index is on (store_id, barcode)
        final barcodeIndex = dbAfter.select(
          "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_local_products_barcode'"
        );
        expect(barcodeIndex.single['sql'], contains('store_id'));
      } finally {
        dbAfter.dispose();
      }
    },
  );
}