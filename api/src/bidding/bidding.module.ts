import { Module } from '@nestjs/common';

import { BiddingController } from './bidding.controller';
import { BiddingService } from './bidding.service';
import { AuthModule } from '../auth/auth.module';
import {RealtimeModule} from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [BiddingController],
  providers: [BiddingService],
})
export class BiddingModule {}