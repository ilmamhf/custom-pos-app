import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/decorators/current-user.decorator';
import { resolveAccessSecret } from '../../../common/config/security.config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  ver?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveAccessSecret(configService),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userStores: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    if (payload.ver !== undefined && payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      assignedStoreIds: user.userStores.map((us: { storeId: string }) => us.storeId),
    };
  }
}
