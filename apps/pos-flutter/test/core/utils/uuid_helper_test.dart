/// Unit tests for UUID helper utilities.

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/utils/uuid_helper.dart';

void main() {
  group('generateUuid', () {
    test('generates a valid UUID v4 format', () {
      final uuid = generateUuid();
      expect(isValidUuid(uuid), isTrue);
    });

    test('generates unique UUIDs on each call', () {
      final uuids = <String>{};
      for (int i = 0; i < 100; i++) {
        uuids.add(generateUuid());
      }
      // All 100 should be unique (extremely high probability)
      expect(uuids.length, equals(100));
    });

    test('returns lowercase UUID with hyphens', () {
      final uuid = generateUuid();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where y is 8, 9, a, or b
      expect(uuid, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    });
  });

  group('generateReceiptNo', () {
    test('generates correct format with store code, date, and sequence', () {
      final date = DateTime(2026, 11, 21);
      final receiptNo = generateReceiptNo(
        storeCode: 'BKS',
        date: date,
        sequence: 42,
      );
      expect(receiptNo, equals('BKS-20261121-0042'));
    });

    test('handles single digit month and day', () {
      final date = DateTime(2026, 1, 5);
      final receiptNo = generateReceiptNo(
        storeCode: 'KMG',
        date: date,
        sequence: 1,
      );
      expect(receiptNo, equals('KMG-20260105-0001'));
    });

    test('handles larger sequence numbers', () {
      final date = DateTime(2026, 12, 31);
      final receiptNo = generateReceiptNo(
        storeCode: 'SBY',
        date: date,
        sequence: 9999,
      );
      expect(receiptNo, equals('SBY-20261231-9999'));
    });

    test('converts store code to uppercase', () {
      final date = DateTime(2026, 11, 21);
      final receiptNo = generateReceiptNo(
        storeCode: 'bks',
        date: date,
        sequence: 1,
      );
      expect(receiptNo, equals('BKS-20261121-0001'));
    });
  });

  group('isValidUuid', () {
    test('returns true for valid UUID v4', () {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), isTrue);
      expect(isValidUuid('6ba7b810-9dad-41d4-8004-5829e40953c1'), isTrue);
      expect(isValidUuid('6ba7b811-9dad-41d4-8004-5829e40953c1'), isTrue);
    });

    test('returns false for invalid UUIDs', () {
      expect(isValidUuid('not-a-uuid'), isFalse);
      expect(isValidUuid(''), isFalse);
      expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000'), isFalse); // too short
      expect(isValidUuid('550e8400-e29b-41d4-a716-4466554400000'), isFalse); // too long
      expect(isValidUuid('550e8400-e29b-51d4-a716-446655440000'), isFalse); // version not 4
      expect(isValidUuid('550e8400-e29b-41d4-c716-446655440000'), isFalse); // variant not 8/9/a/b
    });

    test('is case insensitive', () {
      expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000'), isTrue);
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), isTrue);
    });
  });
}