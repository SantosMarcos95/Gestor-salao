import { EXPORT_LIMIT, exportReport, decimalCsv } from './export';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { Require, SessionGuard } from '../auth/auth';
import { AuthRequest, parse } from '../common';
import { instant, localParts } from '../appointments/rules';
import { dateInput } from '../appointments/validation';

const reportQuery = z
  .object({
    from: dateInput,
    to: dateInput,
    group: z.enum(['services', 'professionals']).default('services'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    search: z.string().trim().max(150).default(''),
  })
  .strict()
  .refine(
    (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    'Selecione até 366 dias em ordem crescente.',
  );

@Controller('reports')
@UseGuards(SessionGuard)
@Require('relatorios.agenda')
export class ReportsController {
  constructor(private db: Database) {}
  @Get('production/export')
  async export(@Query() query: unknown, @Req() req: AuthRequest) {
    const data = await this.production(query, req, true);
    const rows: (string | number | boolean | null)[][] = [
      [
        'Nome',
        'Serviços concluídos',
        'Atendimentos concluídos',
        ...(data.canValues ? ['Valor antes do desconto (R$)'] : []),
      ],
      ...data.items.map((r) => [
        r.name,
        r.services,
        r.visits,
        ...(data.canValues ? [decimalCsv(r.amount)] : []),
      ]),
    ];
    return exportReport(this.db, req, 'producao', data, rows);
  }
  @Get('context')
  async context(@Req() req: AuthRequest) {
    const { timezone } = await this.db.salon.findUniqueOrThrow({
      where: { id: req.identity.salonId },
    });
    return { timezone, today: localParts(new Date(), timezone).date };
  }
  @Get('production')
  async production(@Query() query: unknown, @Req() req: AuthRequest, exporting = false) {
    const input = parse(reportQuery, query);
    const salonId = req.identity.salonId;
    const canValues = req.identity.permissions.includes('relatorios.financeiro');
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const next = new Date(Date.parse(input.to + 'T12:00Z') + 86400000)
          .toISOString()
          .slice(0, 10);
        const start = instant(input.from + 'T00:00', timezone),
          end = instant(next + 'T00:00', timezone);
        // Completed agenda entries without visits are counted once. After import the visit replaces them.
        const source = Prisma.sql`WITH production AS (
        SELECT v.id AS event_id, i.service_id, v.professional_id, i.price
        FROM visits v JOIN visit_items i ON i.visit_id=v.id AND i.salon_id=v.salon_id
        LEFT JOIN appointments a ON a.id=v.appointment_id AND a.salon_id=v.salon_id
        WHERE v.salon_id=${salonId}::uuid AND v.status='COMPLETED'
          AND COALESCE(v.completed_at,a.ends_at)>=${start} AND COALESCE(v.completed_at,a.ends_at)<${end}
        UNION ALL
        SELECT a.id AS event_id, i.service_id, a.professional_id, i.price
        FROM appointments a JOIN appointment_services i ON i.appointment_id=a.id AND i.salon_id=a.salon_id
        WHERE a.salon_id=${salonId}::uuid AND a.status='COMPLETED' AND a.ends_at>=${start} AND a.ends_at<${end}
          AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.appointment_id=a.id AND v.salon_id=a.salon_id)
      ), named AS (
        SELECT p.*, ${input.group === 'services' ? Prisma.sql`s.id` : Prisma.sql`pr.id`} AS group_id,
          ${input.group === 'services' ? Prisma.sql`s.name` : Prisma.sql`pr.name`} AS name
        FROM production p JOIN services s ON s.id=p.service_id AND s.salon_id=${salonId}::uuid
        JOIN professionals pr ON pr.id=p.professional_id AND pr.salon_id=${salonId}::uuid
      ), filtered AS (SELECT * FROM named WHERE POSITION(LOWER(${input.search}) IN LOWER(name))>0)`;
        const rows = await tx.$queryRaw<
          { id: string; name: string; services: bigint; visits: bigint; amount: string }[]
        >(Prisma.sql`${source}
        SELECT group_id AS id,name,COUNT(*)::bigint AS services,COUNT(DISTINCT event_id)::bigint AS visits,SUM(price)::text AS amount
        FROM filtered GROUP BY group_id,name ORDER BY COUNT(*) DESC,name ASC,group_id ASC LIMIT ${exporting ? EXPORT_LIMIT + 1 : 20} OFFSET ${exporting ? 0 : (input.page - 1) * 20}`);
        const [totals] = await tx.$queryRaw<
          { groups: bigint; services: bigint; visits: bigint; amount: string }[]
        >(Prisma.sql`${source}
        SELECT COUNT(DISTINCT group_id)::bigint AS groups,COUNT(*)::bigint AS services,COUNT(DISTINCT event_id)::bigint AS visits,COALESCE(SUM(price),0)::text AS amount FROM filtered`);
        return {
          timezone,
          from: input.from,
          to: input.to,
          page: input.page,
          pageSize: 20,
          total: Number(totals.groups),
          canValues,
          summary: {
            services: Number(totals.services),
            visits: Number(totals.visits),
            amount: canValues ? new Prisma.Decimal(totals.amount).toFixed(2) : null,
          },
          items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            services: Number(r.services),
            visits: Number(r.visits),
            amount: canValues ? new Prisma.Decimal(r.amount).toFixed(2) : null,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
