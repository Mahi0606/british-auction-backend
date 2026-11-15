import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';

@Injectable()
export class RfqsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRfqDto, buyerId: string) {
    const start = new Date(dto.startTime);
    const close = new Date(dto.originalCloseTime);
    const forcedClose = new Date(dto.forcedCloseTime);

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(close.getTime()) ||
      !Number.isFinite(forcedClose.getTime()) ||
      start >= close ||
      close >= forcedClose
    ) {
      throw new BadRequestException(
        'Auction times must satisfy start time < bid close time < forced close time',
      );
    }

    if (new Date(dto.serviceDate).getTime() < 0) {
      throw new BadRequestException('Invalid service date');
    }

    return this.prisma.$transaction(async (tx) => {
      const rfq = await tx.rFQ.create({
        data: {
          referenceId: `RFQ-${randomUUID().slice(0, 8).toUpperCase()}`,
          name: dto.name,
          description: dto.description,
          buyerId,
          pickupLocation: dto.pickupLocation,
          deliveryLocation: dto.deliveryLocation,
          serviceDate: new Date(dto.serviceDate),
          status: 'DRAFT',
        },
      });

      const auction = await tx.auction.create({
        data: {
          rfqId: rfq.id,
          startTime: start,
          originalCloseTime: close,
          currentCloseTime: close,
          forcedCloseTime: forcedClose,
          triggerWindowMinutes: dto.triggerWindowMinutes,
          extensionDurationMinutes: dto.extensionDurationMinutes,
          extensionTrigger: dto.extensionTrigger,
          status: 'ACTIVE',
        },
      });

      return { ...rfq, auction };
    });
  }

  async findAll(user: { userId: string; role: string }) {
    const where =
      user.role === 'ADMIN'
        ? {}
        : user.role === 'BUYER'
          ? { buyerId: user.userId }
          : { status: 'PUBLISHED' as const };

    return this.prisma.rFQ.findMany({
      where,
      include: {
        auction: true,
        buyer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: { userId: string; role: string }) {
    const rfq = await this.prisma.rFQ.findUnique({
      where: { id },
      include: {
        auction: true,
        buyer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (
      rfq.status !== 'PUBLISHED' &&
      user.role !== 'ADMIN' &&
      rfq.buyerId !== user.userId
    ) {
      throw new NotFoundException('RFQ not found');
    }

    return rfq;
  }

  async update(
    id: string,
    dto: UpdateRfqDto,
    user: { userId: string; role: string },
  ) {
    const rfq = await this.prisma.rFQ.findUnique({
      where: { id },
      include: { auction: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.buyerId !== user.userId && user.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot update this RFQ');
    }

    if (rfq.status !== 'DRAFT') {
      throw new BadRequestException('Only draft RFQs can be updated');
    }

    if (!rfq.auction) {
      throw new BadRequestException('Auction configuration not found');
    }

    const start = dto.startTime
      ? new Date(dto.startTime)
      : rfq.auction.startTime;

    const close = dto.originalCloseTime
      ? new Date(dto.originalCloseTime)
      : rfq.auction.originalCloseTime;

    const forcedClose = dto.forcedCloseTime
      ? new Date(dto.forcedCloseTime)
      : rfq.auction.forcedCloseTime;

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(close.getTime()) ||
      !Number.isFinite(forcedClose.getTime()) ||
      start >= close ||
      close >= forcedClose
    ) {
      throw new BadRequestException('Invalid auction time sequence');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedRfq = await tx.rFQ.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.pickupLocation !== undefined && {
            pickupLocation: dto.pickupLocation,
          }),
          ...(dto.deliveryLocation !== undefined && {
            deliveryLocation: dto.deliveryLocation,
          }),
          ...(dto.serviceDate !== undefined && {
            serviceDate: new Date(dto.serviceDate),
          }),
        },
      });

      const updatedAuction = await tx.auction.update({
        where: { rfqId: id },
        data: {
          startTime: start,
          originalCloseTime: close,
          currentCloseTime: close,
          forcedCloseTime: forcedClose,
          ...(dto.triggerWindowMinutes !== undefined && {
            triggerWindowMinutes: dto.triggerWindowMinutes,
          }),
          ...(dto.extensionDurationMinutes !== undefined && {
            extensionDurationMinutes: dto.extensionDurationMinutes,
          }),
          ...(dto.extensionTrigger !== undefined && {
            extensionTrigger: dto.extensionTrigger,
          }),
        },
      });

      return { ...updatedRfq, auction: updatedAuction };
    });
  }

  async publish(id: string, user: { userId: string; role: string }) {
    const rfq = await this.prisma.rFQ.findUnique({
      where: { id },
      include: { auction: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.buyerId !== user.userId && user.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot publish this RFQ');
    }

    if (rfq.status !== 'DRAFT') {
      throw new BadRequestException('Only draft RFQs can be published');
    }

    if (!rfq.auction || rfq.auction.startTime <= new Date()) {
      throw new BadRequestException(
        'Auction must have a valid future start time',
      );
    }

    return this.prisma.rFQ.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      include: { auction: true },
    });
  }
}
