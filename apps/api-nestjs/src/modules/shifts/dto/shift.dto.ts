import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class OpenShiftDto {
  @ApiProperty({ example: 'd0000000-0000-0000-0000-000000000001', description: 'Client-generated UUID v4' })
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty({ example: 500000, description: 'Starting cash drawer in integer' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingCash!: number;
}

export class CloseShiftDto {
  @ApiProperty({ example: 1250000, description: 'Actual cash counted by cashier at end of shift' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualCash!: number;
}

export class QueryShiftDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by store UUID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;
}
