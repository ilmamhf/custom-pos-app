import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
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
import { PaymentsModule } from './modules/payments/payments.module';
import { HealthController } from './health.controller';
import { buildThrottlerOptions } from './common/throttler/throttler.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => buildThrottlerOptions(),
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
    PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Required for the HttpOnly refresh cookie / CSRF double-submit flow.
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
