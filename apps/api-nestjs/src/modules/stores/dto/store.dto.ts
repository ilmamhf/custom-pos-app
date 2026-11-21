import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'Cabang Bekasi Timur' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Jl. Ahmad Yani No. 12, Bekasi' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 1100, description: 'Tax rate in basis points (1100 = 11%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  taxRateBps?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateStoreDto {
  @ApiProperty({ example: 'Cabang Bandung' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'BDG' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  code!: string;

  @ApiPropertyOptional({ example: 'Jl. Riau No. 1, Bandung' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 1100, default: 1100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  taxRateBps?: number;
}
