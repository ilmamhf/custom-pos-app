import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { ProductsService } from '../products/products.service';
import { SetPriceOverrideDto } from '../products/dto/product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreAccessGuard } from '../../common/guards/store-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Stores')
@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @ApiOperation({ summary: 'List all stores' })
  async findAll() {
    return this.storesService.findAll();
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get store details by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.findOne(id);
  }

  @Post()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Create a new store (Owner only)' })
  async create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Update store settings (Owner only)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(id, dto);
  }

  @Put(':storeId/products/:productId/price')
  @Roles(Role.OWNER, Role.MANAGER)
  @UseGuards(StoreAccessGuard)
  @ApiOperation({ summary: 'Set or remove per-store price override (Manager+ with store access)' })
  async setPriceOverride(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetPriceOverrideDto,
  ) {
    return this.productsService.setPriceOverride(storeId, productId, dto);
  }
}
