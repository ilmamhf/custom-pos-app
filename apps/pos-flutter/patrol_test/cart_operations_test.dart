import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

import 'support/app_helpers.dart';

void main() {
  patrolTest('F11/F14/F15/F16: catalog, cart, and discounts', ($) async {
    await launchApp($);
    await reachPos($);
    await waitForProduct($, 'Es Teh Manis Melati');

    await $.tester.tap(find.text('Es Teh Manis Melati').first);
    await $.tester.pump(const Duration(milliseconds: 300));
    await ensureCartVisible($);

    expect(find.text('Cart'), findsOneWidget);
    expect(find.textContaining('Charge'), findsWidgets);

    // Increment and decrement a cart line.
    await $.tester.tap(find.byIcon(Icons.add).first);
    await $.tester.pump(const Duration(milliseconds: 200));
    await $.tester.tap(find.byIcon(Icons.remove).first);
    await $.tester.pump(const Duration(milliseconds: 200));

    // Item discount.
    await $.tester.tap(find.byIcon(Icons.percent).first);
    await pumpUntil($.tester, find.textContaining('Discount •'),
        reason: 'item discount dialog');
    final itemDialog = find.byType(AlertDialog).last;
    await $.tester.enterText(
      find.descendant(of: itemDialog, matching: find.byType(TextField)),
      '1000',
    );
    await $.tester.tap(
      find.descendant(of: itemDialog, matching: find.text('Apply')),
    );
    await pumpUntilGone($.tester, find.byType(AlertDialog),
        reason: 'item discount dialog');

    // Order discount.
    await $.tester.tap(find.text('Add'));
    await pumpUntil($.tester, find.text('Order discount'),
        reason: 'order discount dialog');
    final orderDialog = find.byType(AlertDialog).last;
    await $.tester.enterText(
      find.descendant(of: orderDialog, matching: find.byType(TextField)),
      '10',
    );
    await $.tester.tap(
      find.descendant(of: orderDialog, matching: find.text('Apply')),
    );
    await pumpUntilGone($.tester, find.byType(AlertDialog),
        reason: 'order discount dialog');
    await pumpUntil($.tester, find.text('10.00%'),
        reason: 'order discount applied');

    // Remove the only line.
    await $.tester.tap(find.byIcon(Icons.close).first);
    await $.tester.pump(const Duration(milliseconds: 300));
    await pumpUntil($.tester, find.text('Cart is empty'), reason: 'empty cart');
  });
}
