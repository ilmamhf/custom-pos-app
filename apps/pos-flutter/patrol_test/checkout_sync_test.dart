import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

import 'support/app_helpers.dart';
import 'support/patrol_api.dart';

void main() {
  tearDown(() async {
    await closeTestDatabase();
  });

  patrolTest('F19/F24/F25: cash sale completes and syncs', ($) async {
    final api = PatrolApi();
    await api.signInOwner();
    // Ensure test product exists in the API before launching the app.
    await api.ensureTestProduct(
      sku: 'TEH-001',
      name: 'Es Teh Manis Melati',
      price: 5000,
      stock: 100,
      barcode: '8991234567892',
    );
    final salesBefore = await api.salesCount();
    final stockBefore = await api.stock('TEH-001');

    await launchApp($);
    await reachPos($);
    // Trigger catalog sync so products are available in the fresh test DB.
    await $.tester.tap(syncBadgeFinder().first);
    // Wait for sync to complete (cloud_done icon) before waiting for products.
    await waitForSyncComplete($);
    await waitForProduct($, 'Es Teh Manis Melati');

    await $.tester.tap(find.text('Es Teh Manis Melati').first);
    await $.tester.pump(const Duration(milliseconds: 300));

    await completeCashSale($);
    expect(find.text('Sale complete'), findsOneWidget);

    final deadline = DateTime.now().add(const Duration(seconds: 30));
    var synced = false;
    while (DateTime.now().isBefore(deadline)) {
      if ((await api.salesCount()) == salesBefore + 1 &&
          (await api.stock('TEH-001')) == stockBefore - 1) {
        synced = true;
        break;
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    expect(synced, isTrue,
        reason: 'sale should sync to the server and decrement stock');

    await $.tester.tap(find.text('New sale'));
    await $.tester.pump(const Duration(milliseconds: 300));
  });
}
