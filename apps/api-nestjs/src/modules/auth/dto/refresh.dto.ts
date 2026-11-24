import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  /**
   * Native clients (Flutter POS) send the token from secure storage. Browser
   * clients omit it and rely on the HttpOnly cookie plus the X-CSRF-Token
   * header.
   */
  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
