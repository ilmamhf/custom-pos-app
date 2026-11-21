import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportSummaryQueryDto } from './dto/report.dto';
import { SaleStatus } from '@prisma/client';
import { calculateTaxBps } from '../../common/utils/currency.util';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: ReportSummaryQueryDto) {
    const where: Record<string, any> = {};

    if (query.storeId) {
      where.storeId = query.storeId;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        store: { select: { taxRateBps: true } },
        saleItems: true,
      },
    });

    let grossSales = 0n;
    let refundTotal = 0n;
    const paymentMap = new Map<string, { total: bigint; count: number }>();
    const productMap = new Map<string, { name: string; qtySold: number; revenue: bigint }>();

    for (const sale of sales) {
      grossSales += sale.grandTotal;

      // Payment breakdown
      const currentPm = paymentMap.get(sale.paymentMethod) || { total: 0n, count: 0 };
      currentPm.total += sale.grandTotal;
      currentPm.count += 1;
      paymentMap.set(sale.paymentMethod, currentPm);

      // Refund calculation & Top products
      for (const item of sale.saleItems) {
        if (item.refundedQty > 0) {
          const itemRefundSubtotal = item.unitPrice * BigInt(item.refundedQty);
          const itemRefundTax = calculateTaxBps(itemRefundSubtotal, sale.store.taxRateBps);
          refundTotal += itemRefundSubtotal + itemRefundTax;
        }

        const netQty = item.qty - item.refundedQty;
        if (netQty > 0) {
          const curProd = productMap.get(item.productId) || {
            name: item.productNameSnapshot,
            qtySold: 0,
            revenue: 0n,
          };
          curProd.qtySold += netQty;
          curProd.revenue += item.unitPrice * BigInt(netQty);
          productMap.set(item.productId, curProd);
        }
      }
    }

    const netSales = grossSales - refundTotal;

    const paymentBreakdown = Array.from(paymentMap.entries()).map(([method, data]) => ({
      method,
      total: Number(data.total),
      count: data.count,
    }));

    const topProducts = Array.from(productMap.entries())
      .map(([productId, data]) => ({
        productId,
        name: data.name,
        qtySold: data.qtySold,
        revenue: Number(data.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      grossSales: Number(grossSales),
      refundTotal: Number(refundTotal),
      netSales: Number(netSales),
      transactionCount: sales.length,
      paymentBreakdown,
      topProducts,
    };
  }
}
