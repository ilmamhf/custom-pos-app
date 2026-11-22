import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/app_database.dart';
import 'package:pos_flutter/core/database/database_provider.dart';
import 'package:pos_flutter/core/database/tables/local_products.dart';
import 'package:pos_flutter/features/catalog/catalog_provider.dart';

void main() {
  late AppDatabase db;
  late ProviderContainer container;

  setUp(() async {
    db = AppDatabase.inMemory();
    container = ProviderContainer(
      overrides: [databaseProvider.overrideWithValue(db)],
    );
    await db.productsDao.upsertProducts([
      LocalProduct(
        id: 'p1',
        sku: 'KOPI-001',
        barcode: '8991234567890',
        name: 'Kopi Susu Gula Aren',
        effectivePrice: 18000,
        stockOnHand: 10,
        isActive: true,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
      LocalProduct(
        id: 'p2',
        sku: 'ROTI-001',
        barcode: '8999876543210',
        name: 'Croissant Butter',
        effectivePrice: 22000,
        stockOnHand: 4,
        isActive: true,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
      LocalProduct(
        id: 'p3',
        sku: 'OLD-001',
        name: 'Discontinued Item',
        effectivePrice: 1000,
        stockOnHand: 0,
        isActive: false,
        updatedAt: DateTime.utc(2026, 11, 20),
      ),
    ]);
  });

  tearDown(() {
    container.dispose();
    db.close();
  });

  test('lists only active products when the query is empty', () async {
    final products = await container.read(catalogProvider.future);

    expect(products.map((p) => p.id), containsAll(['p1', 'p2']));
    expect(products.map((p) => p.id), isNot(contains('p3')));
  });

  test('finds a product by exact barcode', () async {
    container.read(productQueryProvider.notifier).state = '8999876543210';

    final products = await container.read(catalogProvider.future);

    expect(products, hasLength(1));
    expect(products.single.id, 'p2');
  });

  test('finds a product by exact SKU', () async {
    container.read(productQueryProvider.notifier).state = 'KOPI-001';

    final products = await container.read(catalogProvider.future);

    expect(products.single.id, 'p1');
  });

  test('searches by partial name', () async {
    container.read(productQueryProvider.notifier).state = 'crois';

    final products = await container.read(catalogProvider.future);

    expect(products.single.id, 'p2');
  });

  test('returns nothing for an unknown query', () async {
    container.read(productQueryProvider.notifier).state = 'nothing-matches';

    expect(await container.read(catalogProvider.future), isEmpty);
  });
}
