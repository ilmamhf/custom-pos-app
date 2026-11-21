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
} from 'class-validator';
import { StockLedgerReason } from '@prisma/client';
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
