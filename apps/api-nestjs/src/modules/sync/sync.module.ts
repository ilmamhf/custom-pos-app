import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [AuthModule, SalesModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
