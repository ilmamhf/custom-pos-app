/// DAO for the store-scoped local products table.

import '../app_database.dart';
import '../tables/local_products.dart';

/// Data access object for LocalProducts.
///
/// Most methods accept an optional [storeId]. When supplied, the query is
/// restricted to that store; the catalog always supplies the active store so
/// two stores with different overrides never share a row.
class ProductsDao {
  ProductsDao(this._db);

  final AppDatabase _db;

  /// Inserts or updates a product (upsert by `(store_id, id)`).
  Future<void> upsertProduct(LocalProduct product) async {
    await upsertProducts([product]);
  }

  /// Inserts or updates multiple products in a batch.
  Future<void> upsertProducts(List<LocalProduct> products) async {
    _db.transaction(() {
      for (final product in products) {
        _db.execute('''
          INSERT OR REPLACE INTO local_products 
          (store_id, id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
          product.storeId,
          product.id,
          product.sku,
          product.barcode,
          product.name,
          product.effectivePrice,
          product.stockOnHand,
          product.isActive ? 1 : 0,
          product.updatedAt.millisecondsSinceEpoch,
          product.lastSyncedAt?.millisecondsSinceEpoch,
        ]);
      }
    });
    await _db.flush();
  }

  /// Gets a product by ID (optionally scoped to a store).
  Future<LocalProduct?> getProductById(String id, {String? storeId}) async {
    final rows = storeId == null
        ? _db.select('SELECT * FROM local_products WHERE id = ? LIMIT 1', [id])
        : _db.select(
            'SELECT * FROM local_products WHERE store_id = ? AND id = ?',
            [storeId, id],
          );
    if (rows.isEmpty) return null;
    return _rowToProduct(rows.first);
  }

  /// Gets a product by SKU within a store.
  Future<LocalProduct?> getProductBySku(String sku, {String? storeId}) async {
    final rows = storeId == null
        ? _db.select('SELECT * FROM local_products WHERE sku = ? LIMIT 1', [sku])
        : _db.select(
            'SELECT * FROM local_products WHERE store_id = ? AND sku = ?',
            [storeId, sku],
          );
    if (rows.isEmpty) return null;
    return _rowToProduct(rows.first);
  }

  /// Gets an active product by barcode within a store.
  Future<LocalProduct?> getProductByBarcode(
    String barcode, {
    String? storeId,
  }) async {
    final rows = storeId == null
        ? _db.select(
            'SELECT * FROM local_products WHERE barcode = ? AND is_active = 1 LIMIT 1',
            [barcode],
          )
        : _db.select(
            'SELECT * FROM local_products WHERE store_id = ? AND barcode = ? AND is_active = 1',
            [storeId, barcode],
          );
    if (rows.isEmpty) return null;
    return _rowToProduct(rows.first);
  }

  /// Searches active products by name or SKU (case-insensitive).
  Future<List<LocalProduct>> searchProducts(
    String query, {
    int limit = 50,
    String? storeId,
  }) async {
    final lowerQuery = query.toLowerCase();
    final args = <Object?>['%$lowerQuery%', '%$lowerQuery%'];
    var sql = '''
      SELECT * FROM local_products 
      WHERE is_active = 1 
      AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)
    ''';
    if (storeId != null) {
      sql += ' AND store_id = ?';
      args.add(storeId);
    }
    sql += ' ORDER BY name ASC LIMIT ?';
    args.add(limit);
    return _db.select(sql, args).map(_rowToProduct).toList();
  }

  /// Gets all active products for a store.
  Future<List<LocalProduct>> getAllActiveProducts({
    int limit = 200,
    String? storeId,
  }) async {
    final args = <Object?>[];
    var sql = 'SELECT * FROM local_products WHERE is_active = 1';
    if (storeId != null) {
      sql += ' AND store_id = ?';
      args.add(storeId);
    }
    sql += ' ORDER BY name ASC LIMIT ?';
    args.add(limit);
    return _db.select(sql, args).map(_rowToProduct).toList();
  }

  /// Gets products with low stock (<= threshold) for a store.
  Future<List<LocalProduct>> getLowStockProducts(
    int threshold, {
    String? storeId,
  }) async {
    final args = <Object?>[threshold];
    var sql = 'SELECT * FROM local_products WHERE is_active = 1 AND stock_on_hand <= ?';
    if (storeId != null) {
      sql += ' AND store_id = ?';
      args.add(storeId);
    }
    sql += ' ORDER BY stock_on_hand ASC';
    return _db.select(sql, args).map(_rowToProduct).toList();
  }

  /// Gets products with negative stock for a store.
  Future<List<LocalProduct>> getNegativeStockProducts({String? storeId}) async {
    final args = <Object?>[];
    var sql = 'SELECT * FROM local_products WHERE is_active = 1 AND stock_on_hand < 0';
    if (storeId != null) {
      sql += ' AND store_id = ?';
      args.add(storeId);
    }
    sql += ' ORDER BY stock_on_hand ASC';
    return _db.select(sql, args).map(_rowToProduct).toList();
  }

  /// Decrements stock for a product (used during checkout). Allows negative.
  Future<int> decrementStock(
    String productId,
    int quantity, {
    String? storeId,
  }) async {
    final where = storeId == null ? 'id = ?' : 'store_id = ? AND id = ?';
    final args = storeId == null
        ? <Object?>[quantity, productId]
        : <Object?>[quantity, storeId, productId];
    _db.execute(
      'UPDATE local_products SET stock_on_hand = stock_on_hand - ? WHERE $where',
      args,
    );
    return 0;
  }

  /// Increments stock for a product (used for refunds/restocks).
  Future<int> incrementStock(
    String productId,
    int quantity, {
    String? storeId,
  }) async {
    final where = storeId == null ? 'id = ?' : 'store_id = ? AND id = ?';
    final args = storeId == null
        ? <Object?>[quantity, productId]
        : <Object?>[quantity, storeId, productId];
    _db.execute(
      'UPDATE local_products SET stock_on_hand = stock_on_hand + ? WHERE $where',
      args,
    );
    return 0;
  }

  /// Sets stock to a specific value.
  Future<int> setStock(String productId, int stock, {String? storeId}) async {
    if (storeId == null) {
      return _db.update('local_products', {'stock_on_hand': stock}, 'id = ?', [productId]);
    }
    return _db.update(
      'local_products',
      {'stock_on_hand': stock},
      'store_id = ? AND id = ?',
      [storeId, productId],
    );
  }

  /// Gets the last synced timestamp for a store's catalog.
  Future<DateTime?> getLastSyncedAt({String? storeId}) async {
    final rows = storeId == null
        ? _db.select('SELECT MAX(last_synced_at) AS max_synced FROM local_products')
        : _db.select(
            'SELECT MAX(last_synced_at) AS max_synced FROM local_products WHERE store_id = ?',
            [storeId],
          );
    if (rows.isEmpty || rows.first['max_synced'] == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(rows.first['max_synced'] as int);
  }

  /// Updates last synced timestamp for a product.
  Future<void> updateLastSynced(
    String productId,
    DateTime timestamp, {
    String? storeId,
  }) async {
    if (storeId == null) {
      _db.execute(
        'UPDATE local_products SET last_synced_at = ? WHERE id = ?',
        [timestamp.millisecondsSinceEpoch, productId],
      );
    } else {
      _db.execute(
        'UPDATE local_products SET last_synced_at = ? WHERE store_id = ? AND id = ?',
        [timestamp.millisecondsSinceEpoch, storeId, productId],
      );
    }
  }

  /// Deletes all products (for full resync), optionally for one store.
  Future<int> deleteAll({String? storeId}) async {
    if (storeId == null) {
      return _db.delete('local_products', '1=1', []);
    }
    return _db.delete('local_products', 'store_id = ?', [storeId]);
  }

  /// Deletes a specific product from a store (used for tombstone processing).
  Future<int> deleteProduct({required String storeId, required String productId}) async {
    return _db.delete('local_products', 'store_id = ? AND id = ?', [storeId, productId]);
  }

  /// Deletes all products for a store that are NOT in the provided list.
  /// Used during full snapshot sync to remove products deleted on the server
  /// but for which we didn't receive a tombstone (e.g., deleted before the cursor).
  Future<int> deleteProductsNotInList({
    required String storeId,
    required Set<String> productIds,
  }) async {
    if (productIds.isEmpty) {
      return _db.delete('local_products', 'store_id = ?', [storeId]);
    }
    final placeholders = productIds.map((_) => '?').join(',');
    // Since we can't easily get affected rows from execute, we return 0 as count is not critical
    _db.execute(
      'DELETE FROM local_products WHERE store_id = ? AND id NOT IN ($placeholders)',
      <Object?>[storeId, ...productIds],
    );
    return 0;
  }

  LocalProduct _rowToProduct(Map<String, Object?> row) {
    return LocalProduct(
      storeId: row['store_id'] as String,
      id: row['id'] as String,
      sku: row['sku'] as String,
      barcode: row['barcode'] as String?,
      name: row['name'] as String,
      effectivePrice: row['effective_price'] as int,
      stockOnHand: row['stock_on_hand'] as int,
      isActive: (row['is_active'] as int) == 1,
      updatedAt: DateTime.fromMillisecondsSinceEpoch(row['updated_at'] as int),
      lastSyncedAt: row['last_synced_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(row['last_synced_at'] as int)
          : null,
    );
  }
}
