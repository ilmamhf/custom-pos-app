import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessRefundDto, QuerySaleDto } from './dto/sale.dto';
import { Role, SaleStatus, StockLedgerReason } from '@prisma/client';
import { comparePin } from '../../common/utils/hash.util';
import { calculateTaxBps } from '../../common/utils/currency.util';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySaleDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};
    if (query.storeId) {
      where.storeId = query.storeId;
    }
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

  async findOne(id: string) {
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

  async processRefund(saleId: string, currentUserId: string, dto: ProcessRefundDto) {
    // 1. Fetch sale with items & store
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        store: true,
        saleItems: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    if (sale.status === SaleStatus.REFUNDED) {
      throw new BadRequestException('This sale has already been fully refunded');
    }

    // 2. Verify manager PIN against managers/owners assigned to this store
    const managers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.MANAGER, Role.OWNER] },
        OR: [
          { role: Role.OWNER },
          { userStores: { some: { storeId: sale.storeId } } },
        ],
      },
    });

    let authorizedManager: { id: string; name: string } | null = null;
    for (const m of managers) {
      if (m.pinHash) {
        const matches = await comparePin(dto.managerPin, m.pinHash);
        if (matches) {
          authorizedManager = { id: m.id, name: m.name };
          break;
        }
      }
    }

    if (!authorizedManager) {
      throw new UnauthorizedException('Invalid manager PIN for this store');
    }

    // 3. Process refund inside atomic transaction
    return this.prisma.$transaction(async (tx) => {
      let refundedSubtotal = 0n;
      let totalItemsQty = 0;
      let totalRefundedQty = 0;

      for (const reqItem of dto.items) {
        const saleItem = sale.saleItems.find((i) => i.id === reqItem.saleItemId);
        if (!saleItem) {
          throw new NotFoundException(`Sale item with ID ${reqItem.saleItemId} not found in this sale`);
        }

        const remainingRefundable = saleItem.qty - saleItem.refundedQty;
        if (reqItem.refundQty <= 0) {
          throw new BadRequestException('Refund quantity must be greater than zero');
        }
        if (reqItem.refundQty > remainingRefundable) {
          throw new BadRequestException(
            `Cannot refund ${reqItem.refundQty} units for item ${saleItem.productNameSnapshot}. Only ${remainingRefundable} refundable.`,
          );
        }

        // Increment sale item refunded_qty
        await tx.saleItem.update({
          where: { id: saleItem.id },
          data: {
            refundedQty: { increment: reqItem.refundQty },
          },
        });

        // Restore store inventory stock_on_hand
        await tx.storeInventory.upsert({
          where: {
            storeId_productId: {
              storeId: sale.storeId,
              productId: saleItem.productId,
            },
          },
          update: {
            stockOnHand: { increment: reqItem.refundQty },
          },
          create: {
            storeId: sale.storeId,
            productId: saleItem.productId,
            stockOnHand: reqItem.refundQty,
            priceOverride: null,
          },
        });

        // Insert REFUND entry in stock_ledger
        await tx.stockLedger.create({
          data: {
            storeId: sale.storeId,
            productId: saleItem.productId,
            deltaQty: reqItem.refundQty,
            reason: StockLedgerReason.REFUND,
            referenceId: sale.id,
            note: dto.reason ? `Refund: ${dto.reason}` : `Refund for receipt ${sale.receiptNo}`,
            createdBy: currentUserId,
          },
        });

        refundedSubtotal += saleItem.unitPrice * BigInt(reqItem.refundQty);
      }

      // Re-evaluate total refund status across all items
      const updatedItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
      });

      for (const it of updatedItems) {
        totalItemsQty += it.qty;
        totalRefundedQty += it.refundedQty;
      }

      const newStatus =
        totalRefundedQty >= totalItemsQty ? SaleStatus.REFUNDED : SaleStatus.PARTIALLY_REFUNDED;

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: newStatus },
      });

      // Calculate proportional tax for refunded amount
      const refundedTax = calculateTaxBps(refundedSubtotal, sale.store.taxRateBps);
      const refundedAmount = Number(refundedSubtotal + refundedTax);

      return {
        saleId: sale.id,
        status: newStatus,
        refundedAmount,
      };
    });
  }
}
