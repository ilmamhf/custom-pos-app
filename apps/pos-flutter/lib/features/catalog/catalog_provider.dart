/// Local catalog queries for the POS product grid.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_products.dart';

/// Current search text / scanned barcode.
final productQueryProvider = StateProvider<String>((ref) => '');

/// Active products matching [productQueryProvider].
///
/// An exact barcode/SKU match is returned alone so a scan jumps straight to the
/// product; otherwise a case-insensitive name/SKU search is used.
final catalogProvider = FutureProvider<List<LocalProduct>>((ref) async {
  final db = ref.watch(databaseProvider);
  final storeId = ref.watch(activeStoreIdProvider);
  final query = ref.watch(productQueryProvider).trim();
  if (query.isEmpty) {
    return db.productsDao.getAllActiveProducts(storeId: storeId);
  }

  final byBarcode =
      await db.productsDao.getProductByBarcode(query, storeId: storeId);
  if (byBarcode != null) return [byBarcode];

  final bySku = await db.productsDao.getProductBySku(query, storeId: storeId);
  if (bySku != null && bySku.isActive) return [bySku];

  return db.productsDao.searchProducts(query, storeId: storeId);
});
