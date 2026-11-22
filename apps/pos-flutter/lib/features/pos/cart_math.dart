/// Pure cart and tax arithmetic for the POS checkout.
///
/// All money values are integer IDR. Tax and discounts use basis points
/// (`10000` bps = 100%), matching `lib/core/utils/currency.dart`.

import '../../core/utils/currency.dart';

/// One line in the cart. `itemDiscount` is an absolute integer amount.
class CartLine {
  const CartLine({
    required this.productId,
    required this.name,
    required this.unitPrice,
    required this.qty,
    this.itemDiscount = 0,
  });

  final String productId;
  final String name;
  final int unitPrice;
  final int qty;
  final int itemDiscount;

  /// Price × quantity before any discount.
  int get gross => unitPrice * qty;

  /// Gross minus the clamped item discount.
  int get net => calculateItemTotal(unitPrice, qty, itemDiscount);

  CartLine copyWith({int? qty, int? itemDiscount}) {
    return CartLine(
      productId: productId,
      name: name,
      unitPrice: unitPrice,
      qty: qty ?? this.qty,
      itemDiscount: itemDiscount ?? this.itemDiscount,
    );
  }
}

/// Immutable cart state with all derived totals.
class CartState {
  const CartState({
    this.lines = const [],
    this.orderDiscountBps = 0,
    this.taxRateBps = 0,
  });

  final List<CartLine> lines;
  final int orderDiscountBps;
  final int taxRateBps;

  bool get isEmpty => lines.isEmpty;

  /// Total number of units, used for the cart badge.
  int get itemCount => lines.fold(0, (sum, line) => sum + line.qty);

  /// Sum of line gross amounts, stored as `subtotal` on the sale.
  int get subtotal => lines.fold(0, (sum, line) => sum + line.gross);

  /// Sum of per-line discounts.
  int get itemDiscountTotal =>
      lines.fold(0, (sum, line) => sum + (line.gross - line.net));

  /// Sum of line totals after item discounts (order discount not applied).
  int get linesNetTotal => lines.fold(0, (sum, line) => sum + line.net);

  /// Order-level discount computed on the post-item-discount amount.
  int get orderDiscountAmount =>
      calculateOrderDiscount(linesNetTotal, orderDiscountBps);

  /// Everything subtracted from `subtotal` (item + order discounts).
  int get discountTotal => itemDiscountTotal + orderDiscountAmount;

  /// Amount tax is computed on.
  int get taxableAmount => linesNetTotal - orderDiscountAmount;

  /// Tax using integer basis-point math.
  int get taxTotal => calculateTax(taxableAmount, taxRateBps);

  /// Final amount due.
  int get grandTotal => calculateGrandTotal(
        subtotal: subtotal,
        taxTotal: taxTotal,
        discountTotal: discountTotal,
      );

  /// Tax split across lines, summing exactly to [taxTotal].
  List<int> get allocatedTax =>
      allocateProportionally(taxTotal, lines.map((l) => l.net).toList());

  CartState copyWith({
    List<CartLine>? lines,
    int? orderDiscountBps,
    int? taxRateBps,
  }) {
    return CartState(
      lines: lines ?? this.lines,
      orderDiscountBps: orderDiscountBps ?? this.orderDiscountBps,
      taxRateBps: taxRateBps ?? this.taxRateBps,
    );
  }
}

/// Splits [total] across [weights] so the parts sum exactly to [total].///
/// Used to allocate sale-level tax to sale items without losing or inventing
/// a single rupiah. Ties go to the earliest line.
List<int> allocateProportionally(int total, List<int> weights) {
  if (weights.isEmpty) return const [];
  final sum = weights.fold(0, (a, b) => a + b);
  if (total <= 0 || sum <= 0) return List.filled(weights.length, 0);

  final parts = List<int>.generate(
    weights.length,
    (i) => (total * weights[i]) ~/ sum,
  );
  var remainder = total - parts.fold(0, (a, b) => a + b);
  if (remainder == 0) return parts;

  final order = List<int>.generate(weights.length, (i) => i)
    ..sort((a, b) {
      final ra = (total * weights[a]) % sum;
      final rb = (total * weights[b]) % sum;
      final byRemainder = rb.compareTo(ra);
      return byRemainder != 0 ? byRemainder : a.compareTo(b);
    });

  var index = 0;
  while (remainder > 0) {
    parts[order[index % order.length]]++;
    remainder--;
    index++;
  }
  return parts;
}

/// Rounds [amount] up to the next multiple of [step] (no-op when already on a
/// multiple or when [step] is not positive).
int roundUpToStep(int amount, int step) {
  if (step <= 0) return amount;
  final remainder = amount % step;
  return remainder == 0 ? amount : amount + (step - remainder);
}

/// Cash amounts to offer as one-tap buttons for [total].
///
/// Always includes the exact total, then common Indonesian note sizes rounded
/// up from the total. Values below the total and duplicates are removed.
List<int> suggestedCashAmounts(int total) {
  if (total <= 0) return const [];
  final candidates = <int>{
    total,
    roundUpToStep(total, 5000),
    roundUpToStep(total, 10000),
    roundUpToStep(total, 50000),
    roundUpToStep(total, 100000),
  };
  final suggestions = candidates.where((amount) => amount >= total).toList()
    ..sort();
  return suggestions.take(4).toList();
}
