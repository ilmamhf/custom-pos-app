import { PaymentMethod } from '@prisma/client';

interface SaleTender {
  paymentMethod: PaymentMethod;
  amount: bigint;   // amount tendered for this method
  change: bigint;   // change given (for cash)
  reference?: string | null;
}

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
  tenders?: SaleTender[];
}

/**
 * Expected drawer cash for a shift, in integer minor units (BigInt).
 *
 * Uses tender records to compute exact cash flow:
 * - For CASH tenders: adds (amount - change)
 * - For QRIS/CARD/SPLIT tenders: does not affect drawer cash
 * - Refunds: subtracts refunded amount from the appropriate tender type
 *
 * Falls back to legacy logic (paymentMethod + grandTotal) for sales
 * without tender records.
 */
export function expectedCashForSales(
  openingCash: bigint,
  sales: CashSale[],
): bigint {
  let expected = openingCash;

  for (const sale of sales) {
    const tenders = sale.tenders ?? [];

    if (tenders.length === 0) {
      // Legacy fallback: only CASH paymentMethod contributes
      if (sale.paymentMethod === PaymentMethod.CASH) {
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
      continue;
    }

    // Use tender records for precise reconciliation
    for (const tender of tenders) {
      if (tender.paymentMethod === PaymentMethod.CASH) {
        // Cash tendered minus change given
        expected += tender.amount - tender.change;
      }
      // QRIS, CARD, SPLIT do not affect physical cash drawer
    }

    // Handle refunds: subtract refunded amount from cash if the original
    // sale had a CASH tender, or from the matching tender type.
    // For simplicity, we check if any CASH tender exists on the sale.
    const hasCashTender = tenders.some((t) => t.paymentMethod === PaymentMethod.CASH);
    if (hasCashTender) {
      for (const item of sale.saleItems) {
        if (item.refundedQty <= 0) continue;
        const refunded =
          item.refundedAmount && item.refundedAmount > 0n
            ? item.refundedAmount
            : item.unitPrice * BigInt(item.refundedQty);
        expected -= refunded;
      }
    }
  }

  return expected;
}