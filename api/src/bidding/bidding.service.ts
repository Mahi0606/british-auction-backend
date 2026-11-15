import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type RankedBid = {
  supplierId: string;
  totalAmount: number;
  createdAt: Date;
};

@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  private getRankings(
    bids: Array<{
      supplierId: string;
      totalAmount: { toNumber(): number };
      createdAt: Date;
    }>,
  ): Map<string, number> {
    const bestBySupplier = new Map<string, RankedBid>();

    for (const bid of bids) {
      const existing = bestBySupplier.get(bid.supplierId);
      const amount = bid.totalAmount.toNumber();

      if (!existing || amount < existing.totalAmount) {
        bestBySupplier.set(bid.supplierId, {
          supplierId: bid.supplierId,
          totalAmount: amount,
          createdAt: bid.createdAt,
        });
      }
    }

    const ranked = [...bestBySupplier.values()].sort(
      (a, b) =>
        a.totalAmount - b.totalAmount ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    return new Map(ranked.map((bid, index) => [bid.supplierId, index + 1]));
  }

  async submitBid(
    auctionId: string,
    supplierUserId: string,
    dto: CreateBidDto,
  ) {
    const freight = this.toCents(dto.freightCharges);
    const origin = this.toCents(dto.originCharges);
    const destination = this.toCents(dto.destinationCharges);
    const totalCents = freight + origin + destination;

    const totalAmount = (totalCents / 100).toFixed(2);
    const now = new Date();
    const validity = new Date(dto.validity);

    if (!Number.isFinite(validity.getTime()) || validity <= now) {
      throw new BadRequestException('Bid validity must be in the future');
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { userId: supplierUserId },
    });

    if (!supplier) {
      throw new ForbiddenException('Supplier profile not found');
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Serialize bid submissions for this auction.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "Auction"
          WHERE "id" = ${auctionId}
          FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new NotFoundException('Auction not found');
        }

        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: { rfq: true },
        });

        if (!auction) {
          throw new NotFoundException('Auction not found');
        }

        if (auction.rfq.status !== 'PUBLISHED') {
          throw new BadRequestException('RFQ is not published');
        }

        if (auction.status !== 'ACTIVE') {
          throw new BadRequestException('Auction is not active');
        }

        if (now >= auction.forcedCloseTime) {
          throw new BadRequestException('Auction has reached forced close');
        }

        if (now < auction.startTime || now >= auction.currentCloseTime) {
          throw new BadRequestException('Auction is not accepting bids');
        }

        const previousBids = await tx.bid.findMany({
          where: { auctionId },
          orderBy: [{ createdAt: 'asc' }],
        });

        const previousBest = previousBids
          .filter((bid) => bid.supplierId === supplier.id)
          .reduce<number | null>((best, bid) => {
            const amount = bid.totalAmount.toNumber();
            return best === null ? amount : Math.min(best, amount);
          }, null);

        if (previousBest !== null && Number(totalAmount) >= previousBest) {
          throw new BadRequestException(
            'Your new bid must be lower than your previous best bid',
          );
        }

        const oldRankings = this.getRankings(previousBids);

        const bid = await tx.bid.create({
          data: {
            auctionId,
            supplierId: supplier.id,
            freightCharges: freight / 100,
            originCharges: origin / 100,
            destinationCharges: destination / 100,
            totalAmount,
            transitTime: dto.transitTime,
            validity,
          },
        });

        const allBids = [...previousBids, bid];
        const newRankings = this.getRankings(allBids);

        const rankChanged = [
          ...new Set([...oldRankings.keys(), ...newRankings.keys()]),
        ].some((id) => oldRankings.get(id) !== newRankings.get(id));

        const oldL1 =
          [...oldRankings.entries()].find(([, rank]) => rank === 1)?.[0] ??
          null;

        const newL1 =
          [...newRankings.entries()].find(([, rank]) => rank === 1)?.[0] ??
          null;

        const l1Changed = oldL1 !== newL1;

        await tx.activityLog.create({
          data: {
            auctionId,
            actorUserId: supplierUserId,
            eventType: 'BID_SUBMITTED',
            description: `Supplier submitted a bid of ${totalAmount}`,
            metadata: {
              bidId: bid.id,
              supplierId: supplier.id,
              totalAmount,
            },
          },
        });

        if (rankChanged) {
          await tx.activityLog.create({
            data: {
              auctionId,
              actorUserId: supplierUserId,
              eventType: 'RANK_CHANGED',
              description: 'Supplier rankings changed',
              metadata: {
                oldRankings: Object.fromEntries(oldRankings),
                newRankings: Object.fromEntries(newRankings),
              },
            },
          });
        }

        if (l1Changed) {
          await tx.activityLog.create({
            data: {
              auctionId,
              actorUserId: supplierUserId,
              eventType: 'L1_CHANGED',
              description: 'Lowest bidder (L1) changed',
              metadata: { oldL1, newL1 },
            },
          });
        }

        const triggerStart = new Date(
          auction.currentCloseTime.getTime() -
            auction.triggerWindowMinutes * 60_000,
        );

        const insideTriggerWindow =
          now >= triggerStart && now < auction.currentCloseTime;

        const shouldExtend =
          insideTriggerWindow &&
          (auction.extensionTrigger === 'ANY_BID' ||
            (auction.extensionTrigger === 'ANY_RANK_CHANGE' && rankChanged) ||
            (auction.extensionTrigger === 'L1_CHANGE' && l1Changed));

        let updatedCloseTime = auction.currentCloseTime;

        if (shouldExtend) {
          const proposedClose = new Date(
            auction.currentCloseTime.getTime() +
              auction.extensionDurationMinutes * 60_000,
          );

          updatedCloseTime =
            proposedClose > auction.forcedCloseTime
              ? auction.forcedCloseTime
              : proposedClose;

          if (updatedCloseTime > auction.currentCloseTime) {
            await tx.auction.update({
              where: { id: auctionId },
              data: { currentCloseTime: updatedCloseTime },
            });

            await tx.activityLog.create({
              data: {
                auctionId,
                actorUserId: supplierUserId,
                eventType: 'AUCTION_EXTENDED',
                description: 'Auction closing time extended',
                metadata: {
                  previousCloseTime: auction.currentCloseTime.toISOString(),
                  newCloseTime: updatedCloseTime.toISOString(),
                  reason: auction.extensionTrigger,
                },
              },
            });
          }
        }

        const rankings = [...newRankings.entries()]
          .map(([supplierId, rank]) => ({
            supplierId,
            rank,
          }))
          .sort((a, b) => a.rank - b.rank);

        return {
          message: 'Bid submitted successfully',
          bid,
          rankings,
          currentCloseTime: updatedCloseTime,
        };
      },
      { timeout: 15000 },
    );

    this.realtime.emitAuctionUpdate(auctionId, 'bidSubmitted', {
      bid: result.bid,
    });

    this.realtime.emitAuctionUpdate(auctionId, 'rankingsUpdated', {
      rankings: result.rankings,
    });

    this.realtime.emitAuctionUpdate(auctionId, 'auctionTimeUpdated', {
      currentCloseTime: result.currentCloseTime,
    });

    return result;
  }
}
