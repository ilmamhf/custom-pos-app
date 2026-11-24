import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NegativeStockAction,
  NegativeStockPolicy,
  NegativeStockEvent,
  Store,
  Product,
} from '@prisma/client';
import {
  CreateNegativeStockPolicyDto,
  UpdateNegativeStockPolicyDto,
  ResolveNegativeStockEventDto,
  QueryNegativeStockEventsDto,
} from './dto/inventory.dto';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  resolveStoreScope,
  storeScopeWhere,
} from '../../common/utils/store-scope.util';

@Injectable()
export class NegativeStockPolicyService {
  private readonly logger = new Logger(NegativeStockPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  // ========== Policy CRUD ==========

  async getPolicy(storeId?: string | null): Promise<NegativeStockPolicy | null> {
    if (storeId) {
      return this.prisma.negativeStockPolicy.findUnique({ where: { storeId } });
    }
    // Return global default policy (storeId = null)
    return this.prisma.negativeStockPolicy.findFirst({ where: { storeId: null } });
  }

  async getOrCreateDefaultPolicy(): Promise<NegativeStockPolicy> {
    let policy = await this.prisma.negativeStockPolicy.findFirst({ where: { storeId: null } });
    if (!policy) {
      policy = await this.prisma.negativeStockPolicy.create({
        data: {
          storeId: null,
          alertThreshold: 0,
          autoTransferThreshold: -10,
          approvalThreshold: -50,
          writeOffThreshold: -100,
          isActive: true,
        },
      });
    }
    return policy;
  }

  async createPolicy(dto: CreateNegativeStockPolicyDto, user: RequestUser): Promise<NegativeStockPolicy> {
    if (dto.storeId) {
      // Verify store exists
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) {
        throw new NotFoundException(`Store with ID ${dto.storeId} not found`);
      }

      // Check if policy already exists for this store
      const existing = await this.prisma.negativeStockPolicy.findUnique({
        where: { storeId: dto.storeId },
      });
      if (existing) {
        throw new BadRequestException(`Policy already exists for store ${dto.storeId}`);
      }
    } else {
      // Creating global default - ensure only one exists
      const existing = await this.prisma.negativeStockPolicy.findFirst({ where: { storeId: null } });
      if (existing) {
        throw new BadRequestException('Global default policy already exists. Use update instead.');
      }
    }

    const policy = await this.prisma.negativeStockPolicy.create({
      data: {
        storeId: dto.storeId ?? null,
        alertThreshold: dto.alertThreshold ?? 0,
        autoTransferThreshold: dto.autoTransferThreshold ?? -10,
        approvalThreshold: dto.approvalThreshold ?? -50,
        writeOffThreshold: dto.writeOffThreshold ?? -100,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`Created negative stock policy for ${dto.storeId ?? 'global default'}`);
    return policy;
  }

  async updatePolicy(
    storeId: string | null,
    dto: UpdateNegativeStockPolicyDto,
    user: RequestUser,
  ): Promise<NegativeStockPolicy> {
    const where = storeId ? { storeId } : { storeId: null };
    const existing = storeId
      ? await this.prisma.negativeStockPolicy.findUnique({ where: { storeId } })
      : await this.prisma.negativeStockPolicy.findFirst({ where: { storeId: null } });

    if (!existing) {
      throw new NotFoundException(`Policy for ${storeId ?? 'global default'} not found`);
    }

    const policy = await this.prisma.negativeStockPolicy.update({
      where: { id: existing.id },
      data: {
        alertThreshold: dto.alertThreshold,
        autoTransferThreshold: dto.autoTransferThreshold,
        approvalThreshold: dto.approvalThreshold,
        writeOffThreshold: dto.writeOffThreshold,
        isActive: dto.isActive,
      },
    });

    this.logger.log(`Updated negative stock policy for ${storeId ?? 'global default'}`);
    return policy;
  }

  async deletePolicy(storeId: string | null): Promise<void> {
    if (storeId) {
      const policy = await this.prisma.negativeStockPolicy.findUnique({ where: { storeId } });
      if (!policy) {
        throw new NotFoundException(`Policy for store ${storeId} not found`);
      }
      await this.prisma.negativeStockPolicy.delete({ where: { id: policy.id } });
      this.logger.log(`Deleted negative stock policy for store ${storeId}`);
    } else {
      throw new BadRequestException('Cannot delete global default policy');
    }
  }

  async getAllPolicies(): Promise<NegativeStockPolicy[]> {
    return this.prisma.negativeStockPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========== Negative Stock Detection & Handling ==========

  /**
   * Check stock levels against policies and create events for violations.
   * This should be called after any stock change (sale, adjustment, transfer, sync).
   */
  async checkAndHandleNegativeStock(
    storeId: string,
    productId: string,
    newStockOnHand: number,
  ): Promise<NegativeStockEvent | null> {
    // Get the applicable policy (store-specific or global default)
    const policy = await this.getPolicy(storeId) ?? await this.getOrCreateDefaultPolicy();

    if (!policy.isActive) {
      return null;
    }

    // Determine the action based on stock level and policy thresholds
    let action: NegativeStockAction | null = null;

    if (newStockOnHand <= policy.writeOffThreshold) {
      action = NegativeStockAction.WRITE_OFF;
    } else if (newStockOnHand <= policy.approvalThreshold) {
      action = NegativeStockAction.MANAGER_APPROVAL;
    } else if (newStockOnHand <= policy.autoTransferThreshold) {
      action = NegativeStockAction.AUTO_TRANSFER;
    } else if (newStockOnHand <= policy.alertThreshold) {
      action = NegativeStockAction.ALERT_ONLY;
    }

    if (!action) {
      return null; // No action needed
    }

    // Check if an unresolved event already exists for this store+product
    const existingEvent = await this.prisma.negativeStockEvent.findFirst({
      where: {
        storeId,
        productId,
        resolvedAt: null,
      },
    });

    if (existingEvent) {
      // Update existing event if action has escalated
      const actionPriority = this.getActionPriority(action);
      const existingPriority = this.getActionPriority(existingEvent.actionTaken);

      if (actionPriority > existingPriority) {
        this.metrics.recordNegativeStockEvent(action, storeId);
        return this.prisma.negativeStockEvent.update({
          where: { id: existingEvent.id },
          data: {
            actionTaken: action,
            currentStock: newStockOnHand,
            detail: {
              ...(existingEvent.detail as any),
              escalatedFrom: existingEvent.actionTaken,
              escalatedAt: new Date(),
              stockAtEscalation: newStockOnHand,
            },
          },
        });
      }
      return existingEvent;
    }

    // Create new event
    this.metrics.recordNegativeStockEvent(action, storeId);
    const event = await this.prisma.negativeStockEvent.create({
      data: {
        storeId,
        productId,
        currentStock: newStockOnHand,
        actionTaken: action,
        detail: {
          policy: {
            alertThreshold: policy.alertThreshold,
            autoTransferThreshold: policy.autoTransferThreshold,
            approvalThreshold: policy.approvalThreshold,
            writeOffThreshold: policy.writeOffThreshold,
          },
          stockAtDetection: newStockOnHand,
        },
      },
    });

    this.logger.warn(
      `Negative stock event created: store=${storeId}, product=${productId}, stock=${newStockOnHand}, action=${action}`,
    );

    // If AUTO_TRANSFER, attempt to find and transfer from another store
    if (action === NegativeStockAction.AUTO_TRANSFER) {
      await this.attemptAutoTransfer(storeId, productId, event.id);
    }

    return event;
  }

  private getActionPriority(action: NegativeStockAction): number {
    const priorities = {
      [NegativeStockAction.ALERT_ONLY]: 1,
      [NegativeStockAction.AUTO_TRANSFER]: 2,
      [NegativeStockAction.MANAGER_APPROVAL]: 3,
      [NegativeStockAction.WRITE_OFF]: 4,
    };
    return priorities[action] ?? 0;
  }

  /**
   * Attempt to automatically transfer stock from another store.
   */
  private async attemptAutoTransfer(
    storeId: string,
    productId: string,
    eventId: string,
  ): Promise<void> {
    try {
      // Find other stores with available stock
      const otherStores = await this.prisma.storeInventory.findMany({
        where: {
          productId,
          stockOnHand: { gt: 0 },
          storeId: { not: storeId },
        },
        include: { store: true },
        orderBy: { stockOnHand: 'desc' },
      });

      if (otherStores.length === 0) {
        this.logger.warn(`No other stores have stock for product ${productId} to auto-transfer`);
        return;
      }

      // For now, just log the available stores. Actual transfer would require
      // manager approval or a configured transfer policy.
      this.logger.log(
        `Auto-transfer candidates for ${productId} at store ${storeId}: ` +
        otherStores.map(s => `${s.store.code}(${s.stockOnHand})`).join(', '),
      );

      // Update event detail with auto-transfer candidates
      await this.prisma.negativeStockEvent.update({
        where: { id: eventId },
        data: {
          detail: {
            autoTransferCandidates: otherStores.map(s => ({
              storeId: s.storeId,
              storeCode: s.store.code,
              availableStock: s.stockOnHand,
            })),
          },
        },
      });
    } catch (error: any) {
      this.logger.error(`Auto-transfer failed for event ${eventId}: ${error.message}`);
    }
  }

  /**
   * Manually resolve a negative stock event.
   */
  async resolveEvent(
    eventId: string,
    dto: ResolveNegativeStockEventDto,
    user: RequestUser,
  ): Promise<NegativeStockEvent> {
    const event = await this.prisma.negativeStockEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Negative stock event ${eventId} not found`);
    }

    if (event.resolvedAt) {
      throw new BadRequestException('Event already resolved');
    }

    const updated = await this.prisma.negativeStockEvent.update({
      where: { id: eventId },
      data: {
        actionTaken: dto.actionTaken,
        resolvedBy: user.id,
        resolvedAt: new Date(),
        detail: {
          ...(event.detail as any),
          resolvedDetail: dto.detail,
        },
      },
    });

    this.logger.log(`Negative stock event ${eventId} resolved by user ${user.id} with action ${dto.actionTaken}`);
    return updated;
  }

  // ========== Event Queries ==========

  async getEvents(query: QueryNegativeStockEventsDto, user?: RequestUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scope = user ? resolveStoreScope(user, query.storeId) : undefined;

    const where: Record<string, any> = {
      ...(scope ? storeScopeWhere(scope) : query.storeId ? { storeId: query.storeId } : {}),
    };

    if (query.productId) where.productId = query.productId;
    if (query.actionTaken) where.actionTaken = query.actionTaken;

    const [total, items] = await Promise.all([
      this.prisma.negativeStockEvent.count({ where }),
      this.prisma.negativeStockEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          store: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true } },
          resolver: { select: { id: true, name: true } },
        },
      }),
    ]);

    const formatted = items.map((e) => ({
      id: e.id,
      storeId: e.storeId,
      storeName: e.store?.name,
      storeCode: e.store?.code,
      productId: e.productId,
      productName: e.product?.name,
      productSku: e.product?.sku,
      currentStock: e.currentStock,
      actionTaken: e.actionTaken,
      detail: e.detail,
      resolvedBy: e.resolvedBy,
      resolvedByName: e.resolver?.name,
      resolvedAt: e.resolvedAt,
      createdAt: e.createdAt,
    }));

    return { total, page, limit, totalPages: Math.ceil(total / limit), items: formatted };
  }

  async getUnresolvedEvents(storeId?: string): Promise<NegativeStockEvent[]> {
    const where: Record<string, any> = { resolvedAt: null };
    if (storeId) where.storeId = storeId;

    return this.prisma.negativeStockEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        store: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  /**
   * Get summary statistics for negative stock events.
   */
  async getEventStats(storeId?: string) {
    const where: Record<string, any> = {};
    if (storeId) where.storeId = storeId;

    const [total, unresolved, byAction] = await Promise.all([
      this.prisma.negativeStockEvent.count({ where }),
      this.prisma.negativeStockEvent.count({ where: { ...where, resolvedAt: null } }),
      this.prisma.negativeStockEvent.groupBy({
        by: ['actionTaken'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      unresolved,
      byAction: byAction.map((b) => ({ action: b.actionTaken, count: b._count })),
    };
  }

  async getEventById(eventId: string) {
    return this.prisma.negativeStockEvent.findUnique({
      where: { id: eventId },
      include: {
        store: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true } },
        resolver: { select: { id: true, name: true } },
      },
    });
  }
}