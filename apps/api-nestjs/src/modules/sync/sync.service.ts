import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SyncPushDto,
  SyncPullQueryDto,
  SyncShiftDto,
  SyncSaleTenderDto,
} from './dto/sync.dto';
import { PaymentMethod, SaleStatus, StockLedgerReason } from '@prisma/client';
import { calculateTaxBps } from '../../common/utils/currency.util';
import { expectedCashForSales } from '../../common/utils/shift-cash.util';
import { AuthService } from '../auth/auth.service';
import { SalesService } from '../sales/sales.service';

function generateUuid(): string {
  return crypto.randomUUID();
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly salesService: SalesService,
  ) {}

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

    // Full snapshot mode: ignore cursor, return all products
    const isFullSnapshot = query.full === true;

    // Determine the cursor: use query.since if provided, otherwise load from durable cursor store
    let sinceDate = query.since ? new Date(query.since) : undefined;
    if (!isFullSnapshot && !sinceDate) {
      const cursor = await this.prisma.syncCursor.findUnique({ where: { storeId: query.storeId } });
      if (cursor) {
        sinceDate = new Date(cursor.cursor);
      }
    }

    const products = await this.prisma.product.findMany({
      where: isFullSnapshot
        ? undefined
        : sinceDate
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

    let tombstones: Array<{ productId: string; deletedAt: string }> = [];
    let fullSnapshot = false;

    if (isFullSnapshot) {
      // Full snapshot: return all products, no tombstones needed (client replaces all)
      fullSnapshot = true;
    } else {
      // Delta mode: fetch tombstones for deleted/deactivated products since the cursor
      const tombstoneRecords = await this.prisma.productTombstone.findMany({
        where: {
          storeId: query.storeId,
          ...(sinceDate ? { deletedAt: { gte: sinceDate } } : {}),
        },
        select: { productId: true, deletedAt: true },
        orderBy: { deletedAt: 'asc' },
      });

      tombstones = tombstoneRecords.map((t) => ({
        productId: t.productId,
        deletedAt: t.deletedAt.toISOString(),
      }));
    }

    // Persist the current server time as the new cursor for this store
    const serverTime = new Date();
    await this.prisma.syncCursor.upsert({
      where: { storeId: query.storeId },
      create: { storeId: query.storeId, cursor: serverTime.toISOString() },
      update: { cursor: serverTime.toISOString() },
    });

    return {
      serverTime: serverTime.toISOString(),
      store,
      products: formattedProducts,
      tombstones,
      fullSnapshot,
    };
  }

  async push(currentUserId: string, dto: SyncPushDto, canonicalStoreId?: string) {
    const storeId = canonicalStoreId ?? dto.storeId;

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    const syncedShiftIds: string[] = [];
    const syncedSaleIds: string[] = [];
    const syncedRefundIds: string[] = [];
    const failed: Array<{ id: string; entity: string; error: string }> = [];

    const shiftCloseRequests = new Map<string, SyncShiftDto>();

    // 1. Ensure every referenced shift exists, owned by the authenticated user.
    for (const shift of dto.shifts ?? []) {
      try {
        const existing = await this.prisma.shift.findUnique({
          where: { id: shift.id },
        });

        if (!existing) {
          // Create it open. Close state is applied after sales are ingested so
          // expected cash includes the same batch.
          await this.prisma.shift.create({
            data: {
              id: shift.id,
              storeId,
              userId: currentUserId,
              openedAt: new Date(shift.openedAt),
              closedAt: null,
              openingCash: BigInt(shift.openingCash),
            },
          });
        } else {
          if (existing.storeId !== storeId) {
            throw new Error('Shift belongs to another store');
          }
          if (existing.userId !== currentUserId) {
            throw new Error('Shift belongs to another user');
          }
        }

        if (shift.closedAt) {
          shiftCloseRequests.set(shift.id, shift);
        }
        syncedShiftIds.push(shift.id);
      } catch (err: any) {
        this.logger.error(`Failed to ingest shift ${shift.id}: ${err.message}`);
        failed.push({ id: shift.id, entity: 'shift', error: err.message });
      }
    }

    // 2. Ingest sales with server-authoritative pricing and reconciliation.
    if (dto.sales && dto.sales.length > 0) {
      const productIds = Array.from(
        new Set(dto.sales.flatMap((s) => s.items.map((i) => i.productId))),
      );
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { storeInventory: { where: { storeId } } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const sale of dto.sales) {
        try {
          await this.prisma.$transaction(async (tx) => {
            const existingSale = await tx.sale.findUnique({ where: { id: sale.id } });
            if (existingSale) return;

            const shift = await tx.shift.findUnique({ where: { id: sale.shiftId } });
            if (!shift) {
              throw new Error(`Shift ${sale.shiftId} does not exist`);
            }
            if (shift.storeId !== storeId) {
              throw new Error('Sale shift belongs to another store');
            }
            if (shift.userId !== currentUserId) {
              throw new Error('Sale shift belongs to another cashier');
            }

            const saleTime = new Date(sale.createdAt);
            if (saleTime < shift.openedAt) {
              throw new Error('Sale predates its shift');
            }
            if (shift.closedAt && saleTime > shift.closedAt) {
              throw new Error('Sale occurs after its shift closed');
            }

            const baseLines = sale.items.map((item) => {
              const product = productMap.get(item.productId);
              if (!product) {
                throw new Error(`Product ${item.productId} not found`);
              }
              const inv = product.storeInventory[0];
              const unitPrice =
                inv && inv.priceOverride !== null ? inv.priceOverride : product.basePrice;
              const gross = unitPrice * BigInt(item.qty);
              const requestedDiscount = BigInt(item.discountAmount ?? 0);
              const itemDiscount =
                requestedDiscount > gross ? gross : requestedDiscount;
              return {
                item,
                productName: product.name,
                unitPrice,
                gross,
                itemDiscount,
              };
            });

            const subtotal = baseLines.reduce((sum, l) => sum + l.gross, 0n);
            const itemDiscountTotal = baseLines.reduce(
              (sum, l) => sum + l.itemDiscount,
              0n,
            );

            // The client may also send an order-level discount. Treat it as a
            // bounded hint: never exceed the remaining pre-tax amount, and
            // allocate it across lines by their post-item-discount weight so
            // refunds and reports have an exact per-line snapshot.
            const requestedSaleDiscount = BigInt(sale.discountTotal ?? 0);
            const rawOrderDiscount =
              requestedSaleDiscount > itemDiscountTotal
                ? requestedSaleDiscount - itemDiscountTotal
                : 0n;
            const maxOrderDiscount = subtotal - itemDiscountTotal;
            const orderDiscount =
              rawOrderDiscount > maxOrderDiscount
                ? maxOrderDiscount
                : rawOrderDiscount;

            const orderShares = allocateProportionally(
              orderDiscount,
              baseLines.map((l) => l.gross - l.itemDiscount),
            );

            const lines = baseLines.map((line, index) => {
              const discount = line.itemDiscount + orderShares[index];
              return {
                ...line,
                discount,
                taxable: line.gross - discount,
              };
            });

            const discountTotal = lines.reduce((sum, l) => sum + l.discount, 0n);
            const taxableTotal = subtotal - discountTotal;
            const taxTotal = calculateTaxBps(taxableTotal, store.taxRateBps);
            const grandTotal = taxableTotal + taxTotal;

            const taxShares = allocateProportionally(
              taxTotal,
              lines.map((l) => l.taxable),
            );

            // Build tender records from client-provided tenders or derive from paymentMethod
            const tendersInput = sale.tenders ?? [];
            const tendersData = tendersInput.length > 0
              ? tendersInput.map((t) => ({
                  id: generateUuid(),
                  paymentMethod: t.paymentMethod,
                  amount: BigInt(t.amount),
                  change: BigInt(t.change ?? 0),
                  reference: t.reference ?? null,
                }))
              : [
                  {
                    id: generateUuid(),
                    paymentMethod: sale.paymentMethod,
                    amount: grandTotal,
                    change: sale.paymentMethod === PaymentMethod.CASH ? 0n : 0n,
                    reference: null,
                  },
                ];

            await tx.sale.create({
              data: {
                id: sale.id,
                storeId,
                shiftId: sale.shiftId,
                cashierId: currentUserId,
                receiptNo: sale.receiptNo,
                subtotal,
                taxTotal,
                discountTotal,
                grandTotal,
                taxRateBps: store.taxRateBps,
                paymentMethod: sale.paymentMethod,
                status: SaleStatus.COMPLETED,
                createdAt: saleTime,
                saleItems: {
                  create: lines.map((line, index) => ({
                    id: line.item.id,
                    productId: line.item.productId,
                    productNameSnapshot: line.productName,
                    unitPrice: line.unitPrice,
                    qty: line.item.qty,
                    refundedQty: 0,
                    grossAmount: line.gross,
                    discountAmount: line.discount,
                    taxAmount: taxShares[index],
                    lineTotal: line.taxable + taxShares[index],
                    refundedAmount: 0n,
                  })),
                },
                tenders: {
                  create: tendersData,
                },
              },
            });

            for (const line of lines) {
              // Negative stock is allowed for offline sales.
              await tx.storeInventory.upsert({
                where: {
                  storeId_productId: {
                    storeId,
                    productId: line.item.productId,
                  },
                },
                update: { stockOnHand: { decrement: line.item.qty } },
                create: {
                  storeId,
                  productId: line.item.productId,
                  stockOnHand: -line.item.qty,
                  priceOverride: null,
                },
              });

              await tx.stockLedger.create({
                data: {
                  storeId,
                  productId: line.item.productId,
                  deltaQty: -line.item.qty,
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
          failed.push({ id: sale.id, entity: 'sale', error: err.message });
        }
      }
    }

    // 3. Apply refund commands (authorized by a signed grant or online PIN).
    for (const refund of dto.refunds ?? []) {
      try {
        // A replayed command whose refund already exists is idempotent even if
        // its authorization grant has since expired.
        const alreadyApplied = await this.prisma.refund.findUnique({
          where: { idempotencyKey: refund.id },
        });
        if (alreadyApplied) {
          syncedRefundIds.push(refund.id);
          continue;
        }

        if (refund.authorizationToken) {
          await this.authService.verifyOfflineGrant(refund.authorizationToken, {
            storeId,
            action: 'refund',
          });
        } else if (refund.managerPin) {
          await this.authService.verifyPin({ storeId, pin: refund.managerPin });
        } else {
          throw new ForbiddenException(
            'A refund command requires a manager PIN or offline authorization grant',
          );
        }

        await this.salesService.applyAuthorizedRefund({
          saleId: refund.saleId,
          actorUserId: currentUserId,
          items: refund.items,
          reason: refund.reason,
          idempotencyKey: refund.id,
          expectedStoreId: storeId,
        });
        syncedRefundIds.push(refund.id);
      } catch (err: any) {
        this.logger.error(`Failed to apply refund ${refund.id}: ${err.message}`);
        failed.push({ id: refund.id, entity: 'refund', error: err.message });
      }
    }

    // 4. Apply shift-close transitions after sales exist.
    for (const [shiftId, request] of shiftCloseRequests) {
      try {
        const shift = await this.prisma.shift.findUnique({
          where: { id: shiftId },
          include: { sales: { include: { saleItems: true, tenders: true } } },
        });
        if (!shift) {
          throw new Error('Shift disappeared before close');
        }

        if (!shift.closedAt) {
          const expectedCash = expectedCashForSales(
            shift.openingCash,
            shift.sales.map((sale) => ({
              paymentMethod: sale.paymentMethod,
              grandTotal: sale.grandTotal,
              saleItems: sale.saleItems,
              tenders: (sale.tenders ?? []).map((t) => ({
                paymentMethod: t.paymentMethod,
                amount: t.amount,
                change: t.change,
                reference: t.reference,
              })),
            })),
          );
          const actualCash =
            request.actualCash !== null && request.actualCash !== undefined
              ? BigInt(request.actualCash)
              : expectedCash;

          await this.prisma.shift.update({
            where: { id: shiftId },
            data: {
              closedAt: request.closedAt ? new Date(request.closedAt) : new Date(),
              expectedCash,
              actualCash,
            },
          });
        }
        // Already closed: idempotent success.
      } catch (err: any) {
        this.logger.error(`Failed to close shift ${shiftId}: ${err.message}`);
        failed.push({ id: shiftId, entity: 'shift', error: err.message });
      }
    }

    return {
      syncedShiftIds,
      syncedSaleIds,
      syncedRefundIds,
      failed,
    };
  }
}

/** Splits `total` across `weights` in integer minor units, summing exactly. */
function allocateProportionally(total: bigint, weights: bigint[]): bigint[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (total <= 0n || sum <= 0n) return weights.map(() => 0n);

  const parts = weights.map((w) => (total * w) / sum);
  let remainder = total - parts.reduce((a, b) => a + b, 0n);

  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : b.rem > a.rem ? 1 : -1));

  let index = 0;
  while (remainder > 0n) {
    parts[order[index % order.length].i] += 1n;
    remainder -= 1n;
    index++;
  }
  return parts;
}
