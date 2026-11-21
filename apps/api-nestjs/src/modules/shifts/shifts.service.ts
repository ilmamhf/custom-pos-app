import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenShiftDto, CloseShiftDto, QueryShiftDto } from './dto/shift.dto';
import { PaymentMethod, SaleStatus } from '@prisma/client';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async openShift(userId: string, dto: OpenShiftDto) {
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

    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${dto.storeId} not found`);
    }

    const shift = await this.prisma.shift.create({
      data: {
        id: dto.id,
        storeId: dto.storeId,
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

  async closeShift(shiftId: string, dto: CloseShiftDto) {
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

    if (shift.closedAt) {
      throw new ConflictException(`Shift with ID ${shiftId} has already been closed`);
    }

    // Expected cash calculation:
    // opening_cash + cash_sales - cash_refunds
    const openingCash = Number(shift.openingCash);

    // Sum cash sales
    let cashSales = 0;
    let cashRefunds = 0;

    for (const sale of shift.sales) {
      if (sale.paymentMethod === PaymentMethod.CASH) {
        if (sale.status === SaleStatus.COMPLETED) {
          cashSales += Number(sale.grandTotal);
        } else if (sale.status === SaleStatus.PARTIALLY_REFUNDED || sale.status === SaleStatus.REFUNDED) {
          cashSales += Number(sale.grandTotal);
          // calculate cash refund portion
          for (const item of sale.saleItems) {
            if (item.refundedQty > 0) {
              const itemPrice = Number(item.unitPrice) * item.refundedQty;
              // Add approximate tax
              cashRefunds += itemPrice;
            }
          }
        }
      }
    }

    const expectedCash = openingCash + cashSales - cashRefunds;
    const actualCash = dto.actualCash;
    const variance = actualCash - expectedCash;
    const closedAt = new Date();

    const updated = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt,
        expectedCash: BigInt(expectedCash),
        actualCash: BigInt(actualCash),
      },
    });

    return {
      id: updated.id,
      closedAt: updated.closedAt,
      openingCash: Number(updated.openingCash),
      expectedCash: Number(updated.expectedCash),
      actualCash: Number(updated.actualCash),
      variance,
    };
  }

  async findAll(query: QueryShiftDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};
    if (query.storeId) {
      where.storeId = query.storeId;
    }

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
