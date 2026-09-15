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
    method: z.enum(['all', 'CASH', 'PIX', 'CREDIT', 'DEBIT', 'OTHER']).default('all'),
    kind: z.enum(['all', 'payment', 'refund']).default('all'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine(
    (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    'Selecione até 366 dias em ordem crescente.',
  );
@Controller('reports/receipts')
@UseGuards(SessionGuard)
@Require('relatorios.financeiro')
export class ReceiptsReportController {
  constructor(private db: Database) {}
  @Get('export')
  async export(@Query() query: unknown, @Req() req: AuthRequest) {
    const data = await this.report(query, req, true);
    const methods: Record<string, string> = {
      CASH: 'Dinheiro',
      PIX: 'PIX',
      CREDIT: 'Cartão de crédito',
      DEBIT: 'Cartão de débito',
      OTHER: 'Outro',
    };
    return exportReport(this.db, req, 'recebimentos', data, [
      [
        'Cliente',
        'Data (' + data.timezone + ')',
        'Tipo',
        'Forma',
        'Valor (R$)',
        'Troco (R$)',
        'Referência',
        'Motivo',
        'Comanda',
        'Pagamento original',
      ],
      ...data.items.map((r) => [
        r.clientName,
        new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: data.timezone }),
        r.kind === 'payment' ? 'Pagamento' : 'Estorno',
        methods[r.method],
        decimalCsv(r.amount),
        decimalCsv(r.change),
        r.reference,
        r.reason,
        r.orderId,
        r.paymentId,
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
    const { from, to, search, method, kind, page } = parse(input, query),
      salonId = req.identity.salonId;
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const start = instant(from + 'T00:00', timezone),
          end = instant(
            new Date(Date.parse(to + 'T12:00Z') + 86400000).toISOString().slice(0, 10) + 'T00:00',
            timezone,
          );
        const source = Prisma.sql`WITH entries AS (
        SELECT p.id,p.order_id,p.id AS payment_id,p.created_at,p.method,p.amount,p.change,p.reference,p.reason,'payment'::text AS kind
        FROM payments p WHERE p.salon_id=${salonId}::uuid AND p.created_at>=${start} AND p.created_at<${end}
        UNION ALL
        SELECT r.id,p.order_id,p.id AS payment_id,r.created_at,p.method,r.amount,0::numeric AS change,r.reference,r.reason,'refund'::text AS kind
        FROM payment_refunds r JOIN payments p ON p.id=r.payment_id AND p.salon_id=r.salon_id
        WHERE r.salon_id=${salonId}::uuid AND r.created_at>=${start} AND r.created_at<${end}
      ), filtered AS (
        SELECT e.*,o.client_name FROM entries e JOIN salon_orders o ON o.id=e.order_id AND o.salon_id=${salonId}::uuid
        WHERE (${method}='all' OR e.method=${method}) AND (${kind}='all' OR e.kind=${kind}) AND POSITION(LOWER(${search}) IN LOWER(o.client_name))>0
      )`;
        const rows = await tx.$queryRaw<
          {
            id: string;
            orderId: string;
            paymentId: string;
            clientName: string;
            createdAt: Date;
            method: string;
            kind: string;
            amount: string;
            change: string;
            reference: string | null;
            reason: string;
          }[]
        >(Prisma.sql`${source}
        SELECT id,order_id AS "orderId",payment_id AS "paymentId",client_name AS "clientName",created_at AS "createdAt",method,kind,amount::text,change::text,reference,reason
        FROM filtered ORDER BY created_at DESC,kind ASC,id DESC LIMIT ${exporting ? EXPORT_LIMIT + 1 : 20} OFFSET ${exporting ? 0 : (page - 1) * 20}`);
        const totals = await tx.$queryRaw<
          {
            method: string;
            count: bigint;
            received: string;
            refunded: string;
            net: string;
            change: string;
          }[]
        >(Prisma.sql`${source}
        SELECT method,COUNT(*)::bigint AS count,COALESCE(SUM(amount) FILTER (WHERE kind='payment'),0)::text AS received,
        COALESCE(SUM(amount) FILTER (WHERE kind='refund'),0)::text AS refunded,
        SUM(CASE WHEN kind='payment' THEN amount ELSE -amount END)::text AS net, SUM(change)::text AS change FROM filtered GROUP BY method`);
        const decimal = (value: string) => new Prisma.Decimal(value).toFixed(2);
        const sum = (key: 'received' | 'refunded' | 'net' | 'change') =>
          totals.reduce((n, t) => n.plus(t[key]), new Prisma.Decimal(0)).toFixed(2);
        return {
          timezone,
          from,
          to,
          page,
          pageSize: 20,
          total: totals.reduce((n, t) => n + Number(t.count), 0),
          summary: {
            received: sum('received'),
            refunded: sum('refunded'),
            net: sum('net'),
            change: sum('change'),
          },
          byMethod: ['PIX', 'CREDIT', 'DEBIT', 'CASH', 'OTHER'].map((method) => {
            const t = totals.find((t) => t.method === method);
            return {
              method,
              received: decimal(t?.received ?? '0'),
              refunded: decimal(t?.refunded ?? '0'),
              net: decimal(t?.net ?? '0'),
            };
          }),
          items: rows.map((r) => ({ ...r, amount: decimal(r.amount), change: decimal(r.change) })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
