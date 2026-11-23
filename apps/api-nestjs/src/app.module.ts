import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { SalesModule } from './modules/sales/sales.module';
import { SyncModule } from './modules/sync/sync.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    StoresModule,
    UsersModule,
    ProductsModule,
    InventoryModule,
    ShiftsModule,
    SalesModule,
    SyncModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
