import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PaymentMethod, PaymentTransactionType, PaymentTransactionStatus } from '@prisma/client';
import { IPaymentProvider, PaymentProviderConfig, AuthorizationRequest, AuthorizationResponse, CaptureRequest, CaptureResponse, VoidRequest, VoidResponse, RefundRequest, RefundResponse } from '../interfaces/payment-provider.interface';
import { randomUUID } from 'crypto';

// Re-export the interface for consumers
export { IPaymentProvider };
export type { PaymentProviderConfig, AuthorizationRequest, AuthorizationResponse, CaptureRequest, CaptureResponse, VoidRequest, VoidResponse, RefundRequest, RefundResponse };

@Injectable()
export class GenericPaymentProvider implements IPaymentProvider {
  readonly type = 'generic';
  readonly supportedMethods: PaymentMethod[] = [PaymentMethod.QRIS, PaymentMethod.CARD];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private getConfig(): PaymentProviderConfig {
    return this.configService.get<PaymentProviderConfig>('payment.generic') ?? {
      baseUrl: 'https://api.payment-gateway.example',
      merchantId: 'MERCHANT_ID',
      serverKey: 'SERVER_KEY',
      isSandbox: true,
    };
  }

  private getHeaders() {
    const config = this.getConfig();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.serverKey}`,
      'X-Merchant-Id': config.merchantId,
    };
  }

  private getBaseUrl(): string {
    const config = this.getConfig();
    return config.baseUrl;
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const url = `${this.getBaseUrl()}/v1/payments/authorize`;
      const payload = {
        amount: request.amount,
        currency: request.currency,
        payment_method: request.paymentMethod,
        reference: request.reference,
        return_url: request.returnUrl,
        customer: request.customerDetails,
        metadata: {
          source: 'pos',
          payment_method: request.paymentMethod,
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );

      return this.mapAuthorizationResponse(response.data, request.paymentMethod);
    } catch (error) {
      return this.handleError<AuthorizationResponse>(error, 'authorization', (data: any) => this.mapAuthorizationResponse(data, request.paymentMethod));
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    try {
      const url = `${this.getBaseUrl()}/v1/payments/${request.externalId}/capture`;
      const payload = {
        amount: request.amount,
        reference: request.reference,
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );

      return this.mapCaptureResponse(response.data);
    } catch (error) {
      return this.handleError<CaptureResponse>(error, 'capture', this.mapCaptureResponse.bind(this));
    }
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    try {
      const url = `${this.getBaseUrl()}/v1/payments/${request.externalId}/void`;
      const payload = {
        reason: request.reason,
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );

      return this.mapVoidResponse(response.data);
    } catch (error) {
      return this.handleError<VoidResponse>(error, 'void', this.mapVoidResponse.bind(this));
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      const url = `${this.getBaseUrl()}/v1/payments/${request.externalId}/refunds`;
      const payload = {
        amount: request.amount,
        reason: request.reason,
        idempotency_key: request.idempotencyKey ?? randomUUID(),
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );

      return this.mapRefundResponse(response.data);
    } catch (error) {
      return this.handleError<RefundResponse>(error, 'refund', this.mapRefundResponse.bind(this));
    }
  }

  async getStatus(externalId: string): Promise<{ status: PaymentTransactionStatus; rawResponse: Record<string, any> }> {
    try {
      const url = `${this.getBaseUrl()}/v1/payments/${externalId}`;
      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.getHeaders() }),
      );

      const status = this.mapProviderStatus(response.data.status);
      return { status, rawResponse: response.data };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get payment status: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  verifyWebhook(payload: string, signature: string): boolean {
    // In a real implementation, verify the signature using provider's algorithm
    // For generic provider, we'll use a simple HMAC verification
    const crypto = require('crypto');
    const config = this.getConfig();
    const expectedSignature = crypto
      .createHmac('sha256', config.serverKey)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  parseWebhook(payload: Record<string, any>): { externalId: string; status: PaymentTransactionStatus; rawResponse: Record<string, any> } | null {
    // Generic webhook parsing - providers should override this
    const externalId = payload.transaction_id ?? payload.external_id ?? payload.id;
    const providerStatus = payload.status ?? payload.transaction_status;
    
    if (!externalId || !providerStatus) {
      return null;
    }

    return {
      externalId,
      status: this.mapProviderStatus(providerStatus),
      rawResponse: payload,
    };
  }

  private mapProviderStatus(providerStatus: string): PaymentTransactionStatus {
    const statusMap: Record<string, PaymentTransactionStatus> = {
      pending: PaymentTransactionStatus.PENDING,
      authorized: PaymentTransactionStatus.AUTHORIZED,
      capture: PaymentTransactionStatus.CAPTURED,
      captured: PaymentTransactionStatus.CAPTURED,
      settled: PaymentTransactionStatus.SETTLED,
      settlement: PaymentTransactionStatus.SETTLED,
      voided: PaymentTransactionStatus.VOIDED,
      cancelled: PaymentTransactionStatus.VOIDED,
      expired: PaymentTransactionStatus.FAILED,
      failed: PaymentTransactionStatus.FAILED,
      denied: PaymentTransactionStatus.FAILED,
      refunded: PaymentTransactionStatus.REFUNDED,
      partial_refund: PaymentTransactionStatus.REFUNDED,
    };

    return statusMap[providerStatus.toLowerCase()] ?? PaymentTransactionStatus.PENDING;
  }

  private mapAuthorizationResponse(data: any, paymentMethod: PaymentMethod): AuthorizationResponse {
    const success = data.status === 'pending' || data.status === 'authorized';
    const status = this.mapProviderStatus(data.status);

    let redirectUrl: string | undefined;
    let qrCode: string | undefined;
    let qrString: string | undefined;

    if (paymentMethod === PaymentMethod.QRIS) {
      qrCode = data.qr_code ?? data.qr_image_url;
      qrString = data.qr_string ?? data.qris_data;
    } else if (paymentMethod === PaymentMethod.CARD) {
      redirectUrl = data.redirect_url ?? data.payment_url;
    }

    return {
      success,
      externalId: data.transaction_id ?? data.external_id ?? data.id,
      redirectUrl,
      qrCode,
      qrString,
      status,
      rawResponse: data,
    };
  }

  private mapCaptureResponse(data: any): CaptureResponse {
    const success = data.status === 'captured' || data.status === 'settled';
    return {
      success,
      externalId: data.transaction_id ?? data.external_id ?? data.id,
      status: this.mapProviderStatus(data.status),
      rawResponse: data,
    };
  }

  private mapVoidResponse(data: any): VoidResponse {
    const success = data.status === 'voided' || data.status === 'cancelled';
    return {
      success,
      externalId: data.transaction_id ?? data.external_id ?? data.id,
      status: this.mapProviderStatus(data.status),
      rawResponse: data,
    };
  }

  private mapRefundResponse(data: any): RefundResponse {
    const success = data.status === 'refunded' || data.status === 'partial_refund';
    return {
      success,
      externalId: data.transaction_id ?? data.external_id ?? data.id,
      refundId: data.refund_id ?? data.id,
      status: this.mapProviderStatus(data.status),
      rawResponse: data,
    };
  }

  private handleError<T extends AuthorizationResponse | CaptureResponse | VoidResponse | RefundResponse>(
    error: any,
    operation: string,
    mapFn: (data: any) => T,
  ): T {
    const errorMessage = error.response?.data?.message ?? error.message ?? 'Unknown error';
    const rawResponse = error.response?.data ?? { message: errorMessage };

    if (error.response?.status === 409) {
      return {
        success: false,
        externalId: rawResponse.transaction_id ?? rawResponse.external_id,
        status: PaymentTransactionStatus.FAILED,
        rawResponse,
        errorMessage: `Duplicate ${operation} request`,
      } as T;
    }

    return {
      success: false,
      status: PaymentTransactionStatus.FAILED,
      rawResponse,
      errorMessage,
    } as T;
  }
}