import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto, CloseShiftDto, QueryShiftDto } from './dto/shift.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreAccessGuard } from '../../common/guards/store-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Shifts')
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'List register shifts and cash variances' })
  async findAll(@Query() query: QueryShiftDto) {
    return this.shiftsService.findAll(query);
  }

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @UseGuards(StoreAccessGuard)
  @ApiOperation({ summary: 'Open a register drawer shift (Cashier+)' })
  async openShift(
    @CurrentUser() user: RequestUser,
    @Body() dto: OpenShiftDto,
  ) {
    return this.shiftsService.openShift(user.id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @ApiOperation({ summary: 'Close a register drawer shift and compute expected cash & variance' })
  async closeShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.shiftsService.closeShift(id, dto);
  }
}
