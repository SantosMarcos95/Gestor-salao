import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { catalogQuery } from '../catalog/validation';
import { catalogAudit, activeFilter } from '../catalog/shared';
import { blockInput, localInstant, revision, servicesInput, workInput } from './validation';

import { occupying, withinWork } from '../appointments/rules';

const availabilityPermission = 'agenda.gerenciar_disponibilidade';
@Controller('availability')
@UseGuards(SessionGuard)
export class AvailabilityController {
  constructor(private db: Database) {}
  @Get('professionals')
  async professionals(@Query() query: unknown, @Req() req: AuthRequest) {
    if (
      ![availabilityPermission, 'profissionais.gerenciar'].some((p) =>
        req.identity.permissions.includes(p),
      )
    )
      throw new ForbiddenException('Você não tem permissão para esta ação.');
    const { search, page, status } = parse(catalogQuery, query);
    const where = {
      salonId: req.identity.salonId,
      ...activeFilter(status),
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.professional.findMany({
          where,
          select: { id: true, name: true, active: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.professional.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  private async professional(
    tx: Prisma.TransactionClient,
    salonId: string,
    id: string,
    lock = false,
  ) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM professionals WHERE salon_id = ${salonId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    const p = await tx.professional.findFirst({ where: { id, salonId } });
    if (!p) throw new NotFoundException('Profissional não encontrado.');
    return p;
  }
  private async revise(tx: Prisma.TransactionClient, id: string, version: number) {
    const result = await tx.professional.updateMany({
      where: { id, version },
      data: { version: { increment: 1 } },
    });
    if (!result.count)
      throw new ConflictException(
        'Este profissional mudou. Reabra a configuração para carregar a versão atual.',
      );
  }
  @Get(':id/work')
  @Require(availabilityPermission)
  work(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(
      async (tx) => {
        const p = await this.professional(tx, req.identity.salonId, id);
        const salon = await tx.salon.findUniqueOrThrow({ where: { id: p.salonId } });
        const periods = await tx.workPeriod.findMany({
          where: { professionalId: id, salonId: p.salonId },
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        });
        return { version: p.version, timezone: salon.timezone, periods };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Put(':id/work')
  @Require(availabilityPermission)
  saveWork(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { periods, version, reason } = parse(workInput, body);
    const salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      await this.professional(tx, salonId, id, true);
      const salon = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
      const upcoming = await tx.appointment.findMany({
        where: { salonId, professionalId: id, status: occupying, endsAt: { gt: new Date() } },
        select: { startsAt: true, endsAt: true },
      });
      if (upcoming.some((a) => !withinWork(a.startsAt, a.endsAt, salon.timezone, periods)))
        throw new ConflictException(
          'Esta jornada deixaria agendamentos fora do horário. Remarque ou cancele esses agendamentos primeiro.',
        );
      await this.revise(tx, id, version);
      const before = await tx.workPeriod.findMany({ where: { salonId, professionalId: id } });
      await tx.workPeriod.deleteMany({ where: { salonId, professionalId: id } });
      await tx.workPeriod.createMany({
        data: periods.map((p) => ({ ...p, salonId, professionalId: id })),
      });
      await catalogAudit(
        tx,
        req,
        'professionals',
        id,
        'JORNADA_ALTERADA',
        reason,
        { periods },
        { periods: before },
      );
      return { version: version + 1, periods };
    });
  }
  @Get(':id/services')
  @Require('profissionais.gerenciar')
  services(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(
      async (tx) => {
        const p = await this.professional(tx, req.identity.salonId, id);
        const links = await tx.professionalService.findMany({
          where: { salonId: p.salonId, professionalId: id },
          include: { service: { select: { id: true, name: true, active: true } } },
          orderBy: { service: { name: 'asc' } },
        });
        return { version: p.version, services: links.map((l) => l.service) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Get(':id/service-options')
  @Require('profissionais.gerenciar')
  async options(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const { search, page } = parse(catalogQuery, query);
    await this.professional(this.db, req.identity.salonId, id);
    const where = {
      salonId: req.identity.salonId,
      active: true,
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.service.findMany({
          where,
          select: { id: true, name: true, active: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.service.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  @Put(':id/services')
  @Require('profissionais.gerenciar')
  saveServices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const { version, reason, serviceIds } = parse(servicesInput, body);
    const salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      await this.professional(tx, salonId, id, true);
      await this.revise(tx, id, version);
      const before = await tx.professionalService.findMany({
        where: { salonId, professionalId: id },
      });
      // Lock service rows so deactivation cannot race the active-service check.
      if (serviceIds.length)
        await tx.$queryRaw`SELECT id FROM services WHERE salon_id = ${salonId}::uuid AND id IN (${Prisma.join(serviceIds.map((s) => Prisma.sql`${s}::uuid`))}) ORDER BY id FOR UPDATE`;
      const services = await tx.service.findMany({ where: { salonId, id: { in: serviceIds } } });
      if (
        services.length !== serviceIds.length ||
        services.some((s) => !s.active && !before.some((l) => l.serviceId === s.id))
      )
        throw new BadRequestException('Selecione serviços ativos deste salão.');
      await tx.professionalService.deleteMany({ where: { salonId, professionalId: id } });
      await tx.professionalService.createMany({
        data: serviceIds.map((serviceId) => ({ salonId, professionalId: id, serviceId })),
      });
      await catalogAudit(
        tx,
        req,
        'professionals',
        id,
        'SERVICOS_PROFISSIONAL_ALTERADOS',
        reason,
        { serviceIds },
        { serviceIds: before.map((l) => l.serviceId) },
      );
      return { version: version + 1 };
    });
  }
  @Get(':id/blocks')
  @Require(availabilityPermission)
  async blocks(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const { page, status } = parse(catalogQuery, query);
    const salonId = req.identity.salonId;
    await this.professional(this.db, salonId, id);
    const where = {
      salonId,
      professionalId: id,
      ...(status === 'all' ? {} : { cancelledAt: status === 'active' ? null : { not: null } }),
    };
    const [items, total, salon] = await this.db.$transaction(
      [
        this.db.availabilityBlock.findMany({
          where,
          orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.availabilityBlock.count({ where }),
        this.db.salon.findUniqueOrThrow({ where: { id: salonId }, select: { timezone: true } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20, timezone: salon.timezone };
  }
  @Post(':id/blocks')
  @Require(availabilityPermission)
  addBlock(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { startLocal, endLocal, description, reason } = parse(blockInput, body);
    const salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      await this.professional(tx, salonId, id, true);
      const salon = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
      let startsAt: Date, endsAt: Date;
      try {
        startsAt = localInstant(startLocal, salon.timezone);
        endsAt = localInstant(endLocal, salon.timezone);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      if (startsAt >= endsAt) throw new BadRequestException('O fim deve ser posterior ao início.');
      if (
        await tx.availabilityBlock.findFirst({
          where: {
            salonId,
            professionalId: id,
            cancelledAt: null,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        })
      )
        throw new ConflictException(
          'Este período sobrepõe outro bloqueio. Confira os horários cadastrados.',
        );
      if (
        await tx.appointment.findFirst({
          where: {
            salonId,
            professionalId: id,
            status: occupying,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        })
      )
        throw new ConflictException(
          'Este bloqueio conflita com um agendamento. Remarque ou cancele o agendamento primeiro.',
        );
      const after = await tx.availabilityBlock.create({
        data: { salonId, professionalId: id, startsAt, endsAt, description },
      });
      await catalogAudit(
        tx,
        req,
        'availability_blocks',
        after.id,
        'BLOQUEIO_CRIADO',
        reason,
        after,
      );
      return after;
    });
  }
  @Patch(':id/blocks/:blockId/cancel')
  @Require(availabilityPermission)
  cancelBlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const { version, reason } = parse(revision, body);
    const salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      await this.professional(tx, salonId, id, true);
      const before = await tx.availabilityBlock.findFirst({
        where: { id: blockId, salonId, professionalId: id },
      });
      if (!before) throw new NotFoundException('Bloqueio não encontrado.');
      if (before.cancelledAt || before.version !== version)
        throw new ConflictException('Este bloqueio mudou. Atualize a lista.');
      const after = await tx.availabilityBlock.update({
        where: { id: blockId },
        data: { cancelledAt: new Date(), version: { increment: 1 } },
      });
      await catalogAudit(
        tx,
        req,
        'availability_blocks',
        blockId,
        'BLOQUEIO_CANCELADO',
        reason,
        after,
        before,
      );
      return after;
    });
  }
}
