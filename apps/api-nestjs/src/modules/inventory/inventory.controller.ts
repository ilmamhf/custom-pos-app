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
import { InventoryService } from './inventory.service';
import {
  AdjustInventoryDto,
  TransferInventoryDto,
  QueryInventoryDto,
  QueryLedgerDto,
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreAccessGuard } from '../../common/guards/store-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { StoreId } from '../../common/decorators/store-id.decorator';
import { Role } from '@prisma/client';

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get store inventory levels with filters for low/negative stock' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryInventoryDto,
  ) {
    return this.inventoryService.findAll(query, user);
  }

  @Post('adjust')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.OWNER, Role.MANAGER)
  @UseGuards(StoreAccessGuard)
  @ApiOperation({ summary: 'Adjust stock levels for restocks or shrinkage/damage' })
  async adjust(
    @CurrentUser() user: RequestUser,
    @StoreId(true) canonicalStoreId: string,
    @Body() dto: AdjustInventoryDto,
  ) {
    return this.inventoryService.adjust(user.id, dto, canonicalStoreId);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.OWNER, Role.MANAGER)
  @UseGuards(StoreAccessGuard)
  @ApiOperation({ summary: 'Atomically transfer stock between two stores' })
  async transfer(
    @CurrentUser() user: RequestUser,
    @Body() dto: TransferInventoryDto,
  ) {
    return this.inventoryService.transfer(user.id, dto);
  }

  @Get('ledger')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get paginated stock ledger audit trail' })
  async getLedger(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryLedgerDto,
  ) {
    return this.inventoryService.getLedger(query, user);
  }
}
