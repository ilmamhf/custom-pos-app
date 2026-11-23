import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user and return JWT tokens with accessible stores' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh expired access token with valid refresh token' })
  @ApiResponse({ status: 200, type: RefreshResponseDto })
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the current session user and accessible stores' })
  @ApiResponse({ status: 200, type: CurrentSessionResponseDto })
  async me(@CurrentUser() user: RequestUser): Promise<CurrentSessionResponseDto> {
    return this.authService.me(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all access and refresh tokens for the current user' })
  async logout(@CurrentUser() user: RequestUser): Promise<{ ok: true }> {
    return this.authService.logout(user.id);
  }

  @Post('verify-pin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate Manager or Owner PIN for void/refund overrides' })
  @ApiResponse({ status: 200, type: VerifyPinResponseDto })
  async verifyPin(@Body() dto: VerifyPinDto): Promise<VerifyPinResponseDto> {
    return this.authService.verifyPin(dto);
  }
}
