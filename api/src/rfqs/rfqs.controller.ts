import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { RfqsService } from './rfqs.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';

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

@Controller('rfqs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Post()
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  create(@Body() dto: CreateRfqDto, @Req() req: AuthenticatedRequest) {
    return this.rfqsService.create(dto, req.user.userId);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.rfqsService.findAll(req.user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rfqsService.findOne(id, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRfqDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rfqsService.update(id, dto, req.user);
  }

  @Post(':id/publish')
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  publish(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rfqsService.publish(id, req.user);
  }
}