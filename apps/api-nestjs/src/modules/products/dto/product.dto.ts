import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'ROTI-002' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  sku!: string;

  @ApiPropertyOptional({ example: '8999876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiProperty({ example: 'Croissant Butter' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 22000, description: 'Base price in smallest currency unit (BIGINT)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({ example: 11000, default: 0, description: 'Cost price (BIGINT)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPrice?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'ROTI-002-V2' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ example: '8999876543211' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional({ example: 'Croissant French Butter' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetPriceOverrideDto {
  @ApiPropertyOptional({ example: 20000, nullable: true, description: 'Price override in integer or null to clear' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceOverride!: number | null;
}

export class QueryProductDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by SKU, barcode, or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter stock & price override by store UUID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;
}
