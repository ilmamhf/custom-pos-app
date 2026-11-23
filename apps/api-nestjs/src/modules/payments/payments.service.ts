import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentProvider, PaymentTransaction, PaymentMethod, PaymentTransactionType, PaymentTransactionStatus } from '@prisma/client';
import { CreatePaymentProviderDto, UpdatePaymentProviderDto } from './dto/payment-provider.dto';
import { CreatePaymentTransactionDto, CapturePaymentDto, VoidPaymentDto, RefundPaymentDto } from './dto/payment-transaction.dto';
import { IPaymentProvider, GenericPaymentProvider } from './providers/generic-payment.provider';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<string, IPaymentProvider> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly genericProvider: GenericPaymentProvider,
  ) {
    this.providers.set('generic', this.genericProvider);
  }

  // ========== Payment Provider Management ==========

  async createProvider(dto: CreatePaymentProviderDto): Promise<PaymentProvider> {
    if (dto.isDefault) {
      await this.prisma.paymentProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await this.prisma.paymentProvider.create({
      data: {
        name: dto.name,
        type: dto.type,
        config: dto.config as any,
        supportedMethods: dto.supportedMethods,
        isDefault: dto.isDefault ?? false,
      },
    });

    this.logger.log(`Created payment provider: ${provider.name} (${provider.id})`);
    return provider;
  }

  async getProviders(): Promise<PaymentProvider[]> {
    return this.prisma.paymentProvider.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProviderById(id: string): Promise<PaymentProvider> {
    const provider = await this.prisma.paymentProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`Payment provider with ID ${id} not found`);
    }
    return provider;
  }

  async getDefaultProvider(): Promise<PaymentProvider | null> {
    return this.prisma.paymentProvider.findFirst({
      where: { isDefault: true, isActive: true },
    });
  }

  async getProviderForMethod(paymentMethod: PaymentMethod): Promise<PaymentProvider | null> {
    const providers = await this.prisma.paymentProvider.findMany({
      where: {
        isActive: true,
        supportedMethods: { has: paymentMethod },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return providers[0] ?? null;
  }

  async updateProvider(id: string, dto: UpdatePaymentProviderDto): Promise<PaymentProvider> {
    const provider = await this.getProviderById(id);

    if (dto.isDefault && !provider.isDefault) {
      await this.prisma.paymentProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.paymentProvider.update({
      where: { id },
      data: {
        name: dto.name,
        config: dto.config as any,
        supportedMethods: dto.supportedMethods,
        isActive: dto.isActive,
        isDefault: dto.isDefault,
      },
    });
  }

  async deleteProvider(id: string): Promise<void> {
    const provider = await this.getProviderById(id);

    const transactionsCount = await this.prisma.paymentTransaction.count({
      where: { providerId: id },
    });

    if (transactionsCount > 0) {
      throw new ConflictException('Cannot delete provider with existing transactions. Deactivate instead.');
    }

    await this.prisma.paymentProvider.delete({ where: { id } });
    this.logger.log(`Deleted payment provider: ${provider.name} (${provider.id})`);
  }

  // ========== Payment Transaction Operations ==========

  async createTransaction(dto: CreatePaymentTransactionDto, currentUserId: string): Promise<PaymentTransaction> {
    const provider = await this.getProviderById(dto.providerId);

    if (!provider.isActive) {
      throw new BadRequestException('Payment provider is not active');
    }

    if (!provider.supportedMethods.includes(dto.paymentMethod)) {
      throw new BadRequestException(`Provider does not support payment method: ${dto.paymentMethod}`);
    }

    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.paymentTransaction.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Transaction with this idempotency key already exists');
      }
    }

    // Validate sale/tender if provided
    if (dto.saleId) {
      const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId } });
      if (!sale) {
        throw new NotFoundException(`Sale with ID ${dto.saleId} not found`);
      }
    }

    if (dto.tenderId) {
      const tender = await this.prisma.saleTender.findUnique({ where: { id: dto.tenderId } });
      if (!tender) {
        throw new NotFoundException(`Tender with ID ${dto.tenderId} not found`);
      }
    }

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        providerId: dto.providerId,
        saleId: dto.saleId,
        tenderId: dto.tenderId,
        type: dto.type,
        status: PaymentTransactionStatus.PENDING,
        paymentMethod: dto.paymentMethod,
        amount: BigInt(dto.amount),
        currency: dto.currency ?? 'IDR',
        reference: dto.reference,
        requestPayload: dto.requestPayload as any,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    return transaction;
  }

  async authorizePayment(transactionId: string): Promise<PaymentTransaction> {
    const transaction = await this.getTransactionById(transactionId);
    if (transaction.type !== PaymentTransactionType.AUTHORIZATION) {
      throw new BadRequestException('Transaction is not an authorization type');
    }
    if (transaction.status !== PaymentTransactionStatus.PENDING) {
      throw new BadRequestException(`Cannot authorize transaction in status: ${transaction.status}`);
    }

    const provider = await this.getProviderInstance(transaction.providerId);
    const config = await this.getProviderConfig(transaction.providerId);

    const request = {
      amount: Number(transaction.amount),
      currency: transaction.currency,
      paymentMethod: transaction.paymentMethod,
      reference: transaction.reference ?? `AUTH-${transaction.id.slice(0, 8)}`,
      returnUrl: config.returnUrl,
      customerDetails: config.customerDetails,
    };

    const response = await provider.authorize(request);

    const updated = await this.prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: response.success ? PaymentTransactionStatus.AUTHORIZED : PaymentTransactionStatus.FAILED,
        externalId: response.externalId,
        responsePayload: response.rawResponse as any,
        errorMessage: response.errorMessage,
      },
    });

    // If linked to a tender, update the tender reference
    if (transaction.tenderId && response.externalId) {
      await this.prisma.saleTender.update({
        where: { id: transaction.tenderId },
        data: { reference: response.externalId },
      });
    }

    this.logger.log(`Authorization ${response.success ? 'succeeded' : 'failed'} for transaction ${transactionId}`);
    return updated;
  }

  async capturePayment(transactionId: string, dto: CapturePaymentDto): Promise<PaymentTransaction> {
    const transaction = await this.getTransactionById(transactionId);
    if (transaction.type !== PaymentTransactionType.CAPTURE) {
      throw new BadRequestException('Transaction is not a capture type');
    }
    if (transaction.status !== PaymentTransactionStatus.AUTHORIZED) {
      throw new BadRequestException(`Cannot capture transaction in status: ${transaction.status}`);
    }
    if (!transaction.externalId) {
      throw new BadRequestException('Transaction has no external ID (not authorized)');
    }

    const provider = await this.getProviderInstance(transaction.providerId);

    const request = {
      externalId: transaction.externalId,
      amount: dto.amount,
      reference: dto.reference,
    };

    const response = await provider.capture(request);

    const updated = await this.prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: response.success ? PaymentTransactionStatus.CAPTURED : PaymentTransactionStatus.FAILED,
        amount: BigInt(dto.amount),
        responsePayload: response.rawResponse as any,
        errorMessage: response.errorMessage,
        settledAt: response.success ? new Date() : null,
      },
    });

    this.logger.log(`Capture ${response.success ? 'succeeded' : 'failed'} for transaction ${transactionId}`);
    return updated;
  }

  async voidPayment(transactionId: string, dto: VoidPaymentDto): Promise<PaymentTransaction> {
    const transaction = await this.getTransactionById(transactionId);
    if (transaction.type !== PaymentTransactionType.VOID) {
      throw new BadRequestException('Transaction is not a void type');
    }
    const voidableStatuses: PaymentTransactionStatus[] = [PaymentTransactionStatus.PENDING, PaymentTransactionStatus.AUTHORIZED];
    if (!voidableStatuses.includes(transaction.status)) {
      throw new BadRequestException(`Cannot void transaction in status: ${transaction.status}`);
    }
    if (!transaction.externalId) {
      throw new BadRequestException('Transaction has no external ID');
    }

    const provider = await this.getProviderInstance(transaction.providerId);

    const request = {
      externalId: transaction.externalId,
      reason: dto.reason,
    };

    const response = await provider.void(request);

    const updated = await this.prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: response.success ? PaymentTransactionStatus.VOIDED : PaymentTransactionStatus.FAILED,
        responsePayload: response.rawResponse as any,
        errorMessage: response.errorMessage,
      },
    });

    this.logger.log(`Void ${response.success ? 'succeeded' : 'failed'} for transaction ${transactionId}`);
    return updated;
  }

  async refundPayment(transactionId: string, dto: RefundPaymentDto): Promise<PaymentTransaction> {
    const transaction = await this.getTransactionById(transactionId);
    if (transaction.type !== PaymentTransactionType.REFUND) {
      throw new BadRequestException('Transaction is not a refund type');
    }
    const refundableStatuses: PaymentTransactionStatus[] = [PaymentTransactionStatus.CAPTURED, PaymentTransactionStatus.SETTLED];
    if (!refundableStatuses.includes(transaction.status)) {
      throw new BadRequestException(`Cannot refund transaction in status: ${transaction.status}`);
    }
    if (!transaction.externalId) {
      throw new BadRequestException('Transaction has no external ID');
    }
    if (dto.amount > Number(transaction.amount)) {
      throw new BadRequestException('Refund amount cannot exceed original transaction amount');
    }

    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.paymentTransaction.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Refund with this idempotency key already exists');
      }
    }

    const provider = await this.getProviderInstance(transaction.providerId);

    const request = {
      externalId: transaction.externalId,
      amount: dto.amount,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    };

    const response = await provider.refund(request);

    const updated = await this.prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: response.success ? PaymentTransactionStatus.REFUNDED : PaymentTransactionStatus.FAILED,
        responsePayload: response.rawResponse as any,
        errorMessage: response.errorMessage,
      },
    });

    this.logger.log(`Refund ${response.success ? 'succeeded' : 'failed'} for transaction ${transactionId}`);
    return updated;
  }

  async getTransactionById(id: string): Promise<PaymentTransaction> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!transaction) {
      throw new NotFoundException(`Payment transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async getTransactions(filters: {
    providerId?: string;
    saleId?: string;
    tenderId?: string;
    status?: PaymentTransactionStatus;
    type?: PaymentTransactionType;
    paymentMethod?: PaymentMethod;
    page?: number;
    limit?: number;
  }): Promise<{ data: PaymentTransaction[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.providerId) where.providerId = filters.providerId;
    if (filters.saleId) where.saleId = filters.saleId;
    if (filters.tenderId) where.tenderId = filters.tenderId;
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    const [total, data] = await Promise.all([
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { provider: true },
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async handleWebhook(providerId: string, payload: Record<string, any>, signature?: string): Promise<PaymentTransaction | null> {
    const provider = await this.getProviderInstance(providerId);

    if (signature && !provider.verifyWebhook(JSON.stringify(payload), signature)) {
      this.logger.warn(`Invalid webhook signature for provider ${providerId}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    const parsed = provider.parseWebhook(payload);
    if (!parsed) {
      this.logger.warn(`Could not parse webhook payload for provider ${providerId}`);
      return null;
    }

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { externalId: parsed.externalId, providerId },
    });

    if (!transaction) {
      this.logger.warn(`No transaction found for external ID ${parsed.externalId} from provider ${providerId}`);
      return null;
    }

    if (transaction.status === parsed.status) {
      return transaction; // No change
    }

    const settledStatuses: PaymentTransactionStatus[] = [PaymentTransactionStatus.SETTLED, PaymentTransactionStatus.REFUNDED, PaymentTransactionStatus.VOIDED];
    const updated = await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: parsed.status,
        responsePayload: parsed.rawResponse as any,
        settledAt: settledStatuses.includes(parsed.status)
          ? new Date()
          : undefined,
      },
    });

    this.logger.log(`Webhook updated transaction ${transaction.id} to status ${parsed.status}`);
    return updated;
  }

  // ========== Helper Methods ==========

  private async getProviderInstance(providerId: string): Promise<IPaymentProvider> {
    const provider = await this.prisma.paymentProvider.findUnique({ where: { id: providerId } });
    if (!provider) {
      throw new NotFoundException(`Payment provider with ID ${providerId} not found`);
    }

    // For now, use generic provider for all types
    // In production, you'd instantiate specific provider classes based on type
    return this.genericProvider;
  }

  private async getProviderConfig(providerId: string): Promise<{ returnUrl?: string; customerDetails?: any }> {
    const provider = await this.prisma.paymentProvider.findUnique({ where: { id: providerId } });
    const config = provider?.config as any;
    return {
      returnUrl: config?.returnUrl,
      customerDetails: config?.customerDetails,
    };
  }
}