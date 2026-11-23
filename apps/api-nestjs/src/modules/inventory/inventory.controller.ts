import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { NegativeStockPolicyService } from './negative-stock-policy.service';
import {
  AdjustInventoryDto,
  TransferInventoryDto,
  QueryInventoryDto,
  QueryLedgerDto,
  CreateNegativeStockPolicyDto,
  UpdateNegativeStockPolicyDto,
  NegativeStockPolicyResponseDto,
  NegativeStockEventResponseDto,
  ResolveNegativeStockEventDto,
  QueryNegativeStockEventsDto,
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
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly negativeStockPolicyService: NegativeStockPolicyService,
  ) {}

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

  // ========== Negative Stock Policy Endpoints ==========

  @Post('negative-stock-policy')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Create a negative stock policy (global or per-store)' })
  @ApiBearerAuth()
  async createPolicy(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateNegativeStockPolicyDto,
  ): Promise<NegativeStockPolicyResponseDto> {
    return this.negativeStockPolicyService.createPolicy(dto, user);
  }

  @Get('negative-stock-policy')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'List all negative stock policies' })
  @ApiBearerAuth()
  async getPolicies(): Promise<NegativeStockPolicyResponseDto[]> {
    return this.negativeStockPolicyService.getAllPolicies();
  }

  @Get('negative-stock-policy/:storeId')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get negative stock policy for a store (or global default)' })
  @ApiParam({ name: 'storeId', required: false, description: 'Store UUID (omit for global default)' })
  @ApiBearerAuth()
  async getPolicy(
    @Param('storeId') storeId?: string,
  ): Promise<NegativeStockPolicyResponseDto | null> {
    const policy = await this.negativeStockPolicyService.getPolicy(storeId);
    if (!policy && !storeId) {
      // Return default if no global policy exists
      return this.negativeStockPolicyService.getOrCreateDefaultPolicy();
    }
    return policy;
  }

  @Put('negative-stock-policy')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Update negative stock policy (global or per-store)' })
  @ApiBearerAuth()
  async updatePolicy(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNegativeStockPolicyDto,
    @Query('storeId') storeId?: string,
  ): Promise<NegativeStockPolicyResponseDto> {
    return this.negativeStockPolicyService.updatePolicy(storeId ?? null, dto, user);
  }

  @Put('negative-stock-policy/:storeId')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Update store-specific negative stock policy (legacy)' })
  @ApiBearerAuth()
  async updatePolicyLegacy(
    @CurrentUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateNegativeStockPolicyDto,
  ): Promise<NegativeStockPolicyResponseDto> {
    return this.negativeStockPolicyService.updatePolicy(storeId, dto, user);
  }

  @Delete('negative-stock-policy/:storeId')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete store-specific negative stock policy' })
  @ApiParam({ name: 'storeId', description: 'Store UUID' })
  @ApiBearerAuth()
  async deletePolicy(
    @Param('storeId') storeId: string,
  ): Promise<void> {
    await this.negativeStockPolicyService.deletePolicy(storeId);
  }

  // ========== Negative Stock Event Endpoints ==========

  @Get('negative-stock-events')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get paginated negative stock events with filters' })
  @ApiBearerAuth()
  async getEvents(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryNegativeStockEventsDto,
  ) {
    return this.negativeStockPolicyService.getEvents(query, user);
  }

  @Get('negative-stock-events/stats')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get negative stock event statistics' })
  @ApiBearerAuth()
  async getEventStats(
    @CurrentUser() user: RequestUser,
    @Query('storeId') storeId?: string,
  ) {
    const scope = user ? { storeId } : undefined;
    return this.negativeStockPolicyService.getEventStats(storeId);
  }

  @Get('negative-stock-events/unresolved')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get all unresolved negative stock events' })
  @ApiBearerAuth()
  async getUnresolvedEvents(
    @CurrentUser() user: RequestUser,
    @Query('storeId') storeId?: string,
  ) {
    return this.negativeStockPolicyService.getUnresolvedEvents(storeId);
  }

  @Get('negative-stock-events/:eventId')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get negative stock event by ID' })
  @ApiParam({ name: 'eventId', type: 'string', format: 'uuid' })
  @ApiBearerAuth()
  async getEventById(@Param('eventId') eventId: string): Promise<NegativeStockEventResponseDto | null> {
    return this.negativeStockPolicyService.getEventById(eventId);
  }

  @Put('negative-stock-events/:eventId/resolve')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Resolve a negative stock event' })
  @ApiParam({ name: 'eventId', type: 'string', format: 'uuid' })
  @ApiBearerAuth()
  async resolveEvent(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Body() dto: ResolveNegativeStockEventDto,
  ): Promise<NegativeStockEventResponseDto> {
    return this.negativeStockPolicyService.resolveEvent(eventId, dto, user);
  }
}
