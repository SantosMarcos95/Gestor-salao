import { EXPORT_LIMIT, exportReport, decimalCsv } from './export';
import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../database';
import { Require, SessionGuard } from '../auth/auth';
import { AuthRequest, parse } from '../common';
import { instant } from '../appointments/rules';
import { dateInput } from '../appointments/validation';
import { occupancy, workIntervals, type Interval } from './occupancy-rules';
const input = z
  .object({
    from: dateInput,
    to: dateInput,
    search: z.string().trim().max(150).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    status: z.enum(['active', 'all']).default('active'),
  })
  .strict()
  .refine(
    (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) < 31 * 86400000,
    'Selecione até 31 dias em ordem crescente.',
  );
@Controller('reports/occupancy')
@UseGuards(SessionGuard)
@Require('relatorios.agenda')
export class OccupancyController {
  constructor(private db: Database) {}
  @Get('export')
  async export(@Query() query: unknown, @Req() req: AuthRequest) {
    const data = await this.report(query, req, true);
    return exportReport(this.db, req, 'ocupacao', data, [
      [
        'Profissional',
        'Ativo',
        'Disponível (min)',
        'Ocupado (min)',
        'Livre (min)',
        'Bloqueado (min)',
        'Fora da disponibilidade (min)',
        'Ocupação (%)',
        'Cancelamentos',
        'Faltas',
      ],
      ...data.items.map((r) => [
        r.name,
        r.active ? 'Sim' : 'Não',
        ...[
          r.availableMinutes,
          r.occupiedMinutes,
          r.freeMinutes,
          r.blockedMinutes,
          r.outsideMinutes,
        ].map((v) => decimalCsv(String(v))),
        r.rate === null ? '' : decimalCsv(String(r.rate)),
        r.cancelled,
        r.noShow,
      ]),
    ]);
  }
  @Get()
  async report(@Query() query: unknown, @Req() req: AuthRequest, exporting = false) {
    const { from, to, search, page, status } = parse(input, query),
      salonId = req.identity.salonId;
    const snapshot = await this.db.$transaction(
      async (tx) => {
        const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const start = instant(from + 'T00:00', timezone),
          end = instant(
            new Date(Date.parse(to + 'T12:00Z') + 86400000).toISOString().slice(0, 10) + 'T00:00',
            timezone,
          );
        const professionals = await tx.professional.findMany({
          where: {
            salonId,
            ...(status === 'active' ? { active: true } : {}),
            name: { contains: search, mode: 'insensitive' },
          },
          select: {
            id: true,
            name: true,
            active: true,
            workPeriods: { select: { weekday: true, startMinute: true, endMinute: true } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 201,
        });
        if (professionals.length > 200)
          throw new BadRequestException('Selecione uma busca com até 200 profissionais.');
        const where = {
          salonId,
          professionalId: { in: professionals.map((p) => p.id) },
          startsAt: { lt: end },
          endsAt: { gt: start },
        };
        const [blocks, appointments] = await Promise.all([
          tx.availabilityBlock.findMany({
            where: { ...where, cancelledAt: null },
            select: { professionalId: true, startsAt: true, endsAt: true },
            take: 20001,
          }),
          tx.appointment.findMany({
            where,
            select: { professionalId: true, startsAt: true, endsAt: true, status: true },
            take: 20001,
          }),
        ]);
        if (blocks.length > 20000 || appointments.length > 20000)
          throw new BadRequestException(
            'Muitos registros. Reduza o período ou filtre um profissional.',
          );
        return { professionals, blocks, appointments, timezone, start, end };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const { professionals, blocks, appointments, timezone, start, end } = snapshot;
    const interval = (v: { startsAt: Date; endsAt: Date }): Interval => [
      Math.max(+start, +v.startsAt),
      Math.min(+end, +v.endsAt),
    ];
    const rows = professionals.map((p) => {
      const entries = appointments.filter((a) => a.professionalId === p.id);
      const booked = entries.filter((a) => !['CANCELLED', 'NO_SHOW'].includes(a.status));
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        ...occupancy(
          workIntervals(from, to, timezone, p.workPeriods),
          blocks.filter((b) => b.professionalId === p.id).map(interval),
          booked.map(interval),
        ),
        appointments: booked.length,
        cancelled: entries.filter((a) => a.status === 'CANCELLED').length,
        noShow: entries.filter((a) => a.status === 'NO_SHOW').length,
      };
    });
    const summary = rows.reduce(
      (s, r) => ({
        availableMinutes: s.availableMinutes + r.availableMinutes,
        occupiedMinutes: s.occupiedMinutes + r.occupiedMinutes,
        freeMinutes: s.freeMinutes + r.freeMinutes,
        blockedMinutes: s.blockedMinutes + r.blockedMinutes,
        outsideMinutes: s.outsideMinutes + r.outsideMinutes,
        cancelled: s.cancelled + r.cancelled,
        noShow: s.noShow + r.noShow,
      }),
      {
        availableMinutes: 0,
        occupiedMinutes: 0,
        freeMinutes: 0,
        blockedMinutes: 0,
        outsideMinutes: 0,
        cancelled: 0,
        noShow: 0,
      },
    );
    return {
      timezone,
      from,
      to,
      items: exporting ? rows : rows.slice((page - 1) * 20, page * 20),
      page,
      pageSize: 20,
      total: rows.length,
      summary: {
        ...summary,
        rate: summary.availableMinutes
          ? Math.round((summary.occupiedMinutes / summary.availableMinutes) * 1000) / 10
          : null,
      },
    };
  }
}
