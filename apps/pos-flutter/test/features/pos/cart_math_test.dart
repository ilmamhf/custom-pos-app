import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/features/pos/cart_math.dart';

void main() {
  group('allocateProportionally', () {
    test('parts always sum to the total', () {
      final parts = allocateProportionally(3960, [18000, 9000, 1000]);
      expect(parts.fold(0, (a, b) => a + b), 3960);
      expect(parts.every((p) => p >= 0), isTrue);
    });

    test('weights the largest line the most', () {
      final parts = allocateProportionally(1000, [3, 1]);
      expect(parts[0], greaterThan(parts[1]));
    });

    test('returns zeros for zero total or zero weights', () {
      expect(allocateProportionally(0, [1, 2]), [0, 0]);
      expect(allocateProportionally(100, [0, 0]), [0, 0]);
    });

    test('returns empty for empty weights', () {
      expect(allocateProportionally(100, const []), isEmpty);
    });

    test('distributes remainder without inventing money', () {
      final parts = allocateProportionally(100, [1, 1, 1]);
      expect(parts.fold(0, (a, b) => a + b), 100);
      expect(parts, [34, 33, 33]);
    });
  });

  group('roundUpToStep', () {
    test('keeps multiples unchanged', () {
      expect(roundUpToStep(50000, 10000), 50000);
    });

    test('rounds up to the next step', () {
      expect(roundUpToStep(39960, 50000), 50000);
      expect(roundUpToStep(50001, 50000), 100000);
    });

    test('ignores non-positive steps', () {
      expect(roundUpToStep(39960, 0), 39960);
    });
  });

  group('suggestedCashAmounts', () {
    test('includes the exact total first', () {
      final suggestions = suggestedCashAmounts(39960);
      expect(suggestions.first, 39960);
      expect(suggestions, contains(40000));
      expect(suggestions, contains(50000));
    });

    test('never suggests less than the total', () {
      for (final total in [1, 999, 39960, 123456]) {
        expect(
          suggestedCashAmounts(total).every((amount) => amount >= total),
          isTrue,
          reason: 'total $total',
        );
      }
    });

    test('returns empty for a non-positive total', () {
      expect(suggestedCashAmounts(0), isEmpty);
    });
  });

  group('CartState', () {
    test('computes item totals, tax and grand total with integer math', () {
      const cart = CartState(
        lines: [
          CartLine(productId: 'p1', name: 'Kopi', unitPrice: 18000, qty: 2),
          CartLine(productId: 'p2', name: 'Roti', unitPrice: 22000, qty: 1),
        ],
        taxRateBps: 1100,
      );

      expect(cart.subtotal, 58000);
      expect(cart.itemDiscountTotal, 0);
      expect(cart.discountTotal, 0);
      expect(cart.taxableAmount, 58000);
      expect(cart.taxTotal, 6380);
      expect(cart.grandTotal, 64380);
      expect(cart.itemCount, 3);
    });

    test('applies item discounts before tax', () {
      const cart = CartState(
        lines: [
          CartLine(
            productId: 'p1',
            name: 'Kopi',
            unitPrice: 18000,
            qty: 2,
            itemDiscount: 6000,
          ),
        ],
        taxRateBps: 1100,
      );

      expect(cart.subtotal, 36000);
      expect(cart.itemDiscountTotal, 6000);
      expect(cart.taxableAmount, 30000);
      expect(cart.taxTotal, 3300);
      expect(cart.grandTotal, 33300);
    });

    test('applies order discount on top of item discounts', () {
      const cart = CartState(
        lines: [
          CartLine(
            productId: 'p1',
            name: 'Kopi',
            unitPrice: 18000,
            qty: 2,
            itemDiscount: 6000,
          ),
        ],
        orderDiscountBps: 1000,
        taxRateBps: 1100,
      );

      expect(cart.orderDiscountAmount, 3000);
      expect(cart.discountTotal, 9000);
      expect(cart.taxableAmount, 27000);
      expect(cart.taxTotal, 2970);
      expect(cart.grandTotal, 29970);
    });

    test('allocated tax sums to taxTotal', () {
      const cart = CartState(
        lines: [
          CartLine(productId: 'p1', name: 'A', unitPrice: 3333, qty: 1),
          CartLine(productId: 'p2', name: 'B', unitPrice: 7777, qty: 1),
          CartLine(productId: 'p3', name: 'C', unitPrice: 1000, qty: 1),
        ],
        taxRateBps: 1100,
      );

      final allocated = cart.allocatedTax;
      expect(allocated.fold(0, (a, b) => a + b), cart.taxTotal);
      expect(allocated, hasLength(3));
    });

    test('empty cart has zero totals', () {
      const cart = CartState(taxRateBps: 1100);

      expect(cart.isEmpty, isTrue);
      expect(cart.subtotal, 0);
      expect(cart.taxTotal, 0);
      expect(cart.grandTotal, 0);
    });
  });
}
