import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

import 'support/app_helpers.dart';
import 'support/patrol_api.dart';

void main() {
  patrolTest('F17/F34: admin price change reaches POS after sync', ($) async {
    final api = PatrolApi();
    await api.signInOwner();

    await api.setPrice('TEH-001', 14000);
    try {
      await launchApp($);
      await reachPos($);
      await waitForProduct($, 'Es Teh Manis Melati');

      // Change it again while the catalog is already rendered, then sync.
      await api.setPrice('TEH-001', 15000);
      await $.tester.tap(syncBadgeFinder().first);

      await pumpUntil($.tester, find.text('Rp 15.000'),
          timeout: const Duration(seconds: 30), reason: 'synced price');
      expect(find.text('Rp 15.000'), findsWidgets);
    } finally {
      await api.setPrice('TEH-001', null);
    }
  });
}
