import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import {
  LoginResponseDto,
  RefreshResponseDto,
  VerifyPinResponseDto,
  CurrentSessionResponseDto,
} from './dto/auth-response.dto';
import { AuthSecuritySnapshotDto } from './dto/security-telemetry.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AuthTelemetryService } from './security/auth-telemetry.service';
import { buildAuthAttemptKey } from './security/auth-attempt.util';
import { getClientIp } from '../../common/utils/client-ip.util';
import {
  LOGIN_THROTTLE,
  PIN_THROTTLE,
  REFRESH_THROTTLE,
} from '../../common/throttler/throttler.config';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly telemetry: AuthTelemetryService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({
    summary: 'Authenticate user and return JWT tokens with accessible stores',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({
    status: 429,
    description: 'Too many failed attempts or requests',
  })
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResponseDto> {
    const ip = getClientIp(request);
    const attemptKey = buildAuthAttemptKey('login', ip, dto.email);
    this.telemetry.assertNotLocked(attemptKey);

    try {
      const result = await this.authService.login(dto);
      this.telemetry.registerSuccess(attemptKey);
      return result;
    } catch (error) {
      // Only credential rejections count toward brute-force lockouts; a
      // transient database failure must not lock the cashier out.
      if (error instanceof UnauthorizedException) {
        this.telemetry.registerFailure(attemptKey, {
          endpoint: 'login',
          ip,
          identifier: dto.email,
        });
      }
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(REFRESH_THROTTLE)
  @ApiOperation({
    summary: 'Refresh expired access token with valid refresh token',
  })
  @ApiResponse({ status: 200, type: RefreshResponseDto })
  @ApiResponse({ status: 429, description: 'Too many refresh attempts' })
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Return the current session user and accessible stores',
  })
  @ApiResponse({ status: 200, type: CurrentSessionResponseDto })
  async me(@CurrentUser() user: RequestUser): Promise<CurrentSessionResponseDto> {
    return this.authService.me(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke all access and refresh tokens for the current user',
  })
  async logout(@CurrentUser() user: RequestUser): Promise<{ ok: true }> {
    return this.authService.logout(user.id);
  }

  @Post('verify-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle(PIN_THROTTLE)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Validate Manager or Owner PIN for void/refund overrides',
  })
  @ApiResponse({ status: 200, type: VerifyPinResponseDto })
  @ApiResponse({
    status: 429,
    description: 'Too many failed PIN attempts or requests',
  })
  async verifyPin(
    @Body() dto: VerifyPinDto,
    @Req() request: Request,
  ): Promise<VerifyPinResponseDto> {
    const ip = getClientIp(request);
    const attemptKey = buildAuthAttemptKey('verify-pin', ip, dto.storeId);
    this.telemetry.assertNotLocked(attemptKey);

    try {
      const result = await this.authService.verifyPin(dto);
      this.telemetry.registerSuccess(attemptKey);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.telemetry.registerFailure(attemptKey, {
          endpoint: 'verify-pin',
          ip,
          identifier: dto.storeId,
        });
      }
      throw error;
    }
  }

  @Get('security/telemetry')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Brute-force / lockout telemetry snapshot (Owner only, process-local)',
  })
  @ApiResponse({ status: 200, type: AuthSecuritySnapshotDto })
  async securityTelemetry(): Promise<AuthSecuritySnapshotDto> {
    return this.telemetry.snapshot();
  }
}
