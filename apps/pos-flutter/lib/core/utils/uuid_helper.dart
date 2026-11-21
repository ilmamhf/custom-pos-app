/// UUID v4 generation helper for client-side ID generation.
/// Uses the `uuid` package to generate RFC 4122 compliant UUIDs.

import 'package:uuid/uuid.dart';

/// Singleton UUID generator instance.
final _uuid = Uuid();

/// Generates a new random UUID v4 string (lowercase, with hyphens).
/// Used for client-side IDs: shifts, sales, sale_items, sync_outbox entries.
String generateUuid() => _uuid.v4();

/// Generates a deterministic receipt number: {STORE_CODE}-{YYYYMMDD}-{SEQ}
/// Example: BKS-20261121-0042
String generateReceiptNo({
  required String storeCode,
  required DateTime date,
  required int sequence,
}) {
  final dateStr = '${date.year}${date.month.toString().padLeft(2, '0')}${date.day.toString().padLeft(2, '0')}';
  final seqStr = sequence.toString().padLeft(4, '0');
  return '${storeCode.toUpperCase()}-$dateStr-$seqStr';
}

/// Validates if a string is a valid UUID v4 format.
bool isValidUuid(String value) {
  final uuidRegex = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    caseSensitive: false,
  );
  return uuidRegex.hasMatch(value);
}