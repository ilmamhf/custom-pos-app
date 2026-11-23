import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

import 'support/app_helpers.dart';
import 'support/patrol_api.dart';

void main() {
  patrolTest('F1/F5: cashier signs in and selects a store', ($) async {
    await launchApp($);
    await signIn($);

    expect(find.text('Select Store'), findsOneWidget);
    expect(find.text('Cabang Bekasi'), findsWidgets);

    await selectBks($);
    expect(find.text('Shift Management'), findsOneWidget);
    expect(find.text('Cabang Bekasi'), findsWidgets);
  });

  patrolTest('F2: invalid credentials are rejected', ($) async {
    final tester = $.tester;
    await launchApp($);

    await pumpUntil(tester, find.text('Sign in to continue'),
        reason: 'login screen');
    await tester.enterText(find.byType(TextFormField).at(0), 'kasir1@toko.id');
    await tester.pump();
    await tester.enterText(find.byType(TextFormField).at(1), 'wrong-password');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));

    await pumpUntil(tester, find.text('Invalid email or password'),
        timeout: const Duration(seconds: 20), reason: 'login error');
    expect(find.text('Select Store'), findsNothing);
  });

  patrolTest('F7/F8/F10: open a shift and close it', ($) async {
    final api = PatrolApi();
    await api.signInOwner();

    await launchApp($);
    await signIn($);
    await selectBks($);
    await openOrContinueShift($);

    expect(find.text('Scan barcode or search products'), findsOneWidget);

    await $.tester.tap(find.byTooltip('Shift'));
    await pumpUntil($.tester, find.text('Shift Management'),
        reason: 'shift screen');

    await $.tester.tap(find.widgetWithText(FilledButton, 'Close Shift'));
    await pumpUntil($.tester, find.widgetWithText(FilledButton, 'Close Shift'));
    await $.tester.enterText(find.byType(TextFormField).last, '0');
    await $.tester.pump();
    await $.tester.tap(find.widgetWithText(FilledButton, 'Close Shift').last);

    await pumpUntil($.tester, find.text('No Active Shift'),
        timeout: const Duration(seconds: 30), reason: 'shift closed UI');

    final deadline = DateTime.now().add(const Duration(seconds: 30));
    var closed = false;
    while (DateTime.now().isBefore(deadline)) {
      if (await api.latestShiftClosed()) {
        closed = true;
        break;
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    expect(closed, isTrue, reason: 'shift close should sync to the server');
  });
}
