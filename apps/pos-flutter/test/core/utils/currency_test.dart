/// Unit tests for integer-only currency math utilities.
/// Tests cover BPS calculations, tax, discounts, totals, and edge cases.

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/utils/currency.dart';

void main() {
  group('calculateBps', () {
    test('returns correct tax for standard 11% rate', () {
      // 18000 * 1100 / 10000 = 1980
      expect(calculateBps(18000, 1100), equals(1980));
    });

    test('returns 0 for zero amount', () {
      expect(calculateBps(0, 1100), equals(0));
    });

    test('returns 0 for zero rate', () {
      expect(calculateBps(18000, 0), equals(0));
    });

    test('returns 0 for negative amount', () {
      expect(calculateBps(-1000, 1100), equals(0));
    });

    test('returns 0 for negative rate', () {
      expect(calculateBps(18000, -1100), equals(0));
    });

    test('handles large amounts correctly', () {
      // 1,000,000 * 1100 / 10000 = 110,000
      expect(calculateBps(1000000, 1100), equals(110000));
    });

    test('truncates division correctly (no rounding)', () {
      // 10001 * 1100 / 10000 = 1100.11 -> truncates to 1100
      expect(calculateBps(10001, 1100), equals(1100));
    });

    test('works with 10% tax rate (1000 bps)', () {
      expect(calculateBps(20000, 1000), equals(2000));
    });

    test('works with 5% tax rate (500 bps)', () {
      expect(calculateBps(10000, 500), equals(500));
    });
  });

  group('calculateTax', () {
    test('delegates to calculateBps', () {
      expect(calculateTax(18000, 1100), equals(1980));
    });

    test('returns 0 for non-positive taxable amount', () {
      expect(calculateTax(0, 1100), equals(0));
      expect(calculateTax(-100, 1100), equals(0));
    });

    test('returns 0 for non-positive tax rate', () {
      expect(calculateTax(18000, 0), equals(0));
      expect(calculateTax(18000, -100), equals(0));
    });
  });

  group('calculateDiscount', () {
    test('calculates discount correctly', () {
      expect(calculateDiscount(18000, 1000), equals(1800)); // 10% off
    });

    test('returns 0 for non-positive base amount', () {
      expect(calculateDiscount(0, 1000), equals(0));
      expect(calculateDiscount(-100, 1000), equals(0));
    });

    test('returns 0 for non-positive discount rate', () {
      expect(calculateDiscount(18000, 0), equals(0));
      expect(calculateDiscount(18000, -100), equals(0));
    });
  });

  group('calculateItemTotal', () {
    test('calculates line total correctly', () {
      // 18000 * 2 = 36000, minus 1000 discount = 35000
      expect(calculateItemTotal(18000, 2, 1000), equals(35000));
    });

    test('returns 0 for zero quantity', () {
      expect(calculateItemTotal(18000, 0, 0), equals(0));
    });

    test('returns 0 for negative quantity', () {
      expect(calculateItemTotal(18000, -1, 0), equals(0));
    });

    test('clamps discount to not exceed gross', () {
      // Gross = 18000, discount = 20000 -> should clamp to 18000, result = 0
      expect(calculateItemTotal(18000, 1, 20000), equals(0));
    });

    test('handles zero discount', () {
      expect(calculateItemTotal(18000, 3, 0), equals(54000));
    });
  });

  group('calculateOrderDiscount', () {
    test('calculates order discount from subtotal', () {
      // Subtotal 100000, 5% discount (500 bps) = 5000
      expect(calculateOrderDiscount(100000, 500), equals(5000));
    });

    test('returns 0 for zero subtotal', () {
      expect(calculateOrderDiscount(0, 500), equals(0));
    });
  });

  group('calculateGrandTotal', () {
    test('computes grand total correctly', () {
      // Subtotal 36000 + Tax 3960 - Discount 1000 = 38960
      expect(
        calculateGrandTotal(subtotal: 36000, taxTotal: 3960, discountTotal: 1000),
        equals(38960),
      );
    });

    test('handles zero discount', () {
      expect(
        calculateGrandTotal(subtotal: 36000, taxTotal: 3960, discountTotal: 0),
        equals(39960),
      );
    });

    test('handles zero tax', () {
      expect(
        calculateGrandTotal(subtotal: 36000, taxTotal: 0, discountTotal: 1000),
        equals(35000),
      );
    });
  });

  group('calculateChange', () {
    test('returns correct change for cash payment', () {
      expect(calculateChange(50000, 38960), equals(11040));
    });

    test('returns 0 when amount tendered is less than total', () {
      expect(calculateChange(30000, 38960), equals(0));
    });

    test('returns 0 for exact payment', () {
      expect(calculateChange(38960, 38960), equals(0));
    });

    test('handles large amounts', () {
      expect(calculateChange(1000000, 999999), equals(1));
    });
  });

  group('splitPayment', () {
    test('splits evenly when divisible', () {
      expect(splitPayment(10000, 2), equals([5000, 5000]));
      expect(splitPayment(30000, 3), equals([10000, 10000, 10000]));
    });

    test('distributes remainder to first parts', () {
      // 10000 / 3 = 3333 remainder 1 -> [3334, 3333, 3333]
      expect(splitPayment(10000, 3), equals([3334, 3333, 3333]));
    });

    test('returns single part for parts <= 1', () {
      expect(splitPayment(10000, 1), equals([10000]));
      expect(splitPayment(10000, 0), equals([10000]));
      expect(splitPayment(10000, -1), equals([10000]));
    });

    test('returns zeros for zero total', () {
      expect(splitPayment(0, 3), equals([0, 0, 0]));
    });

    test('handles negative total', () {
      // Negative amounts get distributed similarly
      expect(splitPayment(-10000, 3), equals([-3334, -3333, -3333]));
    });
  });

  group('formatIdr', () {
    test('formats basic amounts correctly', () {
      expect(formatIdr(0), equals('Rp 0'));
      expect(formatIdr(1000), equals('Rp 1.000'));
      expect(formatIdr(18000), equals('Rp 18.000'));
      expect(formatIdr(100000), equals('Rp 100.000'));
      expect(formatIdr(1500000), equals('Rp 1.500.000'));
    });

    test('formats negative amounts', () {
      expect(formatIdr(-18000), equals('-Rp 18.000'));
      expect(formatIdr(-100000), equals('-Rp 100.000'));
    });

    test('can omit currency symbol', () {
      expect(formatIdr(18000, showSymbol: false), equals('18.000'));
    });

    test('handles large amounts', () {
      expect(formatIdr(1000000000), equals('Rp 1.000.000.000'));
    });
  });

  group('parseIdr', () {
    test('parses formatted strings', () {
      expect(parseIdr('Rp 18.000'), equals(18000));
      expect(parseIdr('Rp 1.500.000'), equals(1500000));
    });

    test('parses plain numbers', () {
      expect(parseIdr('18000'), equals(18000));
      expect(parseIdr('1500000'), equals(1500000));
    });

    test('parses negative amounts', () {
      expect(parseIdr('-Rp 18.000'), equals(-18000));
      expect(parseIdr('-18000'), equals(-18000));
    });

    test('returns 0 for invalid input', () {
      expect(parseIdr('abc'), equals(0));
      expect(parseIdr(''), equals(0));
      expect(parseIdr('Rp'), equals(0));
    });

    test('ignores non-numeric characters', () {
      expect(parseIdr('Rp 18,000.00'), equals(1800000));
    });
  });

  group('roundToNearest100', () {
    test('rounds down for remainder < 50', () {
      expect(roundToNearest100(18049), equals(18000));
      expect(roundToNearest100(18000), equals(18000));
    });

    test('rounds up for remainder >= 50', () {
      expect(roundToNearest100(18050), equals(18100));
      expect(roundToNearest100(18099), equals(18100));
    });

    test('handles negative amounts', () {
      expect(roundToNearest100(-18049), equals(-18000));
      expect(roundToNearest100(-18050), equals(-18100));
    });

    test('handles zero', () {
      expect(roundToNearest100(0), equals(0));
    });
  });

  group('isValidAmount', () {
    test('returns true for non-negative amounts', () {
      expect(isValidAmount(0), isTrue);
      expect(isValidAmount(1), isTrue);
      expect(isValidAmount(1000000), isTrue);
    });

    test('returns false for negative amounts', () {
      expect(isValidAmount(-1), isFalse);
      expect(isValidAmount(-100), isFalse);
    });
  });

  group('Integration scenarios', () {
    test('complete checkout calculation flow', () {
      // Scenario: 2 x Kopi Susu @ 18000, 1 x Roti @ 22000
      // Item 1: 18000 * 2 = 36000
      // Item 2: 22000 * 1 = 22000
      // Subtotal: 58000
      // Tax (11%): 58000 * 1100 / 10000 = 6380
      // Order discount (5%): 58000 * 500 / 10000 = 2900
      // Grand total: 58000 + 6380 - 2900 = 61480

      final item1Total = calculateItemTotal(18000, 2, 0);
      final item2Total = calculateItemTotal(22000, 1, 0);
      final subtotal = item1Total + item2Total;
      final tax = calculateTax(subtotal, 1100);
      final discount = calculateOrderDiscount(subtotal, 500);
      final grandTotal = calculateGrandTotal(
        subtotal: subtotal,
        taxTotal: tax,
        discountTotal: discount,
      );

      expect(item1Total, equals(36000));
      expect(item2Total, equals(22000));
      expect(subtotal, equals(58000));
      expect(tax, equals(6380));
      expect(discount, equals(2900));
      expect(grandTotal, equals(61480));

      // Cash payment with 100000 tendered
      final change = calculateChange(100000, grandTotal);
      expect(change, equals(38520));
    });

    test('split payment scenario', () {
      // Grand total 61480, split 3 ways (Cash + QRIS + Card)
      final parts = splitPayment(61480, 3);
      expect(parts.length, equals(3));
      expect(parts.reduce((a, b) => a + b), equals(61480));
      // 61480 / 3 = 20493 remainder 1 -> [20494, 20493, 20493]
      expect(parts[0], equals(20494));
      expect(parts[1], equals(20493));
      expect(parts[2], equals(20493));
    });
  });
}