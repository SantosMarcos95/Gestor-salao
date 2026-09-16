import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { catalogQuery, catalogStatus, professionalInput, professionalUpdate } from './validation';
import { activeFilter, catalogAudit } from './shared';
import { requireAdministrator } from '../finance/commissions';

const include = {
  membership: {
    select: { id: true, active: true, user: { select: { name: true, email: true, status: true } } },
  },
} satisfies Prisma.ProfessionalInclude;
@Controller('professionals')
@UseGuards(SessionGuard)
@Require('profissionais.gerenciar')
export class ProfessionalsController {
  constructor(private db: Database) {}
  @Get()
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
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
          include,
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
  @Get('users')
  async users(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page } = parse(catalogQuery, query);
    const where: Prisma.SalonUserWhereInput = {
      salonId: req.identity.salonId,
      active: true,
      professional: { is: null },
      user: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.salonUser.findMany({
          where,
          select: { id: true, user: { select: { name: true, email: true } } },
          orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
          take: 20,
          skip: (page - 1) * 20,
        }),
        this.db.salonUser.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  private async checkMembership(
    tx: Prisma.TransactionClient,
    salonId: string,
    membershipId: string | null,
  ) {
    if (!membershipId) return;
    // Access writers use the salon lock too, preventing linking a concurrently deactivated account.
    await tx.$queryRaw`SELECT id FROM salons WHERE id = ${salonId}::uuid FOR UPDATE`;
    if (
      !(await tx.salonUser.findFirst({
        where: { id: membershipId, salonId, active: true, user: { status: 'ACTIVE' } },
      }))
    )
      throw new NotFoundException('Selecione um usuário ativo deste salão.');
  }
  @Post()
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, ...data } = parse(professionalInput, body);
    return this.db.$transaction(async (tx) => {
      await this.checkMembership(tx, req.identity.salonId, data.membershipId);
      if (data.commissionRate !== undefined) await requireAdministrator(tx, req);
      const after = await tx.professional.create({
        data: { ...data, salonId: req.identity.salonId },
        include,
      });
      await catalogAudit(tx, req, 'professionals', after.id, 'PROFISSIONAL_CRIADO', reason, after);
      return after;
    });
  }
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, ...data } = parse(professionalUpdate, body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.professional.findFirst({
        where: { id, salonId: req.identity.salonId },
        include,
      });
      if (!before) throw new NotFoundException('Profissional não encontrado.');
      if (data.membershipId !== before.membershipId) await requireAdministrator(tx, req);
      if (data.commissionRate !== undefined && !before.commissionRate.equals(data.commissionRate))
        await requireAdministrator(tx, req);
      if (data.membershipId !== before.membershipId)
        await this.checkMembership(tx, req.identity.salonId, data.membershipId);
      const result = await tx.professional.updateMany({
        where: { id, salonId: req.identity.salonId, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException('Este profissional mudou. Feche a edição e atualize a lista.');
      const after = await tx.professional.findUniqueOrThrow({ where: { id }, include });
      await catalogAudit(
        tx,
        req,
        'professionals',
        id,
        'PROFISSIONAL_ALTERADO',
        reason,
        after,
        before,
      );
      return after;
    });
  }
  @Patch(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, active } = parse(catalogStatus, body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.professional.findFirst({
        where: { id, salonId: req.identity.salonId },
        include,
      });
      if (!before) throw new NotFoundException('Profissional não encontrado.');
      const result = await tx.professional.updateMany({
        where: { id, salonId: req.identity.salonId, version },
        data: { active, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException('Este profissional mudou. Feche a janela e atualize a lista.');
      const after = await tx.professional.findUniqueOrThrow({ where: { id }, include });
      await catalogAudit(
        tx,
        req,
        'professionals',
        id,
        active ? 'PROFISSIONAL_ATIVADO' : 'PROFISSIONAL_DESATIVADO',
        reason,
        after,
        before,
      );
      return after;
    });
  }
}
