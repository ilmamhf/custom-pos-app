import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentProviderType, PaymentMethod } from '@prisma/client';

export class PaymentProviderConfigDto {
  @ApiProperty({ example: 'https://api.midtrans.com' })
  @IsString()
  @IsNotEmpty()
  baseUrl!: string;

  @ApiProperty({ example: 'MIDTRANS-MERCHANT-ID' })
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @ApiProperty({ example: 'SB-Mid-server-XXXXXXXX', description: 'Server key for API authentication' })
  @IsString()
  @IsNotEmpty()
  serverKey!: string;

  @ApiPropertyOptional({ example: 'SB-Mid-client-XXXXXXXX', description: 'Client key for frontend' })
  @IsOptional()
  @IsString()
  clientKey?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether to use sandbox environment' })
  @IsOptional()
  isSandbox?: boolean;
}

export class CreatePaymentProviderDto {
  @ApiProperty({ example: 'Midtrans Production' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: PaymentProviderType, example: PaymentProviderType.MIDTRANS })
  @IsEnum(PaymentProviderType)
  type!: PaymentProviderType;

  @ApiProperty({ type: PaymentProviderConfigDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentProviderConfigDto)
  config!: PaymentProviderConfigDto;

  @ApiProperty({ enum: PaymentMethod, isArray: true, example: [PaymentMethod.QRIS, PaymentMethod.CARD], enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod, { each: true })
  supportedMethods!: PaymentMethod[];

  @ApiPropertyOptional({ example: false, description: 'Set as default provider for new stores' })
  @IsOptional()
  isDefault?: boolean;
}

export class UpdatePaymentProviderDto {
  @ApiPropertyOptional({ example: 'Midtrans Production' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ type: PaymentProviderConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentProviderConfigDto)
  config?: PaymentProviderConfigDto;

  @ApiPropertyOptional({ enum: PaymentMethod, isArray: true, example: [PaymentMethod.QRIS, PaymentMethod.CARD], enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod, { each: true })
  supportedMethods?: PaymentMethod[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isDefault?: boolean;
}

export class PaymentProviderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PaymentProviderType })
  type!: PaymentProviderType;

  @ApiProperty({ nullable: true })
  config!: PaymentProviderConfigDto | Record<string, any> | string | number | boolean | null | any[];

  @ApiProperty({ enum: PaymentMethod, isArray: true, enumName: 'PaymentMethod' })
  supportedMethods!: PaymentMethod[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}