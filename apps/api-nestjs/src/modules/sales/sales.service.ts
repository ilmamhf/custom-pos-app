import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessRefundDto, QuerySaleDto } from './dto/sale.dto';
import { Role, SaleStatus, StockLedgerReason } from '@prisma/client';
import { comparePin } from '../../common/utils/hash.util';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  assertStoreInScope,
  resolveStoreScope,
  storeScopeWhere,
} from '../../common/utils/store-scope.util';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySaleDto, user?: RequestUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scope = user ? resolveStoreScope(user, query.storeId) : undefined;

    const where: Record<string, any> = {
      ...(scope ? storeScopeWhere(scope) : query.storeId ? { storeId: query.storeId } : {}),
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, items] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          store: { select: { id: true, name: true, code: true } },
          cashier: { select: { id: true, name: true } },
          saleItems: true,
        },
      }),
    ]);

    const formatted = items.map((s) => ({
      id: s.id,
      storeId: s.storeId,
      storeName: s.store.name,
      storeCode: s.store.code,
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      cashierName: s.cashier.name,
      receiptNo: s.receiptNo,
      subtotal: Number(s.subtotal),
      taxTotal: Number(s.taxTotal),
      discountTotal: Number(s.discountTotal),
      grandTotal: Number(s.grandTotal),
      paymentMethod: s.paymentMethod,
      status: s.status,
      createdAt: s.createdAt,
      items: s.saleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        unitPrice: Number(item.unitPrice),
        qty: item.qty,
        refundedQty: item.refundedQty,
      })),
    }));

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: formatted,
    };
  }

  async findOne(id: string, user?: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, code: true, taxRateBps: true } },
        cashier: { select: { id: true, name: true, email: true } },
        saleItems: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${id} not found`);
    }

    if (user) {
      assertStoreInScope(resolveStoreScope(user), sale.storeId);
      if (user.role === Role.CASHIER && sale.cashierId !== user.id) {
        throw new NotFoundException(`Sale with ID ${id} not found`);
      }
    }

    return {
      id: sale.id,
      storeId: sale.storeId,
      storeName: sale.store.name,
      storeCode: sale.store.code,
      shiftId: sale.shiftId,
      cashierId: sale.cashierId,
      cashierName: sale.cashier.name,
      receiptNo: sale.receiptNo,
      subtotal: Number(sale.subtotal),
      taxTotal: Number(sale.taxTotal),
      discountTotal: Number(sale.discountTotal),
      grandTotal: Number(sale.grandTotal),
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      createdAt: sale.createdAt,
      items: sale.saleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        unitPrice: Number(item.unitPrice),
        qty: item.qty,
        refundedQty: item.refundedQty,
      })),
    };
  }

  async processRefund(saleId: string, user: RequestUser, dto: ProcessRefundDto) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { saleItems: true },
    });

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    assertStoreInScope(resolveStoreScope(user), sale.storeId);
    if (user.role === Role.CASHIER && sale.cashierId !== user.id) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    await this.verifyManagerPin(dto.managerPin, sale.storeId);

    return this.executeRefund({
      saleId,
      actorUserId: user.id,
      items: dto.items,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Applies a refund that has already been authorized (online PIN or a signed
   * offline grant). Shared by the REST endpoint and the sync refund command.
   */
  async applyAuthorizedRefund(params: {
    saleId: string;
    actorUserId: string;
    items: Array<{ saleItemId: string; refundQty: number }>;
    reason?: string;
    idempotencyKey?: string;
    expectedStoreId?: string;
  }) {
    return this.executeRefund(params);
  }

  private async verifyManagerPin(pin: string, storeId: string): Promise<void> {
    const managers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.MANAGER, Role.OWNER] },
        OR: [
          { role: Role.OWNER },
          { userStores: { some: { storeId } } },
        ],
      },
    });

    for (const m of managers) {
      if (m.pinHash && (await comparePin(pin, m.pinHash))) {
        return;
      }
    }

    throw new UnauthorizedException('Invalid manager PIN for this store');
  }

  private async executeRefund(params: {
    saleId: string;
    actorUserId: string;
    items: Array<{ saleItemId: string; refundQty: number }>;
    reason?: string;
    idempotencyKey?: string;
    expectedStoreId?: string;
  }) {
    const { saleId, actorUserId, reason, idempotencyKey } = params;

    // Aggregate duplicate sale-item ids so two entries cannot each pass the
    // remaining-quantity check.
    const requested = new Map<string, number>();
    for (const item of params.items ?? []) {
      if (!item?.saleItemId || !Number.isInteger(item.refundQty) || item.refundQty <= 0) {
        throw new BadRequestException('Each refund item requires a positive integer quantity');
      }
      requested.set(item.saleItemId, (requested.get(item.saleItemId) ?? 0) + item.refundQty);
    }

    if (requested.size === 0) {
      throw new BadRequestException('A refund must include at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.refund.findUnique({ where: { idempotencyKey } });
        if (existing) {
          const sale = await tx.sale.findUnique({ where: { id: existing.saleId } });
          return {
            saleId: existing.saleId,
            status: sale?.status ?? SaleStatus.PARTIALLY_REFUNDED,
            refundedAmount: Number(existing.amount),
            idempotent: true,
          };
        }
      }

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { saleItems: true },
      });

      if (!sale) {
        throw new NotFoundException(`Sale with ID ${saleId} not found`);
      }

      if (params.expectedStoreId && sale.storeId !== params.expectedStoreId) {
        throw new ForbiddenException('This sale belongs to another store');
      }

      let totalRefundAmount = 0n;

      for (const [saleItemId, refundQty] of requested) {
        const saleItem = sale.saleItems.find((i) => i.id === saleItemId);
        if (!saleItem) {
          throw new NotFoundException(
            `Sale item with ID ${saleItemId} not found in this sale`,
          );
        }

        const remaining = saleItem.qty - saleItem.refundedQty;
        if (refundQty > remaining) {
          throw new BadRequestException(
            `Cannot refund ${refundQty} units for item ${saleItem.productNameSnapshot}. Only ${remaining} refundable.`,
          );
        }

        const newRefundedQty = saleItem.refundedQty + refundQty;

        // Immutable per-line total; fall back to unit price for legacy rows.
        const lineTotal =
          saleItem.lineTotal > 0n
            ? saleItem.lineTotal
            : saleItem.unitPrice * BigInt(saleItem.qty);

        // Exact proportional allocation: the final unit always settles any
        // rounding residue so repeated partial refunds sum to lineTotal.
        const targetRefundedAmount =
          newRefundedQty >= saleItem.qty
            ? lineTotal
            : (lineTotal * BigInt(newRefundedQty)) / BigInt(saleItem.qty);

        const deltaAmount = targetRefundedAmount - saleItem.refundedAmount;

        // Optimistic concurrency: only commit if refundedQty is unchanged.
        const updated = await tx.saleItem.updateMany({
          where: { id: saleItem.id, refundedQty: saleItem.refundedQty },
          data: {
            refundedQty: newRefundedQty,
            refundedAmount: targetRefundedAmount,
          },
        });

        if (updated.count === 0) {
          throw new ConflictException(
            'This sale item was refunded concurrently; reload and retry',
          );
        }

        await tx.storeInventory.upsert({
          where: {
            storeId_productId: {
              storeId: sale.storeId,
              productId: saleItem.productId,
            },
          },
          update: { stockOnHand: { increment: refundQty } },
          create: {
            storeId: sale.storeId,
            productId: saleItem.productId,
            stockOnHand: refundQty,
            priceOverride: null,
          },
        });

        await tx.stockLedger.create({
          data: {
            storeId: sale.storeId,
            productId: saleItem.productId,
            deltaQty: refundQty,
            reason: StockLedgerReason.REFUND,
            referenceId: sale.id,
            note: reason
              ? `Refund: ${reason}`
              : `Refund for receipt ${sale.receiptNo}`,
            createdBy: actorUserId,
          },
        });

        totalRefundAmount += deltaAmount;
      }

      const updatedItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
      });
      const fullyRefunded = updatedItems.every((it) => it.refundedQty >= it.qty);
      const newStatus = fullyRefunded
        ? SaleStatus.REFUNDED
        : SaleStatus.PARTIALLY_REFUNDED;

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: newStatus },
      });

      await tx.refund.create({
        data: {
          id: randomUUID(),
          saleId: sale.id,
          storeId: sale.storeId,
          createdBy: actorUserId,
          amount: totalRefundAmount,
          reason: reason ?? null,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      return {
        saleId: sale.id,
        status: newStatus,
        refundedAmount: Number(totalRefundAmount),
      };
    });
  }
}
