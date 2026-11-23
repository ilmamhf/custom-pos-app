import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  NotEquals,
  Max,
} from 'class-validator';
import { StockLedgerReason, NegativeStockAction } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AdjustInventoryDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty({ example: 'c0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 50, description: 'Positive for restock, positive or negative for adjustment' })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0, { message: 'deltaQty cannot be zero' })
  deltaQty!: number;

  @ApiProperty({ enum: [StockLedgerReason.RESTOCK, StockLedgerReason.ADJUSTMENT], example: StockLedgerReason.RESTOCK })
  @IsEnum(StockLedgerReason)
  reason!: StockLedgerReason;

  @ApiPropertyOptional({ example: 'Supplier delivery #88' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class TransferInventoryDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  fromStoreId!: string;

  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000002' })
  @IsUUID('4')
  @IsNotEmpty()
  toStoreId!: string;

  @ApiProperty({ example: 'c0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 15, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ example: 'Restock cabang Kemang' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class QueryInventoryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by store UUID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filter by low stock (stock <= 10)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lowStockOnly?: boolean;

  @ApiPropertyOptional({ description: 'Filter by negative stock (stock < 0)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  negativeOnly?: boolean;

  @ApiPropertyOptional({ description: 'Search product name or SKU' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class QueryLedgerDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by store UUID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filter by product UUID' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ enum: StockLedgerReason, description: 'Filter by movement reason' })
  @IsOptional()
  @IsEnum(StockLedgerReason)
  reason?: StockLedgerReason;
}

// ========== Negative Stock Policy DTOs ==========

export class CreateNegativeStockPolicyDto {
  @ApiPropertyOptional({ example: 'a0000000-0000-0000-0000-000000000001', description: 'Store UUID (omit for global default policy)' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Stock level at which to send alert (default: 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  alertThreshold?: number;

  @ApiPropertyOptional({ example: -10, description: 'Stock level at which to trigger auto-transfer (default: -10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(0)
  autoTransferThreshold?: number;

  @ApiPropertyOptional({ example: -50, description: 'Stock level at which manager approval is required (default: -50)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(0)
  approvalThreshold?: number;

  @ApiPropertyOptional({ example: -100, description: 'Stock level at which to write off as loss (default: -100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(0)
  writeOffThreshold?: number;

  @ApiPropertyOptional({ example: true, description: 'Whether the policy is active (default: true)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNegativeStockPolicyDto {
  @ApiPropertyOptional({ example: 0, description: 'Stock level at which to send alert' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  alertThreshold?: number;

  @ApiPropertyOptional({ example: -10, description: 'Stock level at which to trigger auto-transfer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(0)
  autoTransferThreshold?: number;

  @ApiPropertyOptional({ example: -50, description: 'Stock level at which manager approval is required' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(0)
  approvalThreshold?: number;

  @ApiPropertyOptional({ example: -100, description: 'Stock level at which to write off as loss' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(0)
  writeOffThreshold?: number;

  @ApiPropertyOptional({ example: true, description: 'Whether the policy is active' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

export class NegativeStockPolicyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  storeId?: string | null;

  @ApiProperty()
  alertThreshold!: number;

  @ApiProperty()
  autoTransferThreshold!: number;

  @ApiProperty()
  approvalThreshold!: number;

  @ApiProperty()
  writeOffThreshold!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class NegativeStockEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  currentStock!: number;

  @ApiProperty({ enum: NegativeStockAction })
  actionTaken!: NegativeStockAction;

  @ApiPropertyOptional()
  detail?: Record<string, any> | string | number | boolean | null | any[];

  @ApiPropertyOptional()
  resolvedBy?: string | null;

  @ApiPropertyOptional()
  resolvedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class ResolveNegativeStockEventDto {
  @ApiProperty({ enum: NegativeStockAction, example: NegativeStockAction.MANAGER_APPROVAL })
  @IsEnum(NegativeStockAction)
  actionTaken!: NegativeStockAction;

  @ApiPropertyOptional({ example: 'Approved by manager John Doe', description: 'Resolution detail' })
  @IsOptional()
  @IsString()
  detail?: string;
}

export class QueryNegativeStockEventsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by store UUID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filter by product UUID' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ enum: NegativeStockAction, description: 'Filter by action taken' })
  @IsOptional()
  @IsEnum(NegativeStockAction)
  actionTaken?: NegativeStockAction;
}
