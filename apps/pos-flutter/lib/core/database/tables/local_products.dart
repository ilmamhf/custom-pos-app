/// Local products table for offline-first product catalog.
/// Synced from server via GET /sync/pull.

import 'package:drift/drift.dart';

/// Represents a product in the local catalog.
/// Contains effective price (with store override) and stock on hand.
class LocalProducts extends Table {
  /// Primary key - product UUID from server.
  TextColumn get id => text().withLength(min: 36, max: 36)();

  /// Product SKU (unique).
  TextColumn get sku => text().withLength(min: 1, max: 50)();

  /// Barcode for scanning (nullable).
  TextColumn get barcode => text().nullable().withLength(max: 64)();

  /// Product name.
  TextColumn get name => text().withLength(min: 1, max: 150)();

  /// Effective price for this store (base_price or price_override).
  /// Stored as integer IDR (smallest currency unit).
  IntColumn get effectivePrice => integer()();

  /// Current stock on hand for this store.
  /// Can go negative locally (offline sales allowed).
  IntColumn get stockOnHand => integer().withDefault(const Constant(0))();

  /// Whether the product is active.
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();

  /// Server-side updated_at timestamp for delta sync.
  DateTimeColumn get updatedAt => dateTime()();

  /// Local last synced timestamp.
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Data class for LocalProducts rows.
class LocalProduct {
  const LocalProduct({
    required this.id,
    required this.sku,
    this.barcode,
    required this.name,
    required this.effectivePrice,
    required this.stockOnHand,
    required this.isActive,
    required this.updatedAt,
    this.lastSyncedAt,
  });

  final String id;
  final String sku;
  final String? barcode;
  final String name;
  final int effectivePrice;
  final int stockOnHand;
  final bool isActive;
  final DateTime updatedAt;
  final DateTime? lastSyncedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalProduct &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          sku == other.sku &&
          barcode == other.barcode &&
          name == other.name &&
          effectivePrice == other.effectivePrice &&
          stockOnHand == other.stockOnHand &&
          isActive == other.isActive &&
          updatedAt == other.updatedAt &&
          lastSyncedAt == other.lastSyncedAt);

  @override
  int get hashCode => Object.hash(
        id,
        sku,
        barcode,
        name,
        effectivePrice,
        stockOnHand,
        isActive,
        updatedAt,
        lastSyncedAt,
      );

  @override
  String toString() =>
      'LocalProduct(id: $id, sku: $sku, name: $name, price: $effectivePrice, stock: $stockOnHand)';
}