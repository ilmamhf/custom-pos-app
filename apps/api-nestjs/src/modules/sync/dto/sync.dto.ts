import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class SyncShiftDto {
  @ApiProperty({ example: 'd0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({ example: 'b0000000-0000-0000-0000-000000000003' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiProperty({ example: '2026-11-21T08:00:00.000Z' })
  @IsISO8601()
  @IsNotEmpty()
  openedAt!: string;

  @ApiPropertyOptional({ example: '2026-11-21T17:00:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601()
  closedAt?: string | null;

  @ApiProperty({ example: 500000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingCash!: number;

  @ApiPropertyOptional({ example: 1250000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualCash?: number | null;
}

export class SyncSaleItemDto {
  @ApiProperty({ example: 'f0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'c0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 'Kopi Susu Gula Aren' })
  @IsString()
  @IsNotEmpty()
  productNameSnapshot!: string;

  @ApiProperty({ example: 18000, description: 'Client hint; server recomputes from catalog' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ example: 0, description: 'Line discount hint (integer IDR)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ example: 1980, description: 'Line tax hint (integer IDR)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional({ example: 37980, description: 'Line total hint (integer IDR)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lineTotal?: number;
}

export class SyncSaleTenderDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({ example: 40000, description: 'Amount tendered for this payment method (integer IDR)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: 40, description: 'Change given (for cash); defaults to 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  change?: number;

  @ApiPropertyOptional({ example: 'QRIS-REF-12345', description: 'External payment reference (QRIS/Card)' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class SyncSaleDto {
  @ApiProperty({ example: 'e0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'd0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  shiftId!: string;

  @ApiProperty({ example: 'BKS-20261121-0042' })
  @IsString()
  @IsNotEmpty()
  receiptNo!: string;

  @ApiProperty({ example: 36000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotal!: number;

  @ApiProperty({ example: 3960 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxTotal!: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountTotal?: number;

  @ApiProperty({ example: 39960 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  grandTotal!: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.QRIS })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ type: [SyncSaleTenderDto], description: 'Tender breakdown per payment method. Required for CASH, QRIS, CARD, SPLIT. For CASH: amount=tendered, change=change. For QRIS/Card: amount=grandTotal, reference=gateway ref.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSaleTenderDto)
  tenders?: SyncSaleTenderDto[];

  @ApiProperty({ example: '2026-11-21T14:10:00.000Z' })
  @IsISO8601()
  @IsNotEmpty()
  createdAt!: string;

  @ApiProperty({ type: [SyncSaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSaleItemDto)
  items!: SyncSaleItemDto[];
}

export class SyncRefundItemDto {
  @ApiProperty({ example: 'f0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  saleItemId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  refundQty!: number;
}

export class SyncRefundDto {
  @ApiProperty({ example: '90000000-0000-0000-0000-000000000001', description: 'Refund command UUID (idempotency key)' })
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'e0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  saleId!: string;

  @ApiPropertyOptional({
    description: 'Signed offline authorization grant from POST /auth/verify-pin',
  })
  @IsOptional()
  @IsString()
  authorizationToken?: string;

  @ApiPropertyOptional({ example: '123456', description: 'Online manager PIN (alternative to a grant)' })
  @IsOptional()
  @IsString()
  managerPin?: string;

  @ApiPropertyOptional({ example: 'Wrong item ordered' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ type: [SyncRefundItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncRefundItemDto)
  items!: SyncRefundItemDto[];

  @ApiProperty({ example: '2026-11-21T14:30:00.000Z' })
  @IsISO8601()
  @IsNotEmpty()
  createdAt!: string;
}

export class SyncPushDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty({ type: [SyncShiftDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncShiftDto)
  shifts!: SyncShiftDto[];

  @ApiProperty({ type: [SyncSaleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSaleDto)
  sales!: SyncSaleDto[];

  @ApiPropertyOptional({ type: [SyncRefundDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncRefundDto)
  refunds?: SyncRefundDto[];
}

export class SyncPullQueryDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId!: string;

  @ApiPropertyOptional({ example: '2026-11-21T10:00:00.000Z', description: 'ISO timestamp cursor for delta sync' })
  @IsOptional()
  @IsISO8601()
  since?: string;
}
