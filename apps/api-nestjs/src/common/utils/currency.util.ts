/**
 * Integer BPS (Basis Points) Tax & Currency Math
 * 1% = 100 BPS. 11% = 1100 BPS.
 * All monetary calculations strictly operate in integer BigInt units to eliminate floating-point drift.
 */

export function calculateTaxBps(taxableAmount: bigint, taxRateBps: number): bigint {
  if (taxRateBps <= 0 || taxableAmount <= 0n) {
    return 0n;
  }
  // (taxableAmount * bps + 5000) / 10000 for standard banker's half-up integer rounding
  return (taxableAmount * BigInt(taxRateBps) + 5000n) / 10000n;
}

export function calculateGrandTotal(
  subtotal: bigint,
  taxTotal: bigint,
  discountTotal: bigint = 0n,
): bigint {
  const total = subtotal + taxTotal - discountTotal;
  return total < 0n ? 0n : total;
}
