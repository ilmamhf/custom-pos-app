import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/app_database.dart';
import 'package:pos_flutter/core/database/database_provider.dart';
import 'package:pos_flutter/core/database/tables/local_products.dart';
import 'package:pos_flutter/core/database/tables/local_shifts.dart';
import 'package:pos_flutter/core/theme/app_theme.dart';
import 'package:pos_flutter/features/auth/auth_provider.dart';
import 'package:pos_flutter/features/pos/pos_screen.dart';
import 'package:pos_flutter/features/shift/shift_provider.dart';

const _store = UserStore(
  id: 'store-1',
  name: 'Cabang Bekasi',
  code: 'BKS',
  taxRateBps: 1100,
);
const _user = User(id: 'user-1', name: 'Budi', role: 'CASHIER');
const _auth = AuthState(
  user: _user,
  stores: [_store],
  selectedStore: _store,
);

void main() {
  late AppDatabase db;
  late LocalShift shift;

  setUp(() async {
    db = AppDatabase.inMemory();
    await db.productsDao.upsertProduct(
      LocalProduct(
        id: 'prod-1',
        sku: 'KOPI-001',
        barcode: '8991234567890',
        name: 'Kopi Susu',
        effectivePrice: 18000,
        stockOnHand: 10,
        isActive: true,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
    );
    shift = LocalShift(
      id: 'shift-1',
      storeId: _store.id,
      userId: _user.id,
      openedAt: DateTime.utc(2026, 11, 22, 8),
      openingCash: 500000,
    );
    await db.shiftsDao.openShift(shift);
  });

  tearDown(() => db.close());

  Future<void> pumpPos(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWithValue(db),
          shiftAuthProvider.overrideWithValue(_auth),
        ],
        child: MaterialApp(
          theme: buildLightTheme(),
          home: const PosScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('tap product, pay cash, and persist the sale offline',
      (tester) async {
    await pumpPos(tester);

    expect(find.text('Kopi Susu'), findsOneWidget);

    await tester.tap(find.text('Kopi Susu'));
    await tester.pumpAndSettle();

    // Cart line + charge button (18.000 + 11% tax = 19.980).
    expect(find.text('Kopi Susu'), findsNWidgets(2));
    expect(find.textContaining('Charge Rp 19.980'), findsOneWidget);

    await tester.tap(find.textContaining('Charge Rp 19.980'));
    await tester.pumpAndSettle();

    expect(find.text('Payment'), findsOneWidget);
    expect(find.text('Rp 19.980'), findsWidgets);

    await tester.tap(find.textContaining('Complete Sale'));
    await tester.pumpAndSettle();

    expect(find.text('Sale complete'), findsOneWidget);

    final sales = await db.salesDao.getSalesForShift(shift.id);
    expect(sales, hasLength(1));
    expect(sales.single.grandTotal, 19980);
    expect(sales.single.paymentMethod.name, 'cash');
    expect((await db.productsDao.getProductById('prod-1'))!.stockOnHand, 9);

    // Shift open + sale both queued for sync.
    expect(await db.syncDao.getPendingEntries(), hasLength(2));
  });

  testWidgets('barcode submit adds the product to the cart', (tester) async {
    await pumpPos(tester);

    await tester.enterText(
      find.byType(TextField).first,
      '8991234567890',
    );
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(find.textContaining('Charge Rp 19.980'), findsOneWidget);
  });

  testWidgets('quantity buttons update the cart total', (tester) async {
    await pumpPos(tester);

    await tester.tap(find.text('Kopi Susu'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();

    expect(find.textContaining('Charge Rp 39.960'), findsOneWidget);
  });

  testWidgets('empty cart cannot be charged', (tester) async {
    await pumpPos(tester);

    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Add items to charge'),
    );
    expect(button.onPressed, isNull);
  });
}
