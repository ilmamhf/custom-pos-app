import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Siti Kasir' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'siti@toko.id' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: '123456', description: '6-digit PIN for manager/owner overrides' })
  @IsOptional()
  @IsString()
  @Length(4, 8)
  pin?: string;

  @ApiProperty({ enum: Role, example: Role.CASHIER })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ type: [String], example: ['a0000000-0000-0000-0000-000000000001'] })
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds!: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Siti Rahma' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'siti.new@toko.id' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'newpassword123' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: '654321' })
  @IsOptional()
  @IsString()
  @Length(4, 8)
  pin?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds?: string[];
}
