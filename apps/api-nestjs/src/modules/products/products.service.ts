import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  SetPriceOverrideDto,
  QueryProductDto,
} from './dto/product.dto';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { resolveStoreScope } from '../../common/utils/store-scope.util';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryProductDto, user?: RequestUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, storeId } = query;

    const scope = user ? resolveStoreScope(user, storeId) : undefined;
    const inventoryFilter = scope
      ? scope.all
        ? undefined
        : scope.storeId
          ? { storeId: scope.storeId }
          : { storeId: { in: scope.storeIds } }
      : storeId
        ? { storeId }
        : undefined;

    const where: Record<string, any> = {};
    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          storeInventory: {
            where: inventoryFilter,
            include: {
              store: {
                select: { id: true, name: true, code: true },
              },
            },
          },
        },
      }),
    ]);

    // Format output
    const formatted = items.map((product) => {
      if (storeId) {
        const inv = product.storeInventory[0];
        const stockOnHand = inv ? inv.stockOnHand : 0;
        const priceOverride = inv && inv.priceOverride !== null ? Number(inv.priceOverride) : null;
        const effectivePrice = priceOverride !== null ? priceOverride : Number(product.basePrice);

        return {
          id: product.id,
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          basePrice: Number(product.basePrice),
          costPrice: Number(product.costPrice),
          priceOverride,
          effectivePrice,
          stockOnHand,
          isActive: product.isActive,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        };
      }

      return {
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        basePrice: Number(product.basePrice),
        costPrice: Number(product.costPrice),
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        inventory: product.storeInventory.map((inv) => ({
          storeId: inv.storeId,
          storeName: inv.store.name,
          storeCode: inv.store.code,
          stockOnHand: inv.stockOnHand,
          priceOverride: inv.priceOverride !== null ? Number(inv.priceOverride) : null,
          effectivePrice:
            inv.priceOverride !== null ? Number(inv.priceOverride) : Number(product.basePrice),
        })),
      };
    });

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: formatted,
    };
  }

  async findOne(id: string, storeId?: string, user?: RequestUser) {
    const scope = user ? resolveStoreScope(user, storeId) : undefined;
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        storeInventory: {
          where: scope
            ? scope.all
              ? undefined
              : scope.storeId
                ? { storeId: scope.storeId }
                : { storeId: { in: scope.storeIds } }
            : undefined,
          include: {
            store: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (storeId) {
      const inv = product.storeInventory.find((i) => i.storeId === storeId);
      const stockOnHand = inv ? inv.stockOnHand : 0;
      const priceOverride = inv && inv.priceOverride !== null ? Number(inv.priceOverride) : null;
      const effectivePrice = priceOverride !== null ? priceOverride : Number(product.basePrice);

      return {
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        basePrice: Number(product.basePrice),
        costPrice: Number(product.costPrice),
        priceOverride,
        effectivePrice,
        stockOnHand,
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    }

    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      basePrice: Number(product.basePrice),
      costPrice: Number(product.costPrice),
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      inventory: product.storeInventory.map((inv) => ({
        storeId: inv.storeId,
        storeName: inv.store.name,
        storeCode: inv.store.code,
        stockOnHand: inv.stockOnHand,
        priceOverride: inv.priceOverride !== null ? Number(inv.priceOverride) : null,
        effectivePrice:
          inv.priceOverride !== null ? Number(inv.priceOverride) : Number(product.basePrice),
      })),
    };
  }

  async create(dto: CreateProductDto) {
    const existingSku = await this.prisma.product.findUnique({
      where: { sku: dto.sku.trim() },
    });
    if (existingSku) {
      throw new ConflictException(`Product with SKU ${dto.sku} already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: dto.sku.trim(),
          barcode: dto.barcode?.trim() || null,
          name: dto.name.trim(),
          basePrice: BigInt(dto.basePrice),
          costPrice: BigInt(dto.costPrice ?? 0),
          isActive: true,
        },
      });

      // Initialize 0 stock across all existing active stores
      const stores = await tx.store.findMany({ select: { id: true } });
      if (stores.length > 0) {
        await tx.storeInventory.createMany({
          data: stores.map((s) => ({
            storeId: s.id,
            productId: product.id,
            stockOnHand: 0,
            priceOverride: null,
          })),
          skipDuplicates: true,
        });
      }

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        basePrice: Number(product.basePrice),
      };
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { sku: dto.sku.trim(), NOT: { id } },
      });
      if (existingSku) {
        throw new ConflictException(`SKU ${dto.sku} is already used by another product`);
      }
    }

    const data: Record<string, any> = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim();
    if (dto.barcode !== undefined) data.barcode = dto.barcode?.trim() || null;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.basePrice !== undefined) data.basePrice = BigInt(dto.basePrice);
    if (dto.costPrice !== undefined) data.costPrice = BigInt(dto.costPrice);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.product.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      sku: updated.sku,
      barcode: updated.barcode,
      name: updated.name,
      basePrice: Number(updated.basePrice),
      costPrice: Number(updated.costPrice),
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    };
  }

  async setPriceOverride(storeId: string, productId: string, dto: SetPriceOverrideDto) {
    // Validate store & product exist
    const [store, product] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.product.findUnique({ where: { id: productId } }),
    ]);

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const priceOverrideBigInt =
      dto.priceOverride !== null && dto.priceOverride !== undefined
        ? BigInt(dto.priceOverride)
        : null;

    const updated = await this.prisma.storeInventory.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: {
        priceOverride: priceOverrideBigInt,
      },
      create: {
        storeId,
        productId,
        stockOnHand: 0,
        priceOverride: priceOverrideBigInt,
      },
    });

    return {
      storeId: updated.storeId,
      productId: updated.productId,
      priceOverride: updated.priceOverride !== null ? Number(updated.priceOverride) : null,
    };
  }
}
