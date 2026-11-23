import { PaymentMethod } from '@prisma/client';

interface CashSaleItem {
  unitPrice: bigint;
  qty: number;
  refundedQty: number;
  refundedAmount?: bigint | null;
  lineTotal?: bigint | null;
}

interface CashSale {
  paymentMethod: PaymentMethod;
  grandTotal: bigint;
  saleItems: CashSaleItem[];
}

/**
 * Expected drawer cash for a shift, in integer minor units.
 *
 * Only CASH sales contribute. Refund value uses the immutable per-line
 * `refundedAmount` snapshot, falling back to `unitPrice * refundedQty` for
 * legacy rows that predate the snapshot.
 */
export function expectedCashForSales(
  openingCash: bigint,
  sales: CashSale[],
): bigint {
  let expected = openingCash;

  for (const sale of sales) {
    if (sale.paymentMethod !== PaymentMethod.CASH) continue;

    expected += sale.grandTotal;

    for (const item of sale.saleItems) {
      if (item.refundedQty <= 0) continue;
      const refunded =
        item.refundedAmount && item.refundedAmount > 0n
          ? item.refundedAmount
          : item.unitPrice * BigInt(item.refundedQty);
      expected -= refunded;
    }
  }

  return expected;
}
