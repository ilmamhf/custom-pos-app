/// Cart state for the POS checkout.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/app_config.dart';
import '../../core/database/tables/local_products.dart';
import '../shift/shift_provider.dart';
import 'cart_math.dart';

/// Mutable cart controller.
class CartNotifier extends StateNotifier<CartState> {
  CartNotifier({required int taxRateBps})
      : super(CartState(taxRateBps: taxRateBps));

  /// Adds one unit of [product], or increments an existing line.
  void addProduct(LocalProduct product) {
    final index = state.lines.indexWhere((l) => l.productId == product.id);
    if (index >= 0) {
      increment(product.id);
      return;
    }
    state = state.copyWith(
      lines: [
        ...state.lines,
        CartLine(
          productId: product.id,
          name: product.name,
          unitPrice: product.effectivePrice,
          qty: 1,
        ),
      ],
    );
  }

  /// Adds [qty] units of a known line (used by tests and barcode flows).
  void addLine(CartLine line) {
    final index = state.lines.indexWhere((l) => l.productId == line.productId);
    if (index >= 0) {
      final existing = state.lines[index];
      final merged = existing.copyWith(qty: existing.qty + line.qty);
      state = state.copyWith(lines: _replace(index, merged));
      return;
    }
    state = state.copyWith(lines: [...state.lines, line]);
  }

  void increment(String productId) {
    final index = state.lines.indexWhere((l) => l.productId == productId);
    if (index < 0) return;
    final line = state.lines[index];
    state = state.copyWith(
      lines: _replace(index, line.copyWith(qty: line.qty + 1)),
    );
  }

  /// Decrements quantity, removing the line when it reaches zero.
  void decrement(String productId) {
    final index = state.lines.indexWhere((l) => l.productId == productId);
    if (index < 0) return;
    final line = state.lines[index];
    if (line.qty <= 1) {
      remove(productId);
      return;
    }
    state = state.copyWith(
      lines: _replace(index, line.copyWith(qty: line.qty - 1)),
    );
  }

  void setQty(String productId, int qty) {
    if (qty <= 0) {
      remove(productId);
      return;
    }
    final index = state.lines.indexWhere((l) => l.productId == productId);
    if (index < 0) return;
    state = state.copyWith(
      lines: _replace(index, state.lines[index].copyWith(qty: qty)),
    );
  }

  void remove(String productId) {
    state = state.copyWith(
      lines: state.lines.where((l) => l.productId != productId).toList(),
    );
  }

  /// Sets an absolute item discount, clamped to the line gross amount.
  void setItemDiscount(String productId, int amount) {
    final index = state.lines.indexWhere((l) => l.productId == productId);
    if (index < 0) return;
    final line = state.lines[index];
    final clamped = amount.clamp(0, line.gross);
    state = state.copyWith(
      lines: _replace(index, line.copyWith(itemDiscount: clamped)),
    );
  }

  /// Applies authoritative store prices after a sync pull.
  ///
  /// Lines keep their quantity and item discount (re-clamped to the new
  /// gross). This matters because the server recomputes sale prices from the
  /// catalog, so a stale cart price would otherwise disagree with the receipt.
  void applyPrices(Map<String, int> prices) {
    var changed = false;
    final lines = state.lines.map((line) {
      final price = prices[line.productId];
      if (price == null || price == line.unitPrice) return line;

      changed = true;
      final maxDiscount = price * line.qty;
      final discount =
          line.itemDiscount > maxDiscount ? maxDiscount : line.itemDiscount;
      return CartLine(
        productId: line.productId,
        name: line.name,
        unitPrice: price,
        qty: line.qty,
        itemDiscount: discount,
      );
    }).toList();

    if (changed) {
      state = state.copyWith(lines: lines);
    }
  }

  /// Sets the order discount in basis points (0–10000).
  void setOrderDiscountBps(int bps) {
    state = state.copyWith(orderDiscountBps: bps.clamp(0, 10000));
  }

  void clear() {
    state = CartState(taxRateBps: state.taxRateBps);
  }

  List<CartLine> _replace(int index, CartLine line) {
    final lines = [...state.lines];
    lines[index] = line;
    return lines;
  }
}

/// Cart for the active store. Tax rate follows the selected store.
final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  final store = ref.watch(
    shiftAuthProvider.select((s) => s.selectedStore),
  );
  return CartNotifier(
    taxRateBps: store?.taxRateBps ?? AppConfig.defaultTaxRateBps,
  );
});
