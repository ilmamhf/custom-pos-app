import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncPushDto, SyncPullQueryDto } from './dto/sync.dto';
import { SaleStatus, StockLedgerReason } from '@prisma/client';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pull(query: SyncPullQueryDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: query.storeId },
      select: {
        id: true,
        name: true,
        code: true,
        taxRateBps: true,
      },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${query.storeId} not found`);
    }

    const sinceDate = query.since ? new Date(query.since) : undefined;

    // Fetch products and store inventory
    const products = await this.prisma.product.findMany({
      where: sinceDate
        ? {
            OR: [
              { updatedAt: { gte: sinceDate } },
              {
                storeInventory: {
                  some: {
                    storeId: query.storeId,
                    updatedAt: { gte: sinceDate },
                  },
                },
              },
            ],
          }
        : undefined,
      include: {
        storeInventory: {
          where: { storeId: query.storeId },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const formattedProducts = products.map((p) => {
      const inv = p.storeInventory[0];
      const stockOnHand = inv ? inv.stockOnHand : 0;
      const priceOverride = inv && inv.priceOverride !== null ? Number(inv.priceOverride) : null;
      const effectivePrice = priceOverride !== null ? priceOverride : Number(p.basePrice);

      return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        effectivePrice,
        stockOnHand,
        isActive: p.isActive,
        updatedAt: p.updatedAt,
      };
    });

    return {
      serverTime: new Date().toISOString(),
      store,
      products: formattedProducts,
    };
  }

  async push(currentUserId: string, dto: SyncPushDto) {
    const syncedShiftIds: string[] = [];
    const syncedSaleIds: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    // 1. Process shifts idempotently
    if (dto.shifts && dto.shifts.length > 0) {
      for (const shift of dto.shifts) {
        try {
          const existing = await this.prisma.shift.findUnique({
            where: { id: shift.id },
          });

          if (!existing) {
            await this.prisma.shift.create({
              data: {
                id: shift.id,
                storeId: dto.storeId,
                userId: shift.userId || currentUserId,
                openedAt: new Date(shift.openedAt),
                closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
                openingCash: BigInt(shift.openingCash),
                actualCash:
                  shift.actualCash !== null && shift.actualCash !== undefined
                    ? BigInt(shift.actualCash)
                    : null,
              },
            });
          }
          syncedShiftIds.push(shift.id);
        } catch (err: any) {
          this.logger.error(`Failed to ingest shift ${shift.id}: ${err.message}`);
          failed.push({ id: shift.id, error: err.message });
        }
      }
    }

    // 2. Process sales idempotently inside individual transactions
    if (dto.sales && dto.sales.length > 0) {
      for (const sale of dto.sales) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Step 1: Check if sale already exists
            const existingSale = await tx.sale.findUnique({
              where: { id: sale.id },
            });

            if (existingSale) {
              // Already ingested, safe idempotency
              return;
            }

            // Step 2: Ingest sale & items
            await tx.sale.create({
              data: {
                id: sale.id,
                storeId: dto.storeId,
                shiftId: sale.shiftId,
                cashierId: currentUserId,
                receiptNo: sale.receiptNo,
                subtotal: BigInt(sale.subtotal),
                taxTotal: BigInt(sale.taxTotal),
                discountTotal: BigInt(sale.discountTotal ?? 0),
                grandTotal: BigInt(sale.grandTotal),
                paymentMethod: sale.paymentMethod,
                status: SaleStatus.COMPLETED,
                createdAt: new Date(sale.createdAt),
                saleItems: {
                  create: sale.items.map((item) => ({
                    id: item.id,
                    productId: item.productId,
                    productNameSnapshot: item.productNameSnapshot,
                    unitPrice: BigInt(item.unitPrice),
                    qty: item.qty,
                    refundedQty: 0,
                  })),
                },
              },
            });

            // Step 3 & 4: Decrement stock & append to immutable stock_ledger
            for (const item of sale.items) {
              // Allow negative stock for concurrent offline sales
              await tx.storeInventory.upsert({
                where: {
                  storeId_productId: {
                    storeId: dto.storeId,
                    productId: item.productId,
                  },
                },
                update: {
                  stockOnHand: { decrement: item.qty },
                },
                create: {
                  storeId: dto.storeId,
                  productId: item.productId,
                  stockOnHand: -item.qty,
                  priceOverride: null,
                },
              });

              await tx.stockLedger.create({
                data: {
                  storeId: dto.storeId,
                  productId: item.productId,
                  deltaQty: -item.qty,
                  reason: StockLedgerReason.SALE,
                  referenceId: sale.id,
                  note: `Offline POS sale: ${sale.receiptNo}`,
                  createdBy: currentUserId,
                },
              });
            }
          });

          syncedSaleIds.push(sale.id);
        } catch (err: any) {
          this.logger.error(`Failed to ingest sale ${sale.id}: ${err.message}`);
          failed.push({ id: sale.id, error: err.message });
        }
      }
    }

    return {
      syncedShiftIds,
      syncedSaleIds,
      failed,
    };
  }
}
