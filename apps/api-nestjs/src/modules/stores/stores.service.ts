import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.store.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: {
        userStores: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${id} not found`);
    }

    return store;
  }

  async create(dto: CreateStoreDto) {
    const existing = await this.prisma.store.findUnique({
      where: { code: dto.code.toUpperCase().trim() },
    });

    if (existing) {
      throw new ConflictException(`Store with code ${dto.code} already exists`);
    }

    const store = await this.prisma.store.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase().trim(),
        address: dto.address,
        taxRateBps: dto.taxRateBps ?? 1100,
        isActive: true,
      },
    });

    // Automatically initialize stockOnHand: 0 for all existing products for this new store
    const products = await this.prisma.product.findMany({ select: { id: true } });
    if (products.length > 0) {
      await this.prisma.storeInventory.createMany({
        data: products.map((p) => ({
          storeId: store.id,
          productId: p.id,
          stockOnHand: 0,
          priceOverride: null,
        })),
        skipDuplicates: true,
      });
    }

    return store;
  }

  async update(id: string, dto: UpdateStoreDto) {
    await this.findOne(id);

    return this.prisma.store.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.taxRateBps !== undefined && { taxRateBps: dto.taxRateBps }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
