import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RfqsModule } from './rfqs/rfqs.module';
import { BiddingModule } from './bidding/bidding.module';
import { AuctionsModule } from './auctions/auctions.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    RfqsModule,
    BiddingModule,
    AuctionsModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
