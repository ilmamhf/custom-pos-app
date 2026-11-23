import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenShiftDto, CloseShiftDto, QueryShiftDto } from './dto/shift.dto';
import { Role, SaleStatus } from '@prisma/client';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  assertStoreInScope,
  resolveStoreScope,
  storeScopeWhere,
} from '../../common/utils/store-scope.util';
import { expectedCashForSales } from '../../common/utils/shift-cash.util';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async openShift(userId: string, dto: OpenShiftDto, canonicalStoreId?: string) {
    const storeId = canonicalStoreId ?? dto.storeId;
    const existing = await this.prisma.shift.findUnique({
      where: { id: dto.id },
    });

    if (existing) {
      return {
        id: existing.id,
        openedAt: existing.openedAt,
        openingCash: Number(existing.openingCash),
      };
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    const shift = await this.prisma.shift.create({
      data: {
        id: dto.id,
        storeId,
        userId,
        openedAt: new Date(),
        openingCash: BigInt(dto.openingCash),
      },
    });

    return {
      id: shift.id,
      openedAt: shift.openedAt,
      openingCash: Number(shift.openingCash),
    };
  }

  async closeShift(shiftId: string, dto: CloseShiftDto, user?: RequestUser) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        sales: {
          include: {
            saleItems: true,
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift with ID ${shiftId} not found`);
    }

    if (user) {
      assertStoreInScope(resolveStoreScope(user), shift.storeId);
      const isManagerOrOwner =
        user.role === Role.OWNER || user.role === Role.MANAGER;
      if (!isManagerOrOwner && shift.userId !== user.id) {
        throw new ForbiddenException('This shift belongs to another cashier');
      }
    }

    if (shift.closedAt) {
      throw new ConflictException(`Shift with ID ${shiftId} has already been closed`);
    }

    const expectedCash = expectedCashForSales(
      shift.openingCash,
      shift.sales.map((sale) => ({
        paymentMethod: sale.paymentMethod,
        grandTotal: sale.grandTotal,
        saleItems: sale.saleItems,
      })),
    );
    const actualCash = BigInt(dto.actualCash);
    const variance = actualCash - expectedCash;
    const closedAt = new Date();

    const updated = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt,
        expectedCash,
        actualCash,
      },
    });

    return {
      id: updated.id,
      closedAt: updated.closedAt,
      openingCash: Number(updated.openingCash),
      expectedCash: Number(updated.expectedCash),
      actualCash: Number(updated.actualCash),
      variance: Number(variance),
    };
  }

  async findAll(query: QueryShiftDto, user?: RequestUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scope = user ? resolveStoreScope(user, query.storeId) : undefined;

    const where: Record<string, any> = {
      ...(scope ? storeScopeWhere(scope) : query.storeId ? { storeId: query.storeId } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.shift.count({ where }),
      this.prisma.shift.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
          store: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    const formatted = items.map((s) => ({
      id: s.id,
      storeId: s.storeId,
      storeName: s.store.name,
      userId: s.userId,
      userName: s.user.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingCash: Number(s.openingCash),
      expectedCash: s.expectedCash !== null ? Number(s.expectedCash) : null,
      actualCash: s.actualCash !== null ? Number(s.actualCash) : null,
      variance:
        s.actualCash !== null && s.expectedCash !== null
          ? Number(s.actualCash) - Number(s.expectedCash)
          : null,
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
