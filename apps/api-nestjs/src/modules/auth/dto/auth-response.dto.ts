import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 'b0000000-0000-0000-0000-000000000003' })
  id!: string;

  @ApiProperty({ example: 'Budi Kasir' })
  name!: string;

  @ApiProperty({ example: 'CASHIER' })
  role!: string;
}

export class AuthStoreDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  id!: string;

  @ApiProperty({ example: 'Cabang Bekasi' })
  name!: string;

  @ApiProperty({ example: 'BKS' })
  code!: string;

  @ApiProperty({ example: 1100 })
  taxRateBps!: number;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  refreshToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: [AuthStoreDto] })
  stores!: AuthStoreDto[];
}

export class RefreshResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  refreshToken!: string;
}

export class VerifyPinResponseDto {
  @ApiProperty({ example: true })
  authorized!: boolean;

  @ApiProperty({ example: 'b0000000-0000-0000-0000-000000000002' })
  managerId!: string;

  @ApiProperty({ example: 'Sari Manager' })
  managerName!: string;

  @ApiProperty({
    required: false,
    description:
      'Short-lived signed grant (store/user/action/expiry bound) for offline refunds',
  })
  offlineGrant?: string;
}

export class CurrentUserDto {
  @ApiProperty({ example: 'b0000000-0000-0000-0000-000000000002' })
  id!: string;

  @ApiProperty({ example: 'Sari Manager' })
  name!: string;

  @ApiProperty({ example: 'MANAGER' })
  role!: string;

  @ApiProperty({ example: 'manager.bks@toko.id' })
  email!: string;
}

export class CurrentSessionResponseDto {
  @ApiProperty({ type: CurrentUserDto })
  user!: CurrentUserDto;

  @ApiProperty({ type: [AuthStoreDto] })
  stores!: AuthStoreDto[];
}
