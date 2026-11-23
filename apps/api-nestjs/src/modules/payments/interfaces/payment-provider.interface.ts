import { PaymentMethod, PaymentTransactionType, PaymentTransactionStatus } from '@prisma/client';

export interface PaymentProviderConfig {
  baseUrl: string;
  merchantId: string;
  serverKey: string;
  clientKey?: string;
  isSandbox?: boolean;
}

export interface AuthorizationRequest {
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  reference: string;
  returnUrl?: string;
  customerDetails?: {
    email?: string;
    phone?: string;
    name?: string;
  };
}

export interface AuthorizationResponse {
  success: boolean;
  externalId?: string;
  redirectUrl?: string;
  qrCode?: string;
  qrString?: string;
  status: PaymentTransactionStatus;
  rawResponse: Record<string, any>;
  errorMessage?: string;
}

export interface CaptureRequest {
  externalId: string;
  amount: number;
  reference?: string;
}

export interface CaptureResponse {
  success: boolean;
  externalId: string;
  status: PaymentTransactionStatus;
  rawResponse: Record<string, any>;
  errorMessage?: string;
}

export interface VoidRequest {
  externalId: string;
  reason?: string;
}

export interface VoidResponse {
  success: boolean;
  externalId: string;
  status: PaymentTransactionStatus;
  rawResponse: Record<string, any>;
  errorMessage?: string;
}

export interface RefundRequest {
  externalId: string;
  amount: number;
  reason?: string;
  idempotencyKey?: string;
}

export interface RefundResponse {
  success: boolean;
  externalId: string;
  refundId?: string;
  status: PaymentTransactionStatus;
  rawResponse: Record<string, any>;
  errorMessage?: string;
}

export interface PaymentTransactionData {
  id: string;
  providerId: string;
  saleId?: string;
  tenderId?: string;
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  externalId?: string;
  reference?: string;
  requestPayload?: Record<string, any>;
  responsePayload?: Record<string, any>;
  errorMessage?: string;
  idempotencyKey?: string;
}

export interface IPaymentProvider {
  readonly type: string;
  readonly supportedMethods: PaymentMethod[];

  /**
   * Authorize a payment (e.g., create QRIS code, initiate card auth)
   */
  authorize(request: AuthorizationRequest): Promise<AuthorizationResponse>;

  /**
   * Capture a previously authorized payment
   */
  capture(request: CaptureRequest): Promise<CaptureResponse>;

  /**
   * Void a previously authorized but not captured payment
   */
  void(request: VoidRequest): Promise<VoidResponse>;

  /**
   * Refund a captured/settled payment
   */
  refund(request: RefundRequest): Promise<RefundResponse>;

  /**
   * Get transaction status from provider
   */
  getStatus(externalId: string): Promise<{ status: PaymentTransactionStatus; rawResponse: Record<string, any> }>;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean;

  /**
   * Parse webhook payload into transaction update
   */
  parseWebhook(payload: Record<string, any>): {
    externalId: string;
    status: PaymentTransactionStatus;
    rawResponse: Record<string, any>;
  } | null;
}