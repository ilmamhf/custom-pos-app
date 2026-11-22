/// DAO for local products table.

import '../app_database.dart';
import '../tables/local_products.dart';

/// Data access object for LocalProducts.
class ProductsDao {
  ProductsDao(this._db);

  final AppDatabase _db;

  /// Inserts or updates a product (upsert by primary key).
  Future<void> upsertProduct(LocalProduct product) async {
    _db.transaction(() {
      _db.execute('''
        INSERT OR REPLACE INTO local_products 
        (id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ''', [
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
    });
    await _db.flush();
  }

  /// Inserts or updates multiple products in a batch.
  Future<void> upsertProducts(List<LocalProduct> products) async {
    _db.transaction(() {
      for (final product in products) {
        _db.execute('''
          INSERT OR REPLACE INTO local_products 
          (id, sku, barcode, name, effective_price, stock_on_hand, is_active, updated_at, last_synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
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

  /// Gets a product by ID.
  Future<LocalProduct?> getProductById(String id) async {
    final rows = _db.select('SELECT * FROM local_products WHERE id = ?', [id]);
    if (rows.isEmpty) return null;
    return _rowToProduct(rows.first);
  }

  /// Gets a product by SKU.
  Future<LocalProduct?> getProductBySku(String sku) async {
    final rows = _db.select('SELECT * FROM local_products WHERE sku = ?', [sku]);
    if (rows.isEmpty) return null;
    return _rowToProduct(rows.first);
  }

  /// Gets a product by barcode.
  Future<LocalProduct?> getProductByBarcode(String barcode) async {
    final rows = _db.select(
      'SELECT * FROM local_products WHERE barcode = ? AND is_active = 1',
      [barcode],
    );
    if (rows.isEmpty) return null;
    return _rowToProduct(rows.first);
  }

  /// Searches products by name or SKU (case-insensitive).
  Future<List<LocalProduct>> searchProducts(String query, {int limit = 50}) async {
    final lowerQuery = query.toLowerCase();
    final rows = _db.select('''
      SELECT * FROM local_products 
      WHERE is_active = 1 
      AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)
      ORDER BY name ASC
      LIMIT ?
    ''', ['%$lowerQuery%', '%$lowerQuery%', limit]);
    return rows.map(_rowToProduct).toList();
  }

  /// Gets all active products.
  Future<List<LocalProduct>> getAllActiveProducts({int limit = 200}) async {
    final rows = _db.select('''
      SELECT * FROM local_products 
      WHERE is_active = 1 
      ORDER BY name ASC
      LIMIT ?
    ''', [limit]);
    return rows.map(_rowToProduct).toList();
  }

  /// Gets products with low stock (<= threshold).
  Future<List<LocalProduct>> getLowStockProducts(int threshold) async {
    final rows = _db.select('''
      SELECT * FROM local_products 
      WHERE is_active = 1 AND stock_on_hand <= ?
      ORDER BY stock_on_hand ASC
    ''', [threshold]);
    return rows.map(_rowToProduct).toList();
  }

  /// Gets products with negative stock (for reconciliation).
  Future<List<LocalProduct>> getNegativeStockProducts() async {
    final rows = _db.select('''
      SELECT * FROM local_products 
      WHERE is_active = 1 AND stock_on_hand < 0
      ORDER BY stock_on_hand ASC
    ''');
    return rows.map(_rowToProduct).toList();
  }

  /// Decrements stock for a product (used during checkout).
  /// Allows negative stock locally.
  Future<int> decrementStock(String productId, int quantity) async {
    final currentStock = _db.select('SELECT stock_on_hand FROM local_products WHERE id = ?', [productId]).first['stock_on_hand'] as int;
    return _db.update(
      'local_products',
      {'stock_on_hand': currentStock - quantity},
      'id = ?',
      [productId],
    );
  }

  /// Increments stock for a product (used for refunds/restocks).
  Future<int> incrementStock(String productId, int quantity) async {
    final currentStock = _db.select('SELECT stock_on_hand FROM local_products WHERE id = ?', [productId]).first['stock_on_hand'] as int;
    return _db.update(
      'local_products',
      {'stock_on_hand': currentStock + quantity},
      'id = ?',
      [productId],
    );
  }

  /// Sets stock to a specific value.
  Future<int> setStock(String productId, int stock) async {
    return _db.update(
      'local_products',
      {'stock_on_hand': stock},
      'id = ?',
      [productId],
    );
  }

  /// Gets the last synced timestamp for delta sync.
  Future<DateTime?> getLastSyncedAt() async {
    final rows = _db.select('''
      SELECT MAX(last_synced_at) as max_synced FROM local_products
    ''');
    if (rows.isEmpty || rows.first['max_synced'] == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(rows.first['max_synced'] as int);
  }

  /// Updates last synced timestamp for a product.
  Future<void> updateLastSynced(String productId, DateTime timestamp) async {
    _db.execute('''
      UPDATE local_products 
      SET last_synced_at = ?
      WHERE id = ?
    ''', [timestamp.millisecondsSinceEpoch, productId]);
  }

  /// Deletes all products (for full resync).
  Future<int> deleteAll() async {
    return _db.delete('local_products', '1=1', []);
  }

  LocalProduct _rowToProduct(Map<String, Object?> row) {
    return LocalProduct(
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