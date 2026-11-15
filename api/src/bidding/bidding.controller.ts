import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { BiddingService } from './bidding.service';
import { CreateBidDto } from './dto/create-bid.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  Roles,
  UserRole,
} from '../auth/decorators/roles.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

@Controller('bidding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BiddingController {
  constructor(private readonly biddingService: BiddingService) {}

  @Post('auctions/:auctionId/bids')
  @Roles(UserRole.SUPPLIER)
  submitBid(
    @Param('auctionId') auctionId: string,
    @Body() dto: CreateBidDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.biddingService.submitBid(
      auctionId,
      req.user.userId,
      dto,
    );
  }
}