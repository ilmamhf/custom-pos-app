import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import {
  LoginResponseDto,
  RefreshResponseDto,
  VerifyPinResponseDto,
  CurrentSessionResponseDto,
} from './dto/auth-response.dto';
import { comparePassword, comparePin } from '../../common/utils/hash.util';
import { JwtPayload } from './strategies/jwt.strategy';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveAccessSecret,
  resolveRefreshSecret,
} from '../../common/config/security.config';

interface StoreSummary {
  id: string;
  name: string;
  code: string;
  taxRateBps: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: {
        userStores: {
          include: {
            store: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await comparePassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const stores = await this.resolveAccessibleStores(user);

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      ver: user.tokenVersion,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      stores,
    };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<RefreshResponseDto> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: resolveRefreshSecret(this.configService),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (payload.ver !== undefined && payload.ver !== user.tokenVersion) {
        throw new UnauthorizedException('Session has been revoked');
      }

      return this.generateTokens({
        sub: user.id,
        email: user.email,
        role: user.role,
        ver: user.tokenVersion,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async me(user: RequestUser): Promise<CurrentSessionResponseDto> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { userStores: { include: { store: true } } },
    });

    if (!record || !record.isActive) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    const stores = await this.resolveAccessibleStores(record);

    return {
      user: {
        id: record.id,
        name: record.name,
        role: record.role,
        email: record.email,
      },
      stores,
    };
  }

  async logout(userId: string): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  async verifyPin(dto: VerifyPinDto): Promise<VerifyPinResponseDto> {
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
    });
    if (!store) {
      throw new NotFoundException(`Store with ID ${dto.storeId} not found`);
    }

    const candidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.MANAGER, Role.OWNER] },
        OR: [
          { role: Role.OWNER },
          { userStores: { some: { storeId: dto.storeId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        pinHash: true,
        role: true,
      },
    });

    for (const candidate of candidates) {
      if (candidate.pinHash) {
        const matches = await comparePin(dto.pin, candidate.pinHash);
        if (matches) {
          const offlineGrant = await this.issueOfflineGrant(
            candidate.id,
            dto.storeId,
            'refund',
          );
          return {
            authorized: true,
            managerId: candidate.id,
            managerName: candidate.name,
            offlineGrant,
          };
        }
      }
    }

    throw new UnauthorizedException('Invalid manager PIN for this store');
  }

  /**
   * Verifies a short-lived offline authorization grant produced by
   * `verify-pin`. The grant is bound to a manager, a store, and an action.
   */
  async verifyOfflineGrant(
    token: string,
    expected: { storeId: string; action: 'refund' },
  ): Promise<{ managerId: string }> {
    let payload: {
      sub?: string;
      storeId?: string;
      action?: string;
      typ?: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: resolveAccessSecret(this.configService),
      });
    } catch {
      throw new ForbiddenException('Offline authorization grant is invalid or expired');
    }

    if (
      payload.typ !== 'offline-grant' ||
      payload.action !== expected.action ||
      payload.storeId !== expected.storeId ||
      !payload.sub
    ) {
      throw new ForbiddenException('Offline authorization grant does not match this operation');
    }

    return { managerId: payload.sub };
  }

  private async resolveAccessibleStores(user: {
    role: Role;
    userStores: Array<{ store: StoreSummary }>;
  }): Promise<StoreSummary[]> {
    if (user.role === Role.OWNER) {
      return this.prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, taxRateBps: true },
      });
    }

    return user.userStores.map((us) => ({
      id: us.store.id,
      name: us.store.name,
      code: us.store.code,
      taxRateBps: us.store.taxRateBps,
    }));
  }

  private async issueOfflineGrant(
    managerId: string,
    storeId: string,
    action: 'refund',
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: managerId,
        storeId,
        action,
        typ: 'offline-grant',
      },
      {
        secret: resolveAccessSecret(this.configService),
        expiresIn: (this.configService.get<string>('OFFLINE_GRANT_TTL') ||
          '12h') as any,
      },
    );
  }

  private async generateTokens(
    payload: JwtPayload,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret = resolveAccessSecret(this.configService);
    const refreshSecret = resolveRefreshSecret(this.configService);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ||
          '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
          '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
