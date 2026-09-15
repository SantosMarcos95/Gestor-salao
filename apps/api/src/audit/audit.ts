import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { instant, localParts } from '../appointments/rules';
import { dateInput } from '../appointments/validation';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
@Controller('audit')
@UseGuards(SessionGuard)
@Require('auditoria.visualizar')
export class AuditController {
  constructor(private db: Database) {}
  @Get('context')
  async context(@Req() req: AuthRequest) {
    const salonId = req.identity.salonId;
    const [salon, actions, entities] = await this.db.$transaction(
      [
        this.db.salon.findUniqueOrThrow({ where: { id: salonId }, select: { timezone: true } }),
        this.db.auditLog.groupBy({
          by: ['action'],
          where: { salonId },
          orderBy: { action: 'asc' },
        }),
        this.db.auditLog.groupBy({
          by: ['entity'],
          where: { salonId },
          orderBy: { entity: 'asc' },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      timezone: salon.timezone,
      today: localParts(new Date(), salon.timezone).date,
      actions: actions.map((v) => v.action),
      entities: entities.map((v) => v.entity),
    };
  }
  @Get('actors')
  async actors(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page } = parse(
      z
        .object({
          search: z.string().trim().max(150).default(''),
          page: z.coerce.number().int().min(1).max(100000).default(1),
        })
        .strict(),
      query,
    );
    const where = {
      salonId: req.identity.salonId,
      user: { name: { contains: search, mode: 'insensitive' as const } },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.salonUser.findMany({
          where,
          select: { id: true, active: true, user: { select: { name: true } } },
          orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.salonUser.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map((v) => ({ id: v.id, name: v.user.name + (v.active ? '' : ' (inativo)') })),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get()
  @Require('auditoria.visualizar')
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const filters = parse(
      z
        .object({
          page: z.coerce.number().int().min(1).max(100000).default(1),
          from: dateInput.optional(),
          to: dateInput.optional(),
          actorId: z.string().uuid().optional(),
          action: z.string().trim().min(1).max(100).optional(),
          entity: z.string().trim().min(1).max(100).optional(),
          entityId: z.string().uuid().optional(),
          reason: z.string().trim().max(150).default(''),
        })
        .strict()
        .refine(
          (v) =>
            (!v.from && !v.to) ||
            (!!v.from &&
              !!v.to &&
              v.from <= v.to &&
              Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000),
          'Informe as duas datas em ordem crescente, com diferença de até 366 dias.',
        ),
      query,
    );
    const { page, actorId, action, entity, entityId, reason, from, to } = filters;
    const { timezone } = await this.db.salon.findUniqueOrThrow({
      where: { id: req.identity.salonId },
      select: { timezone: true },
    });
    const where: Prisma.AuditLogWhereInput = {
      salonId: req.identity.salonId,
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(reason ? { reason: { contains: reason, mode: 'insensitive' } } : {}),
      ...(from && to
        ? {
            createdAt: {
              gte: instant(from + 'T00:00', timezone),
              lt: instant(
                new Date(Date.parse(to + 'T12:00Z') + 86400000).toISOString().slice(0, 10) +
                  'T00:00',
                timezone,
              ),
            },
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
          skip: (page - 1) * 20,
          include: { actor: { select: { user: { select: { name: true } } } } },
        }),
        this.db.auditLog.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const visible = req.identity.permissions.includes('produtos.visualizar_custo')
      ? items
      : items.map((item) => {
          if (item.entity !== 'stock_movements') return item;
          const redact = (value: unknown) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
            const { unitCost, ...rest } = value as Record<string, unknown>;
            return rest;
          };
          return { ...item, before: redact(item.before), after: redact(item.after) };
        });
    return { items: visible, total, page, pageSize: 20, timezone };
  }
}
