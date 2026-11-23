import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { SyncPushDto, SyncPullQueryDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreAccessGuard } from '../../common/guards/store-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { StoreId } from '../../common/decorators/store-id.decorator';
import { Role } from '@prisma/client';

@ApiTags('Sync')
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('pull')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @UseGuards(StoreAccessGuard)
  @ApiOperation({ summary: 'Pull delta catalog & stock updates for Flutter POS SQLite cache' })
  async pull(@Query() query: SyncPullQueryDto) {
    return this.syncService.pull(query);
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @UseGuards(StoreAccessGuard)
  @ApiOperation({ summary: 'Idempotent batch upload of offline shifts, sales, and refunds' })
  async push(
    @CurrentUser() user: RequestUser,
    @StoreId(true) canonicalStoreId: string,
    @Body() dto: SyncPushDto,
  ) {
    return this.syncService.push(user.id, dto, canonicalStoreId);
  }
}
