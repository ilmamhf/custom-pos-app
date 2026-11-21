import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { LoginResponseDto, RefreshResponseDto, VerifyPinResponseDto } from './dto/auth-response.dto';
import { comparePassword, comparePin } from '../../common/utils/hash.util';
import { JwtPayload } from './strategies/jwt.strategy';

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

    // Determine stores accessible by user
    let stores = user.userStores.map((us) => ({
      id: us.store.id,
      name: us.store.name,
      code: us.store.code,
      taxRateBps: us.store.taxRateBps,
    }));

    // If OWNER, ensure all active stores are included
    if (user.role === Role.OWNER) {
      const allStores = await this.prisma.store.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          taxRateBps: true,
        },
      });
      stores = allStores;
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
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
      const refreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') || 'pos-refresh-secret-key-67890';
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: refreshSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const tokens = await this.generateTokens({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async verifyPin(dto: VerifyPinDto): Promise<VerifyPinResponseDto> {
    // Check if store exists
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
    });
    if (!store) {
      throw new NotFoundException(`Store with ID ${dto.storeId} not found`);
    }

    // Find managers assigned to this store or any active owner
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
          return {
            authorized: true,
            managerId: candidate.id,
            managerName: candidate.name,
          };
        }
      }
    }

    throw new UnauthorizedException('Invalid manager PIN for this store');
  }

  private async generateTokens(payload: JwtPayload): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') || 'pos-access-secret-key-12345';
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') || 'pos-refresh-secret-key-67890';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
