import { Module } from '@nestjs/common';

import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [AuctionsController],
  providers: [AuctionsService],
})
export class AuctionsModule {}