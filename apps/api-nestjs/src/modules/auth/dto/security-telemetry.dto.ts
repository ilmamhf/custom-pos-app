import { ApiProperty } from '@nestjs/swagger';

export class AuthSecurityEntryDto {
  @ApiProperty({
    example: 'k***@toko.id',
    description: 'Masked account identifier',
  })
  identifier!: string;

  @ApiProperty({ example: 'login' })
  endpoint!: string;

  @ApiProperty({ example: '203.0.113.10' })
  ip!: string;

  @ApiProperty({ example: 5 })
  failures!: number;

  @ApiProperty({ example: '2026-11-24T08:00:00.000Z' })
  firstFailureAt!: string;

  @ApiProperty({ example: '2026-11-24T08:02:11.000Z' })
  lastFailureAt!: string;

  @ApiProperty({ example: '2026-11-24T08:17:11.000Z', nullable: true })
  lockedUntil!: string | null;
}

export class AuthSecuritySnapshotDto {
  @ApiProperty({ example: '2026-11-24T08:05:00.000Z' })
  generatedAt!: string;

  @ApiProperty({ example: 1 })
  activeLockouts!: number;

  @ApiProperty({ example: 3 })
  trackedIdentifiers!: number;

  @ApiProperty({
    example: { failures: 12, lockouts: 2, blockedRequests: 7 },
    description: 'Monotonic counters since process start',
  })
  counters!: {
    failures: number;
    lockouts: number;
    blockedRequests: number;
  };

  @ApiProperty({ type: [AuthSecurityEntryDto] })
  entries!: AuthSecurityEntryDto[];
}
