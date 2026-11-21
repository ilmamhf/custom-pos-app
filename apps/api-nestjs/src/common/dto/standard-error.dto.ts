import { ApiProperty } from '@nestjs/swagger';

export class StandardErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'BAD_REQUEST' })
  error!: string;

  @ApiProperty({ example: 'Human-readable error description' })
  message!: string | string[];

  @ApiProperty({ example: '2026-11-21T14:24:00.000Z' })
  timestamp!: string;
}
