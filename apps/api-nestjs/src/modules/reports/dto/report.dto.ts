import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ReportSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by store UUID (omit for consolidated multi-store KPI)' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
