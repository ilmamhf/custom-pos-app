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

  @ApiProperty({ example: 18000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;
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
