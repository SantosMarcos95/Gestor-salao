import { EXPORT_LIMIT, exportReport, decimalCsv } from './export';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { Require, SessionGuard } from '../auth/auth';
import { AuthRequest, parse } from '../common';
import { instant, localParts } from '../appointments/rules';
import { dateInput } from '../appointments/validation';
const input = z
  .object({
    from: dateInput,
    to: dateInput,
    search: z.string().trim().max(150).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    status: z.enum(['active', 'all']).default('active'),
    replenish: z.enum(['all', 'needed']).default('all'),
  })
  .strict()
  .refine(
    (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    'Selecione até 366 dias em ordem crescente.',
  );
@Controller('reports/stock')
@UseGuards(SessionGuard)
@Require('relatorios.estoque')
export class StockReportController {
  constructor(private db: Database) {}
  @Get('export')
  async export(@Query() query: unknown, @Req() req: AuthRequest) {
    const data = await this.report(query, req, true);
    return exportReport(this.db, req, 'estoque', data, [
      [
        'Produto',
        'Ativo',
        'Unidade',
        'Consumo no período',
        'Entradas',
        'Perdas',
        'Baixas manuais',
        'Ajustes',
        'Saldo atual',
        'Mínimo atual',
        'Falta até o mínimo',
        'Repor agora',
      ],
      ...data.items.map((r) => [
        r.name,
        r.active ? 'Sim' : 'Não',
        r.baseUnit,
        ...[
          r.consumed,
          r.entries,
          r.losses,
          r.manual,
          r.adjustments,
          r.balance,
          r.minimum,
          r.needed,
        ].map(decimalCsv),
        r.belowMinimum ? 'Sim' : 'Não',
      ]),
    ]);
  }
  @Get('context')
  async context(@Req() req: AuthRequest) {
    const { timezone } = await this.db.salon.findUniqueOrThrow({
      where: { id: req.identity.salonId },
    });
    return { timezone, today: localParts(new Date(), timezone).date };
  }
  @Get()
  async report(@Query() query: unknown, @Req() req: AuthRequest, exporting = false) {
    const { from, to, search, page, status, replenish } = parse(input, query),
      salonId = req.identity.salonId;
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const start = instant(from + 'T00:00', timezone),
          end = instant(
            new Date(Date.parse(to + 'T12:00Z') + 86400000).toISOString().slice(0, 10) + 'T00:00',
            timezone,
          );
        const source = Prisma.sql`WITH selected AS (
        SELECT id,name,base_unit,active,balance,minimum FROM products WHERE salon_id=${salonId}::uuid
        AND (${status}='all' OR active) AND POSITION(LOWER(${search}) IN LOWER(name))>0
        AND (${replenish}='all' OR (active AND balance<=minimum))
      ), movement_totals AS (
        SELECT m.product_id,
          SUM(CASE WHEN c.id IS NOT NULL THEN m.quantity ELSE 0 END) AS consumed,
          SUM(CASE WHEN m.kind='ENTRY' THEN m.quantity ELSE 0 END) AS entries,
          SUM(CASE WHEN m.kind='LOSS' THEN m.quantity ELSE 0 END) AS losses,
          SUM(CASE WHEN m.kind='OUT' AND c.id IS NULL THEN m.quantity ELSE 0 END) AS manual,
          SUM(CASE WHEN m.kind='ADJUST' THEN m.delta ELSE 0 END) AS adjustments
        FROM stock_movements m JOIN selected p ON p.id=m.product_id
        LEFT JOIN visit_consumptions c ON c.movement_id=m.id AND c.salon_id=m.salon_id
        WHERE m.salon_id=${salonId}::uuid AND m.created_at>=${start} AND m.created_at<${end}
        GROUP BY m.product_id
      ), report AS (
        SELECT p.*, COALESCE(m.consumed,0) AS consumed, COALESCE(m.entries,0) AS entries,
          COALESCE(m.losses,0) AS losses, COALESCE(m.manual,0) AS manual, COALESCE(m.adjustments,0) AS adjustments
        FROM selected p LEFT JOIN movement_totals m ON m.product_id=p.id
      )`;
        const rows = await tx.$queryRaw<
          {
            id: string;
            name: string;
            baseUnit: string;
            active: boolean;
            balance: string;
            minimum: string;
            needed: string;
            belowMinimum: boolean;
            consumed: string;
            entries: string;
            losses: string;
            manual: string;
            adjustments: string;
          }[]
        >(Prisma.sql`${source}
        SELECT id,name,base_unit AS "baseUnit",active,balance::text,minimum::text,
        GREATEST(minimum-balance,0)::text AS needed,(active AND balance<=minimum) AS "belowMinimum",
        consumed::text,entries::text,losses::text,manual::text,adjustments::text FROM report
        ORDER BY (active AND balance<=minimum) DESC,name ASC,id ASC LIMIT ${exporting ? EXPORT_LIMIT + 1 : 20} OFFSET ${exporting ? 0 : (page - 1) * 20}`);
        const [summary] = await tx.$queryRaw<
          { products: bigint; replenish: bigint; consumed: bigint }[]
        >(Prisma.sql`${source}
        SELECT COUNT(*)::bigint AS products,COUNT(*) FILTER (WHERE active AND balance<=minimum)::bigint AS replenish,COUNT(*) FILTER (WHERE consumed>0)::bigint AS consumed FROM report`);
        return {
          timezone,
          from,
          to,
          page,
          pageSize: 20,
          total: Number(summary.products),
          summary: {
            products: Number(summary.products),
            replenish: Number(summary.replenish),
            consumed: Number(summary.consumed),
          },
          items: rows.map((r) => ({
            ...r,
            ...Object.fromEntries(
              [
                'balance',
                'minimum',
                'needed',
                'consumed',
                'entries',
                'losses',
                'manual',
                'adjustments',
              ].map((k) => [k, new Prisma.Decimal(r[k as keyof typeof r] as string).toFixed(6)]),
            ),
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
