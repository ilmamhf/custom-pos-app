import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol_finders/patrol_finders.dart';
import 'package:pos_flutter/core/database/app_database.dart';
import 'package:pos_flutter/main.dart' as app;

final _syncIcons = <IconData>{
  Icons.cloud_done,
  Icons.cloud_upload,
  Icons.cloud_off,
  Icons.sync,
  Icons.error,
};

/// Tracks the test database so it can be closed in tearDown.
AppDatabase? _testDatabase;

/// Returns the current test database, creating one if needed.
/// Uses open() for persisted DB; tables are cleared in tearDown for isolation.
Future<AppDatabase> _getOrCreateTestDatabase() async {
  if (_testDatabase == null) {
    _testDatabase = await AppDatabase.open();
  }
  return _testDatabase!;
}

/// Clears all tables in the test database for isolation, then closes it.
Future<void> closeTestDatabase() async {
  if (_testDatabase != null) {
    final db = _testDatabase!;
    // Clear all tables to ensure test isolation
    for (final table in const [
      'local_sale_tenders',
      'local_sale_items',
      'local_sales',
      'local_shifts',
      'local_products',
      'sync_outbox',
      'local_sync_state',
    ]) {
      try {
        db.execute('DELETE FROM $table');
      } catch (_) {
        // Table might not exist, ignore
      }
    }
    db.close();
    _testDatabase = null;
  }
}

/// Launches the app with a fresh test database.
/// Call [closeTestDatabase] in tearDown to clear tables and release resources.
Future<void> launchApp(PatrolTester $) async {
  final db = await _getOrCreateTestDatabase();
  await $.pumpWidget(await app.createApp(database: db));
  await $.tester.pump(const Duration(seconds: 1));
  await pumpUntil($.tester, find.byType(Scaffold),
      timeout: const Duration(seconds: 30), reason: 'app shell');
}

/// Convenience: launches app and advances to POS.
/// Call [closeTestDatabase] in tearDown to release the IndexedDB handle.
Future<void> launchAndReachPos(PatrolTester $) async {
  await launchApp($);
  await reachPos($);
}

Future<void> pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
  String? reason,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for ${reason ?? finder.toString()}');
}

Future<void> pumpUntilGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 15),
  String? reason,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isEmpty) return;
  }
  throw TestFailure(
      'Timed out waiting for ${reason ?? finder.toString()} to close');
}

Finder syncBadgeFinder() {
  return find.byWidgetPredicate((widget) {
    if (widget is! IconButton) return false;
    final icon = widget.icon;
    return icon is Icon && _syncIcons.contains(icon.icon);
  });
}

Future<void> signIn(
  PatrolTester $, {
  String email = 'kasir1@toko.id',
  String password = 'password123',
}) async {
  final tester = $.tester;
  await pumpUntil(tester, find.text('Sign in to continue'),
      reason: 'login screen');
  await tester.enterText(find.byType(TextFormField).at(0), email);
  await tester.pump();
  await tester.enterText(find.byType(TextFormField).at(1), password);
  await tester.pump();
  await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
  await pumpUntil(tester, find.text('Select Store'),
      timeout: const Duration(seconds: 30), reason: 'store selector');
}

Future<void> selectBks(PatrolTester $) async {
  await $.tester.tap(find.text('Cabang Bekasi'));
  await pumpUntil($.tester, find.text('Shift Management'),
      timeout: const Duration(seconds: 30), reason: 'shift screen');
}

Future<void> openOrContinueShift(PatrolTester $, {int openingCash = 0}) async {
  final tester = $.tester;
  if (find.text('No Active Shift').evaluate().isNotEmpty) {
    await tester.tap(find.text('Open New Shift'));
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Open Shift'));
    await tester.enterText(find.byType(TextFormField).last, '$openingCash');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Open Shift'));
  } else if (find.text('Continue to POS').evaluate().isNotEmpty) {
    await tester.tap(find.text('Continue to POS'));
  }
  await pumpUntil(tester, find.text('Scan barcode or search products'),
      timeout: const Duration(seconds: 60), reason: 'POS catalog');
}

/// Handles a fresh launch or a persisted session and lands on the POS.
Future<void> reachPos(PatrolTester $) async {
  final tester = $.tester;
  await tester.pump(const Duration(seconds: 1));

  if (find.text('Sign in to continue').evaluate().isNotEmpty) {
    await signIn($);
  }
  if (find.text('Select Store').evaluate().isNotEmpty) {
    await selectBks($);
  }
  if (find.text('Shift Management').evaluate().isNotEmpty) {
    await openOrContinueShift($);
  }

  await pumpUntil(tester, find.text('Scan barcode or search products'),
      timeout: const Duration(seconds: 60), reason: 'POS');
}

Future<void> waitForProduct(PatrolTester $, String name,
    {Duration timeout = const Duration(seconds: 60)}) async {
  await pumpUntil($.tester, find.text(name),
      timeout: timeout, reason: name);
}

/// Waits for the sync badge to show the "done" state (cloud_done icon),
/// indicating the catalog sync has completed.
/// Returns when sync is done, or times out after [timeout].
Future<void> waitForSyncComplete(PatrolTester $,
    {Duration timeout = const Duration(seconds: 180)}) async {
  await pumpUntil(
    $.tester,
    find.byIcon(Icons.cloud_done),
    timeout: timeout,
    reason: 'catalog sync to complete (cloud_done)',
  );
}

/// Forces a full catalog sync by clearing the sync cursor, then triggering sync.
/// This ensures the product catalog is pulled from the server (not just delta).
Future<void> forceFullCatalogSync(PatrolTester $) async {
  // Clear the sync cursor for all stores to force full snapshot on next pull.
  if (_testDatabase != null) {
    try {
      _testDatabase!.execute('DELETE FROM local_sync_state');
    } catch (_) {
      // Table might not exist, ignore
    }
  }
  // Trigger sync via the UI badge.
  await $.tester.tap(syncBadgeFinder().first);
  await waitForSyncComplete($);
}

/// Opens the mobile cart sheet if the wide cart panel is not visible.
Future<void> ensureCartVisible(PatrolTester $) async {
  if (find.text('Cart').evaluate().isNotEmpty) return;
  final bar = find.byKey(const Key('mobile-cart-bar'));
  if (bar.evaluate().isEmpty) return;
  await $.tester.tap(bar);
  await pumpUntil($.tester, find.text('Cart'),
      timeout: const Duration(seconds: 15), reason: 'cart sheet');
}

Future<void> tapCharge(PatrolTester $) async {
  await ensureCartVisible($);
  await $.tester.tap(find.textContaining('Charge').first);
  await pumpUntil($.tester, find.textContaining('Complete Sale'),
      timeout: const Duration(seconds: 15), reason: 'payment dialog');
}

Future<void> completeCashSale(PatrolTester $) async {
  await tapCharge($);
  await $.tester.tap(find.textContaining('Complete Sale').first);
  await pumpUntil($.tester, find.text('Sale complete'),
      timeout: const Duration(seconds: 30), reason: 'sale complete');
}