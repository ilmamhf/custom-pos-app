/// Critical POS flow against the real API and a real browser.
///
/// Run with:
///   flutter drive --driver=test_driver/integration_test.dart \
///     --target=integration_test/pos_critical_flow_test.dart \
///     -d chrome --headless \
///     --dart-define=API_BASE_URL=http://localhost:3100/api/v1
///
/// The API must be running against the `pos_e2e` database
/// (see e2e/scripts/setup-db.mjs).

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:pos_flutter/main.dart' as app;

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3100/api/v1',
);

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
  Duration timeout = const Duration(seconds: 30),
  String? reason,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for ${reason ?? finder.toString()}');
}

/// Opens the payment dialog and waits for the "Complete Sale" button.
///
/// The cart bottom sheet slides up. A tap that lands mid-animation can hit
/// the modal barrier and dismiss the sheet instead of pressing "Charge",
/// which shows up as a flaky "Complete Sale" timeout. Let the sheet settle,
/// then retry the tap if the dialog does not appear.
Future<void> openCheckout(WidgetTester tester) async {
  final cartBar = find.byKey(const Key('mobile-cart-bar'));
  final chargeButton = find.textContaining('Charge');
  final completeSale = find.textContaining('Complete Sale');

  for (var attempt = 0; attempt < 3; attempt++) {
    await tester.pump(const Duration(milliseconds: 400));
    if (chargeButton.evaluate().isEmpty) {
      if (cartBar.evaluate().isEmpty) {
        throw TestFailure('cart bar not found while opening checkout');
      }
      await tester.tap(cartBar);
      await pumpUntil(tester, chargeButton, reason: 'charge button');
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.tap(chargeButton.first);
    final deadline = DateTime.now().add(const Duration(seconds: 10));
    while (DateTime.now().isBefore(deadline)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (completeSale.evaluate().isNotEmpty) return;
    }
  }
  throw TestFailure('payment dialog did not open after 3 attempts');
}

Finder syncBadgeFinder() {
  return find.byWidgetPredicate((widget) {
    if (widget is! IconButton) return false;
    final icon = widget.icon;
    return icon is Icon && _syncIcons.contains(icon.icon);
  });
}

class Api {
  Api() : _dio = Dio(BaseOptions(baseUrl: apiBaseUrl));

  final Dio _dio;
  late String ownerToken;
  late String storeId;
  late String storeCode;
  late String productId;

  Future<void> signInOwner() async {
    final res = await _dio.post('/auth/login', data: {
      'email': 'owner@toko.id',
      'password': 'password123',
    });
    ownerToken = res.data['accessToken'] as String;
    final stores = (res.data['stores'] as List).cast<Map<String, dynamic>>();
    final bks = stores.firstWhere((s) => s['code'] == 'BKS');
    storeId = bks['id'] as String;
    storeCode = bks['code'] as String;

    final products = await _dio.get('/products', queryParameters: {
      'storeId': storeId,
      'search': 'TEH-001',
    }, options: _auth());
    final items = (products.data['items'] as List).cast<Map<String, dynamic>>();
    productId = items.first['id'] as String;
  }

  Options _auth({bool withStore = false}) {
    return Options(headers: {
      'Authorization': 'Bearer $ownerToken',
      if (withStore) 'X-Store-Id': storeId,
    });
  }

  Future<void> setTehPrice(int price) async {
    await _dio.put(
      '/stores/$storeId/products/$productId/price',
      data: {'priceOverride': price},
      options: _auth(withStore: true),
    );
  }

  Future<int> salesCount() async {
    final res = await _dio.get(
      '/sales',
      queryParameters: {'storeId': storeId, 'limit': 100},
      options: _auth(),
    );
    return res.data['total'] as int;
  }

  Future<int> tehStock() async {
    final res = await _dio.get('/products', queryParameters: {
      'storeId': storeId,
      'search': 'TEH-001',
    }, options: _auth());
    final items = (res.data['items'] as List).cast<Map<String, dynamic>>();
    return items.first['stockOnHand'] as int;
  }

  Future<bool> latestShiftClosed() async {
    final res = await _dio.get(
      '/shifts',
      queryParameters: {'storeId': storeId, 'limit': 10},
      options: _auth(),
    );
    final items = (res.data['items'] as List).cast<Map<String, dynamic>>();
    if (items.isEmpty) return false;
    return items.first['closedAt'] != null;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('critical POS flow: login → shift → price sync → sale → close',
      (tester) async {
    final api = Api();
    await api.signInOwner();

    final salesBefore = await api.salesCount();
    final stockBefore = await api.tehStock();

    app.main();
    await tester.pump(const Duration(seconds: 1));
    // Login.
    await pumpUntil(tester, find.text('Sign in to continue'));
    await tester.enterText(
        find.byType(TextFormField).at(0), 'kasir1@toko.id');
    await tester.pump();
    await tester.enterText(
        find.byType(TextFormField).at(1), 'password123');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
    await pumpUntil(tester, find.text('Select Store'),
        reason: 'store selector');

    // Select store.
    await tester.tap(find.text('Cabang Bekasi'));
    await pumpUntil(tester, find.text('Shift Management'),
        reason: 'shift screen');

    // Open shift (or continue to POS if one is already open).
    if (find.text('No Active Shift').evaluate().isNotEmpty) {
      await tester.tap(find.text('Open New Shift'));
      await pumpUntil(tester, find.widgetWithText(FilledButton, 'Open Shift'));
      await tester.enterText(find.byType(TextFormField).last, '0');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Open Shift'));
    } else {
      await tester.tap(find.text('Continue to POS'));
    }

    await pumpUntil(tester, find.text('Scan barcode or search products'),
        timeout: const Duration(seconds: 45), reason: 'POS catalog');
    await pumpUntil(tester, find.text('Es Teh Manis Melati'),
        timeout: const Duration(seconds: 45), reason: 'seeded product');

    // Admin price change must reach the POS after a sync.
    await api.setTehPrice(13000);
    await tester.tap(syncBadgeFinder());
    await pumpUntil(tester, find.text('Rp 13.000'),
        timeout: const Duration(seconds: 30), reason: 'synced price');

    // Cash sale.
    await tester.tap(find.text('Es Teh Manis Melati').first);
    await tester.pump(const Duration(milliseconds: 300));

    await openCheckout(tester);
    await tester.tap(find.textContaining('Complete Sale').first);
    await pumpUntil(tester, find.text('Sale complete'),
        timeout: const Duration(seconds: 30), reason: 'sale complete');

    // Server acknowledgment: one more sale, one less unit of stock.
    final saleDeadline = DateTime.now().add(const Duration(seconds: 30));
    var synced = false;
    while (DateTime.now().isBefore(saleDeadline)) {
      if ((await api.salesCount()) == salesBefore + 1 &&
          (await api.tehStock()) == stockBefore - 1) {
        synced = true;
        break;
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    expect(synced, isTrue,
        reason: 'sale should sync to the server and decrement stock');

    await tester.tap(find.text('New sale'));
    await tester.pump(const Duration(milliseconds: 300));

    // Close shift.
    await tester.tap(find.byTooltip('Shift'));
    await pumpUntil(tester, find.text('Shift Management'));
    await tester.tap(find.widgetWithText(FilledButton, 'Close Shift'));
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Close Shift'));
    await tester.enterText(find.byType(TextFormField).last, '0');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Close Shift').last);
    await pumpUntil(tester, find.text('No Active Shift'),
        timeout: const Duration(seconds: 30), reason: 'shift closed UI');

    final shiftDeadline = DateTime.now().add(const Duration(seconds: 30));
    var closed = false;
    while (DateTime.now().isBefore(shiftDeadline)) {
      if (await api.latestShiftClosed()) {
        closed = true;
        break;
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    expect(closed, isTrue, reason: 'shift close should sync to the server');
  });
}
