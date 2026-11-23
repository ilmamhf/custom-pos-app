import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, PaymentTransactionType, PaymentTransactionStatus } from '@prisma/client';

export class CreatePaymentTransactionDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  providerId!: string;

  @ApiPropertyOptional({ example: 'e0000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsUUID('4')
  saleId?: string;

  @ApiPropertyOptional({ example: 'f0000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsUUID('4')
  tenderId?: string;

  @ApiProperty({ enum: PaymentTransactionType, example: PaymentTransactionType.AUTHORIZATION })
  @IsEnum(PaymentTransactionType)
  type!: PaymentTransactionType;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.QRIS })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({ example: 50000, description: 'Amount in minor units (IDR)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'IDR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'ORD-20261123-001', description: 'Merchant reference/order ID' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'txn-abc123', description: 'Idempotency key for duplicate prevention' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Provider-specific request payload' })
  @IsOptional()
  requestPayload?: Record<string, any>;
}

export class CapturePaymentDto {
  @ApiProperty({ example: 50000, description: 'Amount to capture in minor units (IDR)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'CAP-20261123-001', description: 'Capture reference' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class VoidPaymentDto {
  @ApiPropertyOptional({ example: 'Customer cancelled', description: 'Void reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RefundPaymentDto {
  @ApiProperty({ example: 25000, description: 'Amount to refund in minor units (IDR)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'Customer requested refund', description: 'Refund reason' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: 'refund-abc123', description: 'Idempotency key for duplicate prevention' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class PaymentTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  providerId!: string;

  @ApiPropertyOptional()
  saleId?: string | null;

  @ApiPropertyOptional()
  tenderId?: string | null;

  @ApiProperty({ enum: PaymentTransactionType })
  type!: PaymentTransactionType;

  @ApiProperty({ enum: PaymentTransactionStatus })
  status!: PaymentTransactionStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  amount!: number | bigint;

  @ApiProperty()
  currency!: string;

  @ApiPropertyOptional()
  externalId?: string | null;

  @ApiPropertyOptional()
  reference?: string | null;

  @ApiPropertyOptional()
  requestPayload?: Record<string, any> | string | number | boolean | null | any[];

  @ApiPropertyOptional()
  responsePayload?: Record<string, any> | string | number | boolean | null | any[];

  @ApiPropertyOptional()
  errorMessage?: string | null;

  @ApiPropertyOptional()
  idempotencyKey?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  settledAt?: Date | null;
}