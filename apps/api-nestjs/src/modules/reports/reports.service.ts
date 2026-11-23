import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportSummaryQueryDto } from './dto/report.dto';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveStoreScope,
  storeScopeWhere,
} from '../../common/utils/store-scope.util';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: ReportSummaryQueryDto, user?: RequestUser) {
    const scope = user ? resolveStoreScope(user, query.storeId) : undefined;

    const where: Record<string, any> = {
      ...(scope ? storeScopeWhere(scope) : query.storeId ? { storeId: query.storeId } : {}),
    };

    // Half-open [from, to) with a bounded default so "today" cannot include
    // future-dated rows when the caller omits the upper bound.
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : new Date();
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      lt: to,
    };

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        saleItems: true,
      },
    });

    let grossSales = 0n;
    let refundTotal = 0n;
    const paymentMap = new Map<string, { total: bigint; count: number }>();
    const productMap = new Map<string, { name: string; qtySold: number; revenue: bigint }>();

    for (const sale of sales) {
      grossSales += sale.grandTotal;

      const currentPm = paymentMap.get(sale.paymentMethod) || { total: 0n, count: 0 };
      currentPm.total += sale.grandTotal;
      currentPm.count += 1;
      paymentMap.set(sale.paymentMethod, currentPm);

      for (const item of sale.saleItems) {
        if (item.refundedQty > 0) {
          const refunded =
            item.refundedAmount > 0n
              ? item.refundedAmount
              : item.unitPrice * BigInt(item.refundedQty);
          refundTotal += refunded;
        }

        const netQty = item.qty - item.refundedQty;
        if (netQty > 0) {
          const curProd = productMap.get(item.productId) || {
            name: item.productNameSnapshot,
            qtySold: 0,
            revenue: 0n,
          };
          curProd.qtySold += netQty;
          // Net revenue from the immutable line snapshot.
          const lineRevenue =
            item.lineTotal > 0n
              ? item.lineTotal - item.refundedAmount
              : item.unitPrice * BigInt(netQty);
          curProd.revenue += lineRevenue > 0n ? lineRevenue : 0n;
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
