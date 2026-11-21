import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class VerifyPinDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID('4', { message: 'storeId must be a valid UUID' })
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  pin!: string;
}
