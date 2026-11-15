import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/auction',
})
@Injectable()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;

      if (!token || typeof token !== 'string') {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Socket.IO automatically removes disconnected clients from rooms.
  }

  @SubscribeMessage('joinAuction')
  async joinAuction(
    @MessageBody() data: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;

    if (!user || !data?.auctionId) {
      return { success: false, message: 'Unauthorized' };
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: data.auctionId },
      include: { rfq: true },
    });

    if (!auction) {
      return { success: false, message: 'Auction not found' };
    }

    const authorized =
      user.role === 'ADMIN' ||
      (user.role === 'BUYER' &&
        auction.rfq.buyerId === user.userId) ||
      (user.role === 'SUPPLIER' &&
        auction.rfq.status === 'PUBLISHED');

    if (!authorized) {
      return { success: false, message: 'Access denied' };
    }

    const room = `auction:${data.auctionId}`;
    await client.join(room);

    return {
      success: true,
      message: 'Joined auction room',
      auctionId: data.auctionId,
    };
  }

  emitAuctionUpdate(auctionId: string, event: string, payload: unknown) {
    this.server
      ?.to(`auction:${auctionId}`)
      .emit(event, payload);
  }
}