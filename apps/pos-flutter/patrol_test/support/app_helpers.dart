import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';
import 'package:patrol_finders/patrol_finders.dart';
import 'package:pos_flutter/main.dart' as app;

final _syncIcons = <IconData>{
  Icons.cloud_done,
  Icons.cloud_upload,
  Icons.cloud_off,
  Icons.sync,
  Icons.error,
};

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

Future<void> launchApp(PatrolTester $) async {
  await $.pumpWidget(await app.createApp());
  await $.tester.pump(const Duration(seconds: 1));
  await pumpUntil($.tester, find.byType(Scaffold),
      timeout: const Duration(seconds: 30), reason: 'app shell');
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

Future<void> waitForProduct(PatrolTester $, String name) async {
  await pumpUntil($.tester, find.text(name),
      timeout: const Duration(seconds: 60), reason: name);
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
