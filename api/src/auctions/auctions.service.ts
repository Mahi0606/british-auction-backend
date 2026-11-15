import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findAll(user: { userId: string; role: string }) {
    const where =
      user.role === 'ADMIN'
        ? {}
        : user.role === 'BUYER'
          ? { rfq: { buyerId: user.userId } }
          : { rfq: { status: 'PUBLISHED' as const } };

    return this.prisma.auction.findMany({
      where,
      include: {
        rfq: {
          select: {
            id: true,
            referenceId: true,
            name: true,
            pickupLocation: true,
            deliveryLocation: true,
            serviceDate: true,
            status: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async findOne(auctionId: string, user: { userId: string; role: string }) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        rfq: true,
        bids: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (user.role === 'SUPPLIER' && auction.rfq.status !== 'PUBLISHED') {
      throw new NotFoundException('Auction not found');
    }

    if (user.role === 'BUYER' && auction.rfq.buyerId !== user.userId) {
      throw new NotFoundException('Auction not found');
    }

    // Keep only each supplier's lowest bid for ranking.
    const bestBids = new Map<string, (typeof auction.bids)[number]>();

    for (const bid of auction.bids) {
      const existing = bestBids.get(bid.supplierId);

      if (
        !existing ||
        bid.totalAmount.toNumber() < existing.totalAmount.toNumber()
      ) {
        bestBids.set(bid.supplierId, bid);
      }
    }

    const rankings = [...bestBids.values()]
      .sort(
        (a, b) =>
          a.totalAmount.toNumber() - b.totalAmount.toNumber() ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((bid, index) => ({
        rank: index + 1,
        supplierId: bid.supplierId,
        companyName: bid.supplier.companyName,
        totalAmount: bid.totalAmount.toString(),
        freightCharges: bid.freightCharges.toString(),
        originCharges: bid.originCharges.toString(),
        destinationCharges: bid.destinationCharges.toString(),
        transitTime: bid.transitTime,
        validity: bid.validity,
        submittedAt: bid.createdAt,
      }));

    return {
      auction: {
        id: auction.id,
        status: auction.status,
        startTime: auction.startTime,
        originalCloseTime: auction.originalCloseTime,
        currentCloseTime: auction.currentCloseTime,
        forcedCloseTime: auction.forcedCloseTime,
        triggerWindowMinutes: auction.triggerWindowMinutes,
        extensionDurationMinutes: auction.extensionDurationMinutes,
        extensionTrigger: auction.extensionTrigger,
      },
      rfq: auction.rfq,
      rankings,
      activityLogs: auction.activityLogs,
    };
  }

  // Automatically close expired auctions every 10 seconds.
  @Cron(CronExpression.EVERY_10_SECONDS)
  async closeExpiredAuctions() {
    const now = new Date();

    const expiredAuctions = await this.prisma.auction.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { currentCloseTime: { lte: now } },
          { forcedCloseTime: { lte: now } },
        ],
      },
      select: { id: true },
    });

    for (const item of expiredAuctions) {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Auction"
        WHERE "id" = ${item.id}
        FOR UPDATE
      `;

        if (locked.length === 0) return null;

        const auction = await tx.auction.findUnique({
          where: { id: item.id },
        });

        if (!auction || auction.status !== 'ACTIVE') return null;

        const closureTime = new Date();

        const forceClosed = closureTime >= auction.forcedCloseTime;

        if (!forceClosed && closureTime < auction.currentCloseTime) {
          return null;
        }

        const status = forceClosed ? 'FORCE_CLOSED' : 'CLOSED';

        await tx.auction.update({
          where: { id: item.id },
          data: { status },
        });

        await tx.activityLog.create({
          data: {
            auctionId: item.id,
            eventType: forceClosed ? 'FORCE_CLOSED' : 'AUCTION_CLOSED',
            description: forceClosed
              ? 'Auction reached its maximum forced close time'
              : 'Auction reached its closing time',
          },
        });

        return { auctionId: item.id, status };
      });

      // Emit only after successful transaction commit.
      if (result) {
        this.realtime.emitAuctionUpdate(result.auctionId, 'auctionClosed', {
          status: result.status,
        });
      }
    }
  }
}
