import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdjustInventoryDto,
  TransferInventoryDto,
  QueryInventoryDto,
  QueryLedgerDto,
} from './dto/inventory.dto';
import { StockLedgerReason } from '@prisma/client';
import { randomUUID } from 'crypto';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveStoreScope,
  storeScopeWhere,
} from '../../common/utils/store-scope.util';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryInventoryDto, user?: RequestUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scope = user ? resolveStoreScope(user, query.storeId) : undefined;

    const where: Record<string, any> = {
      ...(scope ? storeScopeWhere(scope) : query.storeId ? { storeId: query.storeId } : {}),
    };

    if (query.negativeOnly) {
      where.stockOnHand = { lt: 0 };
    } else if (query.lowStockOnly) {
      where.stockOnHand = { lte: 10 };
    }

    if (query.search) {
      where.product = {
        OR: [
          { sku: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [total, items, negativeCount] = await Promise.all([
      this.prisma.storeInventory.count({ where }),
      this.prisma.storeInventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ storeId: 'asc' }, { updatedAt: 'desc' }],
        include: {
          store: {
            select: { id: true, name: true, code: true },
          },
          product: {
            select: { id: true, sku: true, name: true, basePrice: true },
          },
        },
      }),
      this.prisma.storeInventory.count({
        where: { ...where, stockOnHand: { lt: 0 } },
      }),
    ]);

    const formatted = items.map((inv) => ({
      storeId: inv.storeId,
      storeName: inv.store.name,
      storeCode: inv.store.code,
      productId: inv.productId,
      sku: inv.product.sku,
      productName: inv.product.name,
      stockOnHand: inv.stockOnHand,
      priceOverride: inv.priceOverride !== null ? Number(inv.priceOverride) : null,
      basePrice: Number(inv.product.basePrice),
      effectivePrice:
        inv.priceOverride !== null ? Number(inv.priceOverride) : Number(inv.product.basePrice),
      updatedAt: inv.updatedAt,
    }));

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      negativeCount,
      items: formatted,
    };
  }

  async adjust(userId: string, dto: AdjustInventoryDto, canonicalStoreId?: string) {
    const storeId = canonicalStoreId ?? dto.storeId;
    const [store, product] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.product.findUnique({ where: { id: dto.productId } }),
    ]);

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update stockOnHand atomically
      const updatedInventory = await tx.storeInventory.upsert({
        where: {
          storeId_productId: {
            storeId,
            productId: dto.productId,
          },
        },
        update: {
          stockOnHand: { increment: dto.deltaQty },
        },
        create: {
          storeId,
          productId: dto.productId,
          stockOnHand: dto.deltaQty,
          priceOverride: null,
        },
      });

      // 2. Append immutable row to stock_ledger
      await tx.stockLedger.create({
        data: {
          storeId,
          productId: dto.productId,
          deltaQty: dto.deltaQty,
          reason: dto.reason,
          note: dto.note || null,
          createdBy: userId,
        },
      });

      return {
        storeId: updatedInventory.storeId,
        productId: updatedInventory.productId,
        stockOnHand: updatedInventory.stockOnHand,
      };
    });
  }

  async transfer(userId: string, dto: TransferInventoryDto) {
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException('Source and destination stores must be different');
    }

    if (dto.qty <= 0) {
      throw new BadRequestException('Transfer quantity must be greater than zero');
    }

    const [fromStore, toStore, product] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: dto.fromStoreId } }),
      this.prisma.store.findUnique({ where: { id: dto.toStoreId } }),
      this.prisma.product.findUnique({ where: { id: dto.productId } }),
    ]);

    if (!fromStore) {
      throw new NotFoundException(`Source store with ID ${dto.fromStoreId} not found`);
    }
    if (!toStore) {
      throw new NotFoundException(`Destination store with ID ${dto.toStoreId} not found`);
    }
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Read source inventory for the response and ledger note.
      const sourceInv = await tx.storeInventory.findUnique({
        where: {
          storeId_productId: {
            storeId: dto.fromStoreId,
            productId: dto.productId,
          },
        },
      });

      if (!sourceInv || sourceInv.stockOnHand < dto.qty) {
        throw new BadRequestException(
          `Insufficient stock at source store (available: ${sourceInv?.stockOnHand ?? 0}, requested: ${dto.qty})`,
        );
      }

      const transferId = randomUUID();

      // 2. Conditionally decrement the source so a concurrent transfer cannot
      // push it below zero under READ COMMITTED isolation.
      const decremented = await tx.storeInventory.updateMany({
        where: {
          storeId: dto.fromStoreId,
          productId: dto.productId,
          stockOnHand: { gte: dto.qty },
        },
        data: {
          stockOnHand: { decrement: dto.qty },
        },
      });

      if (decremented.count === 0) {
        throw new BadRequestException(
          `Insufficient stock at source store (available: ${sourceInv.stockOnHand}, requested: ${dto.qty})`,
        );
      }

      await tx.stockLedger.create({
        data: {
          storeId: dto.fromStoreId,
          productId: dto.productId,
          deltaQty: -dto.qty,
          reason: StockLedgerReason.TRANSFER_OUT,
          referenceId: transferId,
          note: dto.note || null,
          createdBy: userId,
        },
      });

      // 3. Increment destination store inventory & record TRANSFER_IN
      const updatedTo = await tx.storeInventory.upsert({
        where: {
          storeId_productId: {
            storeId: dto.toStoreId,
            productId: dto.productId,
          },
        },
        update: {
          stockOnHand: { increment: dto.qty },
        },
        create: {
          storeId: dto.toStoreId,
          productId: dto.productId,
          stockOnHand: dto.qty,
          priceOverride: null,
        },
      });

      await tx.stockLedger.create({
        data: {
          storeId: dto.toStoreId,
          productId: dto.productId,
          deltaQty: dto.qty,
          reason: StockLedgerReason.TRANSFER_IN,
          referenceId: transferId,
          note: dto.note || null,
          createdBy: userId,
        },
      });

      return {
        transferId,
        fromStoreStock: sourceInv.stockOnHand - dto.qty,
        toStoreStock: updatedTo.stockOnHand,
      };
    });
  }

  async getLedger(query: QueryLedgerDto, user?: RequestUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scope = user ? resolveStoreScope(user, query.storeId) : undefined;

    const where: Record<string, any> = {
      ...(scope ? storeScopeWhere(scope) : query.storeId ? { storeId: query.storeId } : {}),
    };

    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.reason) {
      where.reason = query.reason;
    }

    const [total, items] = await Promise.all([
      this.prisma.stockLedger.count({ where }),
      this.prisma.stockLedger.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          store: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const formatted = items.map((entry) => ({
      id: entry.id,
      storeId: entry.storeId,
      storeName: entry.store.name,
      productId: entry.productId,
      productName: entry.product.name,
      sku: entry.product.sku,
      deltaQty: entry.deltaQty,
      reason: entry.reason,
      referenceId: entry.referenceId,
      note: entry.note,
      createdBy: entry.createdBy,
      createdByName: entry.creator.name,
      createdAt: entry.createdAt,
    }));

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: formatted,
    };
  }
}
