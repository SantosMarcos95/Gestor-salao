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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Database } from '../database';
import { AuthRequest, Identity, parse } from '../common';
import { SessionGuard } from '../auth/auth';
import { catalogAudit } from '../catalog/shared';
import { createInput, optionsQuery, statusInput, updateInput, viewQuery } from './validation';
import { instant, localParts, occupying, scope, terminal, transitions, withinWork } from './rules';
const include = {
  visit: { select: { id: true, orderId: true } },
  professional: { select: { id: true, name: true, membershipId: true, active: true } },
  client: { select: { id: true, name: true, deletedAt: true } },
  location: { select: { id: true, name: true, active: true } },
  services: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.AppointmentInclude;
type Full = Prisma.AppointmentGetPayload<{ include: typeof include }>;
function output(a: Full, timezone?: string) {
  const { requestHash, requestKey, ...rest } = a;
  return {
    ...rest,
    services: a.services.map((s) => ({ ...s, price: s.price.toFixed(2) })),
    total: a.services.reduce((sum, s) => sum.add(s.price), new Prisma.Decimal(0)).toFixed(2),
    ...(timezone ? { timezone } : {}),
  };
}
@Controller('appointments')
@UseGuards(SessionGuard)
export class AppointmentsController {
  constructor(private db: Database) {}
  private professionalScope(
    identity: Identity,
    action: 'visualizar' | 'criar' | 'editar' | 'excluir' = 'visualizar',
  ): Prisma.ProfessionalWhereInput {
    return { AND: [scope(identity, 'visualizar'), scope(identity, action)] };
  }
  private clientScope(identity: Identity): Prisma.ClientWhereInput {
    const base = { salonId: identity.salonId, deletedAt: null };
    if (identity.permissions.includes('clientes.visualizar_todos')) return base;
    if (identity.permissions.includes('clientes.visualizar_relacionados'))
      return {
        ...base,
        OR: [
          { createdBy: identity.membershipId },
          {
            appointments: {
              some: {
                salonId: identity.salonId,
                professional: { membershipId: identity.membershipId },
              },
            },
          },
        ],
      };
    throw new ForbiddenException('Seu acesso não permite selecionar clientes.');
  }
  @Get('context')
  async context(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page, action } = parse(optionsQuery, query);
    const where = {
      ...this.professionalScope(req.identity, action),
      ...(action === 'visualizar' ? {} : { active: true }),
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total, salon, locations] = await this.db.$transaction(
      [
        this.db.professional.findMany({
          where,
          select: { id: true, name: true, active: true, membershipId: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.professional.count({ where }),
        this.db.salon.findUniqueOrThrow({
          where: { id: req.identity.salonId },
          select: { timezone: true },
        }),
        this.db.location.findMany({
          where: { salonId: req.identity.salonId, active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items,
      total,
      page,
      pageSize: 20,
      timezone: salon.timezone,
      today: localParts(new Date(), salon.timezone).date,
      locations,
    };
  }
  @Get('clients')
  async clients(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page, action } = parse(optionsQuery, query);
    if (action === 'visualizar') throw new BadRequestException('Informe criar ou editar.');
    this.professionalScope(req.identity, action);
    const where = {
      ...this.clientScope(req.identity),
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.client.findMany({
          where,
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.client.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  @Get('services')
  async services(@Query() query: unknown, @Req() req: AuthRequest) {
    const { professionalId, search, page, action } = parse(
      optionsQuery.extend({ professionalId: z.string().uuid() }),
      query,
    );
    if (action === 'visualizar') throw new BadRequestException('Informe criar ou editar.');
    if (
      !(await this.db.professional.findFirst({
        where: {
          id: professionalId,
          active: true,
          ...this.professionalScope(req.identity, action),
        },
      }))
    )
      throw new NotFoundException('Profissional não encontrado.');
    const where = {
      salonId: req.identity.salonId,
      active: true,
      professionals: { some: { professionalId } },
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.service.findMany({
          where,
          select: { id: true, name: true, price: true, durationMinutes: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.service.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map((s) => ({ ...s, price: s.price.toFixed(2) })),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get()
  list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { date, days, professionalId, page, status } = parse(viewQuery, query);
    const professionalScope = this.professionalScope(req.identity);
    return this.db.$transaction(
      async (tx) => {
        const salonId = req.identity.salonId;
        const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const start = instant(`${date}T00:00`, timezone);
        const endDate = new Date(Date.parse(`${date}T00:00Z`) + days * 86400000)
          .toISOString()
          .slice(0, 10);
        const end = instant(`${endDate}T00:00`, timezone);
        if (
          professionalId &&
          !(await tx.professional.findFirst({
            where: { id: professionalId, ...professionalScope },
          }))
        )
          throw new NotFoundException('Profissional não encontrado.');
        const where = { ...professionalScope, ...(professionalId ? { id: professionalId } : {}) };
        const professionals = await tx.professional.findMany({
          where,
          select: {
            id: true,
            name: true,
            active: true,
            membershipId: true,
            workPeriods: { select: { weekday: true, startMinute: true, endMinute: true } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        });
        const total = await tx.professional.count({ where });
        const interval = {
          salonId,
          professionalId: { in: professionals.map((p) => p.id) },
          startsAt: { lt: end },
          endsAt: { gt: start },
        };
        const items = await tx.appointment.findMany({
          where: { ...interval, ...(status === 'all' ? {} : { status }) },
          include,
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          take: 1001,
        });
        const blocks = await tx.availabilityBlock.findMany({
          where: { ...interval, cancelledAt: null },
          select: { id: true, professionalId: true, startsAt: true, endsAt: true },
          orderBy: { startsAt: 'asc' },
          take: 1001,
        });
        if (items.length > 1000 || blocks.length > 1000)
          throw new BadRequestException(
            'Muitos registros. Selecione um profissional ou consulte um dia.',
          );
        return {
          items: items.map((a) => output(a)),
          professionals,
          blocks,
          timezone,
          date,
          days,
          total,
          page,
          pageSize: 20,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const where = {
      id,
      salonId: req.identity.salonId,
      professional: this.professionalScope(req.identity),
    };
    return this.db.$transaction(
      async (tx) => {
        const a = await tx.appointment.findFirst({ where, include });
        if (!a) throw new NotFoundException('Agendamento não encontrado.');
        const { timezone } = await tx.salon.findUniqueOrThrow({
          where: { id: req.identity.salonId },
        });
        // Agenda history exposes scheduling actions, without granting access to the general audit module.
        const history = await tx.auditLog.findMany({
          where: { salonId: req.identity.salonId, entity: 'appointments', entityId: id },
          select: {
            id: true,
            action: true,
            reason: true,
            before: true,
            after: true,
            createdAt: true,
            actor: { select: { user: { select: { name: true } } } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 50,
        });
        return {
          ...output(a, timezone),
          history: history.map(({ before, after, ...h }) => ({
            ...h,
            fromStatus: (before as { status?: string } | null)?.status ?? null,
            toStatus: (after as { status?: string } | null)?.status ?? null,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async lockProfessionals(tx: Prisma.TransactionClient, ids: string[], salonId: string) {
    await tx.$queryRaw`SELECT id FROM professionals WHERE salon_id = ${salonId}::uuid AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
  }
  private async permitted(
    tx: Prisma.TransactionClient,
    identity: Identity,
    id: string,
    action: 'criar' | 'editar' | 'excluir',
  ) {
    const p = await tx.professional.findFirst({
      where: { id, ...this.professionalScope(identity, action) },
    });
    if (!p) throw new NotFoundException('Profissional não encontrado ou fora do seu acesso.');
    return p;
  }
  private async prepare(
    tx: Prisma.TransactionClient,
    req: AuthRequest,
    input: z.infer<typeof updateInput> | z.infer<typeof createInput>,
    before?: Full,
  ) {
    const { salonId } = req.identity;
    const p = await this.permitted(
      tx,
      req.identity,
      input.professionalId,
      before ? 'editar' : 'criar',
    );
    if (!p.active) throw new BadRequestException('O profissional está inativo.');
    await tx.$queryRaw`SELECT id FROM clients WHERE salon_id = ${salonId}::uuid AND id = ${input.clientId}::uuid FOR UPDATE`;
    const clientWhere =
      before?.clientId === input.clientId
        ? { salonId, deletedAt: null }
        : this.clientScope(req.identity);
    if (!(await tx.client.findFirst({ where: { ...clientWhere, id: input.clientId } })))
      throw new NotFoundException('Selecione um cliente ativo dentro do seu acesso.');
    if (!(await tx.location.findFirst({ where: { salonId, id: input.locationId, active: true } })))
      throw new NotFoundException('Unidade não encontrada.');
    await tx.$queryRaw`SELECT id FROM services WHERE salon_id = ${salonId}::uuid AND id IN (${Prisma.join(input.serviceIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
    const services = await tx.service.findMany({
      where: {
        salonId,
        id: { in: input.serviceIds },
        active: true,
        professionals: { some: { professionalId: p.id } },
      },
    });
    if (services.length !== input.serviceIds.length)
      throw new BadRequestException('Selecione serviços ativos realizados por este profissional.');
    if (input.servicePrices?.some((s) => !input.serviceIds.includes(s.serviceId)))
      throw new BadRequestException('Informe preços apenas para os serviços selecionados.');
    // Preserve quoted price/duration for retained services; newly added services use the current catalog.
    const items = input.serviceIds.map((id, position) => {
      const s =
        before?.services.find((s) => s.serviceId === id) ?? services.find((s) => s.id === id)!;
      return {
        serviceId: id,
        position,
        name: s.name,
        price: (() => {
          const custom = input.servicePrices?.find((value) => value.serviceId === id);
          if (!custom) return s.price;
          const price = new Prisma.Decimal(custom.price);
          if (
            !price.equals(s.price) &&
            !req.identity.permissions.includes('comandas.alterar_preco')
          )
            throw new ForbiddenException(
              'Você não tem permissão para alterar o valor dos serviços.',
            );
          return price;
        })(),
        durationMinutes: s.durationMinutes,
      };
    });
    const duration = items.reduce((sum, s) => sum + s.durationMinutes, 0);
    if (duration > 1440)
      throw new BadRequestException('A duração total não pode exceder 24 horas.');
    const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
    const startsAt = instant(input.startLocal, timezone),
      endsAt = new Date(+startsAt + duration * 60000);
    const periods = await tx.workPeriod.findMany({ where: { salonId, professionalId: p.id } });
    if (!withinWork(startsAt, endsAt, timezone, periods))
      throw new ConflictException(
        periods.length === 0
          ? 'Este profissional não possui horários de trabalho cadastrados. Configure os dias e horários em Disponibilidade → Jornada antes de agendar.'
          : 'O período está fora da jornada ou atravessa um intervalo do profissional. Confira a jornada em Disponibilidade; todos os serviços precisam terminar dentro do horário de trabalho.',
      );
    const interval = {
      salonId,
      professionalId: p.id,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    };
    if (await tx.availabilityBlock.findFirst({ where: { ...interval, cancelledAt: null } }))
      throw new ConflictException('O profissional tem um bloqueio neste período.');
    if (
      await tx.appointment.findFirst({
        where: { ...interval, status: occupying, ...(before ? { id: { not: before.id } } : {}) },
      })
    )
      throw new ConflictException('O profissional já tem um agendamento neste período.');
    return {
      professionalId: p.id,
      clientId: input.clientId,
      locationId: input.locationId,
      startsAt,
      endsAt,
      notes: input.notes,
      items,
    };
  }
  @Post()
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(createInput, body);
    this.professionalScope(req.identity, 'criar');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.db.$transaction(async (tx) => {
      const salonId = req.identity.salonId;
      await this.lockProfessionals(tx, [input.professionalId], salonId);
      await this.permitted(tx, req.identity, input.professionalId, 'criar');
      const existing = await tx.appointment.findUnique({
        where: { salonId_requestKey: { salonId, requestKey: input.requestKey } },
        include,
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('Esta chave de envio já foi utilizada.');
        await this.permitted(tx, req.identity, existing.professionalId, 'criar');
        return output(existing);
      }
      const { items, ...data } = await this.prepare(tx, req, input);
      const after = await tx.appointment.create({
        data: {
          ...data,
          salonId,
          requestKey: input.requestKey,
          requestHash,
          services: { create: items },
        },
        include,
      });
      await catalogAudit(
        tx,
        req,
        'appointments',
        after.id,
        'AGENDAMENTO_CRIADO',
        input.reason,
        output(after),
      );
      return output(after);
    });
  }
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(updateInput, body);
    this.professionalScope(req.identity, 'editar');
    return this.db.$transaction(async (tx) => {
      const salonId = req.identity.salonId;
      await tx.$queryRaw`SELECT id FROM appointments WHERE salon_id = ${salonId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.appointment.findFirst({ where: { id, salonId }, include });
      if (!before) throw new NotFoundException('Agendamento não encontrado.');
      await this.lockProfessionals(tx, [before.professionalId, input.professionalId], salonId);
      await this.permitted(tx, req.identity, before.professionalId, 'editar');
      if (before.visit)
        throw new ConflictException(
          'Este agendamento já está vinculado a uma comanda. Acompanhe ou cancele pelo atendimento.',
        );

      if (before.version !== input.version)
        throw new ConflictException('Este agendamento mudou. Reabra os detalhes para atualizar.');
      if (terminal.includes(before.status))
        throw new ConflictException('Agendamentos encerrados não podem ser alterados.');
      if (before.status === 'ARRIVED')
        throw new ConflictException(
          'Um cliente que já chegou não pode ter o agendamento remarcado.',
        );
      const { items, ...data } = await this.prepare(tx, req, input, before);
      await tx.appointmentService.deleteMany({ where: { appointmentId: id, salonId } });
      const after = await tx.appointment.update({
        where: { id },
        data: { ...data, version: { increment: 1 }, services: { create: items } },
        include,
      });
      await catalogAudit(
        tx,
        req,
        'appointments',
        id,
        'AGENDAMENTO_ALTERADO',
        input.reason,
        output(after),
        output(before),
      );
      return output(after);
    });
  }
  @Patch(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(statusInput, body),
      action = input.status === 'CANCELLED' ? 'excluir' : 'editar';
    this.professionalScope(req.identity, action);
    return this.db.$transaction(async (tx) => {
      const salonId = req.identity.salonId;
      await tx.$queryRaw`SELECT id FROM appointments WHERE salon_id = ${salonId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.appointment.findFirst({ where: { id, salonId }, include });
      if (!before) throw new NotFoundException('Agendamento não encontrado.');
      await this.lockProfessionals(tx, [before.professionalId], salonId);
      await this.permitted(tx, req.identity, before.professionalId, action);
      if (before.visit)
        throw new ConflictException(
          'Este agendamento já está vinculado a uma comanda. Acompanhe ou cancele pelo atendimento.',
        );

      if (before.version !== input.version)
        throw new ConflictException('Este agendamento mudou. Reabra os detalhes para atualizar.');
      if (!transitions[before.status].includes(input.status))
        throw new ConflictException('Esta mudança de status não é permitida.');
      if (
        (input.status === 'NO_SHOW' && before.startsAt > new Date()) ||
        (input.status === 'COMPLETED' && before.endsAt > new Date())
      )
        throw new ConflictException(
          'Aguarde o horário do agendamento antes de registrar falta ou conclusão.',
        );
      const after = await tx.appointment.update({
        where: { id },
        data: { status: input.status, version: { increment: 1 } },
        include,
      });
      await catalogAudit(
        tx,
        req,
        'appointments',
        id,
        input.status === 'CANCELLED' ? 'AGENDAMENTO_CANCELADO' : 'AGENDAMENTO_STATUS_ALTERADO',
        input.reason,
        output(after),
        output(before),
      );
      return output(after);
    });
  }
}
