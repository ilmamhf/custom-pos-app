import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { GenericPaymentProvider } from './providers/generic-payment.provider';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, GenericPaymentProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}