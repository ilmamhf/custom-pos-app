import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentProviderDto,
  UpdatePaymentProviderDto,
  PaymentProviderResponseDto,
} from './dto/payment-provider.dto';
import {
  CreatePaymentTransactionDto,
  CapturePaymentDto,
  VoidPaymentDto,
  RefundPaymentDto,
  PaymentTransactionResponseDto,
} from './dto/payment-transaction.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // ========== Payment Provider Endpoints ==========

  @Post('providers')
  @ApiOperation({ summary: 'Create a new payment provider' })
  @ApiResponse({ status: 201, type: PaymentProviderResponseDto })
  async createProvider(@Body() dto: CreatePaymentProviderDto): Promise<PaymentProviderResponseDto> {
    return this.paymentsService.createProvider(dto);
  }

  @Get('providers')
  @ApiOperation({ summary: 'List all payment providers' })
  @ApiResponse({ status: 200, type: [PaymentProviderResponseDto] })
  async getProviders(): Promise<PaymentProviderResponseDto[]> {
    return this.paymentsService.getProviders();
  }

  @Get('providers/default')
  @ApiOperation({ summary: 'Get default payment provider' })
  @ApiResponse({ status: 200, type: PaymentProviderResponseDto, nullable: true })
  async getDefaultProvider(): Promise<PaymentProviderResponseDto | null> {
    return this.paymentsService.getDefaultProvider();
  }

  @Get('providers/:id')
  @ApiOperation({ summary: 'Get payment provider by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentProviderResponseDto })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async getProviderById(@Param('id') id: string): Promise<PaymentProviderResponseDto> {
    return this.paymentsService.getProviderById(id);
  }

  @Put('providers/:id')
  @ApiOperation({ summary: 'Update payment provider' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentProviderResponseDto })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentProviderDto,
  ): Promise<PaymentProviderResponseDto> {
    return this.paymentsService.updateProvider(id, dto);
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete payment provider' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Provider deleted' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  @ApiResponse({ status: 409, description: 'Provider has existing transactions' })
  async deleteProvider(@Param('id') id: string): Promise<void> {
    await this.paymentsService.deleteProvider(id);
  }

  // ========== Payment Transaction Endpoints ==========

  @Post('transactions')
  @ApiOperation({ summary: 'Create a new payment transaction' })
  @ApiResponse({ status: 201, type: PaymentTransactionResponseDto })
  async createTransaction(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePaymentTransactionDto,
  ): Promise<PaymentTransactionResponseDto> {
    return this.paymentsService.createTransaction(dto, user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List payment transactions with filters' })
  @ApiQuery({ name: 'providerId', required: false, type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'saleId', required: false, type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'tenderId', required: false, type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'FAILED', 'SETTLED'] })
  @ApiQuery({ name: 'type', required: false, enum: ['AUTHORIZATION', 'CAPTURE', 'VOID', 'REFUND', 'SETTLEMENT'] })
  @ApiQuery({ name: 'paymentMethod', required: false, enum: ['CASH', 'QRIS', 'CARD', 'SPLIT'] })
  @ApiQuery({ name: 'page', required: false, type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number', example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of transactions' })
  async getTransactions(
    @Query('providerId') providerId?: string,
    @Query('saleId') saleId?: string,
    @Query('tenderId') tenderId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.paymentsService.getTransactions({
      providerId,
      saleId,
      tenderId,
      status: status as any,
      type: type as any,
      paymentMethod: paymentMethod as any,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get payment transaction by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentTransactionResponseDto })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionById(@Param('id') id: string): Promise<PaymentTransactionResponseDto> {
    return this.paymentsService.getTransactionById(id);
  }

  @Post('transactions/:id/authorize')
  @ApiOperation({ summary: 'Authorize a payment transaction' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Transaction not in PENDING status' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async authorizeTransaction(@Param('id') id: string): Promise<PaymentTransactionResponseDto> {
    return this.paymentsService.authorizePayment(id);
  }

  @Post('transactions/:id/capture')
  @ApiOperation({ summary: 'Capture an authorized payment' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Transaction not in AUTHORIZED status' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async captureTransaction(
    @Param('id') id: string,
    @Body() dto: CapturePaymentDto,
  ): Promise<PaymentTransactionResponseDto> {
    return this.paymentsService.capturePayment(id, dto);
  }

  @Post('transactions/:id/void')
  @ApiOperation({ summary: 'Void a payment transaction' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Transaction cannot be voided' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async voidTransaction(
    @Param('id') id: string,
    @Body() dto: VoidPaymentDto,
  ): Promise<PaymentTransactionResponseDto> {
    return this.paymentsService.voidPayment(id, dto);
  }

  @Post('transactions/:id/refund')
  @ApiOperation({ summary: 'Refund a captured payment' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaymentTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Transaction cannot be refunded' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Idempotency key already used' })
  async refundTransaction(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<PaymentTransactionResponseDto> {
    return this.paymentsService.refundPayment(id, dto);
  }

  // ========== Webhook Endpoint ==========

  @Post('webhook/:providerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle payment provider webhook' })
  @ApiParam({ name: 'providerId', type: 'string', format: 'uuid' })
  @ApiBody({ description: 'Provider webhook payload' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid signature or payload' })
  async handleWebhook(
    @Param('providerId') providerId: string,
    @Body() payload: Record<string, any>,
    @Query('signature') signature?: string,
  ): Promise<{ success: boolean; transactionId?: string }> {
    const transaction = await this.paymentsService.handleWebhook(providerId, payload, signature);
    return { success: true, transactionId: transaction?.id };
  }
}