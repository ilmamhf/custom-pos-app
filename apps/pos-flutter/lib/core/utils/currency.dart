/// Integer-only currency math utilities for IDR (Indonesian Rupiah).
/// All monetary values are stored and computed as integers in the smallest
/// currency unit (e.g., 18000 = Rp 18.000).
///
/// This module provides basis-point (BPS) arithmetic to avoid floating-point
/// rounding errors in tax and discount calculations.

/// Multiplies a monetary amount by a basis-point rate and divides by 10000.
/// Uses integer arithmetic with truncating division (~/) as per spec.
///
/// Example: calculateTax(18000, 1100) = (18000 * 1100) ~/ 10000 = 1980
/// (11% tax on Rp 18.000 = Rp 1.980)
int calculateBps(int amount, int rateBps) {
  if (amount <= 0 || rateBps <= 0) return 0;
  return (amount * rateBps) ~/ 10000;
}

/// Calculates tax amount for a taxable amount using basis-point rate.
/// Returns 0 if taxableAmount <= 0 or taxRateBps <= 0.
int calculateTax(int taxableAmount, int taxRateBps) {
  return calculateBps(taxableAmount, taxRateBps);
}

/// Calculates discount amount for a base amount using basis-point rate.
/// Returns 0 if baseAmount <= 0 or discountRateBps <= 0.
int calculateDiscount(int baseAmount, int discountRateBps) {
  return calculateBps(baseAmount, discountRateBps);
}

/// Calculates item line total: (unitPrice * qty) - itemDiscount.
/// itemDiscount is an absolute integer amount (not BPS).
int calculateItemTotal(int unitPrice, int qty, int itemDiscount) {
  if (qty <= 0) return 0;
  final gross = unitPrice * qty;
  return gross - itemDiscount.clamp(0, gross);
}

/// Calculates order-level discount from subtotal using BPS rate.
int calculateOrderDiscount(int subtotal, int orderDiscountBps) {
  return calculateBps(subtotal, orderDiscountBps);
}

/// Computes the grand total for a sale:
/// grandTotal = subtotal + taxTotal - discountTotal
int calculateGrandTotal({
  required int subtotal,
  required int taxTotal,
  required int discountTotal,
}) {
  return subtotal + taxTotal - discountTotal;
}

/// Computes change due for cash payment.
/// Returns 0 if amountTendered < grandTotal.
int calculateChange(int amountTendered, int grandTotal) {
  if (amountTendered < grandTotal) return 0;
  return amountTendered - grandTotal;
}

/// Splits a total amount into multiple payment parts.
/// Returns a list of amounts that sum to the total.
/// For positive totals: first `remainder` parts get +1.
/// For negative totals: splits positive version and negates all parts.
List<int> splitPayment(int total, int parts) {
  if (parts <= 1) return [total];
  if (total == 0) return List.filled(parts, 0);

  if (total > 0) {
    final baseAmount = total ~/ parts;
    final remainder = total % parts;
    final result = <int>[];
    for (int i = 0; i < parts; i++) {
      result.add(baseAmount + (i < remainder ? 1 : 0));
    }
    return result;
  } else {
    // For negative, split positive version and negate all parts
    // This works because Dart's ~/ and % have different behavior for negatives
    final positiveParts = splitPayment(-total, parts);
    return positiveParts.map((p) => -p).toList();
  }
}

/// Formats an integer IDR amount as a display string (e.g., "Rp 18.000").
String formatIdr(int amount, {bool showSymbol = true}) {
  final sign = amount < 0 ? '-' : '';
  final absAmount = amount.abs();
  final formatted = absAmount.toString().replaceAllMapped(
    RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
    (match) => '${match[1]}.',
  );
  return '$sign${showSymbol ? 'Rp ' : ''}$formatted';
}

/// Parses a display string (e.g., "Rp 18.000" or "18000") to integer IDR.
/// Returns 0 if parsing fails.
int parseIdr(String input) {
  final cleaned = input.replaceAll(RegExp(r'[^\d-]'), '');
  if (cleaned.isEmpty) return 0;
  return int.tryParse(cleaned) ?? 0;
}

/// Rounds an integer amount to the nearest 100 (for cash rounding in IDR).
/// Uses "round half up" strategy: 50 and above rounds away from zero.
int roundToNearest100(int amount) {
  if (amount >= 0) {
    final remainder = amount % 100;
    if (remainder < 50) {
      return amount - remainder;
    }
    return amount + (100 - remainder);
  } else {
    // For negative amounts, round the absolute value and negate
    // This implements "round half away from zero"
    final absAmount = -amount;
    final remainder = absAmount % 100;
    if (remainder < 50) {
      return -(absAmount - remainder);
    }
    return -(absAmount + (100 - remainder));
  }
}

/// Validates that a monetary amount is non-negative.
bool isValidAmount(int amount) => amount >= 0;