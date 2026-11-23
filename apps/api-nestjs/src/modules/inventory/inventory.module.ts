import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { NegativeStockPolicyService } from './negative-stock-policy.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, NegativeStockPolicyService],
  exports: [InventoryService, NegativeStockPolicyService],
})
export class InventoryModule {}
