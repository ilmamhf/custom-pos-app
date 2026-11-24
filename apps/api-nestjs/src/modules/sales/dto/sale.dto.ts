import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RefundItemDto {
  @ApiProperty({ example: 'e0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  saleItemId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  refundQty!: number;
}

export class ProcessRefundDto {
  @ApiProperty({ example: '123456', description: 'Manager or Owner 6-digit PIN' })
  @IsString()
  @IsNotEmpty()
  managerPin!: string;

  @ApiPropertyOptional({ example: 'Wrong item ordered' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Idempotency key so a retried refund is applied only once',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ type: [RefundItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A refund must include at least one item' })
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  items!: RefundItemDto[];
}

export class QuerySaleDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by store UUID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ enum: SaleStatus })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ example: '2026-11-21T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-21T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
