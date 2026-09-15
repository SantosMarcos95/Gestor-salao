import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { instant, localParts } from '../appointments/rules';
import { cents, money } from '../orders/rules';
import { financeQuery, signedMoney } from './rules';
import { saleAmounts, saleInclude } from './payments';
@Controller('finance')
@UseGuards(SessionGuard)
@Require('financeiro.visualizar')
export class FinanceController {
  constructor(private db: Database) {}
  @Get('context')
  async context(@Req() req: AuthRequest) {
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: req.identity.salonId } });
    return { timezone: salon.timezone, today: localParts(new Date(), salon.timezone).date };
  }
  private async range(query: unknown, req: AuthRequest) {
    const input = parse(financeQuery, query),
      salonId = req.identity.salonId;
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: salonId } });
    const next = new Date(Date.parse(input.to + 'T12:00:00Z') + 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      ...input,
      salonId,
      timezone: salon.timezone,
      where: {
        salonId,
        createdAt: {
          gte: instant(input.from + 'T00:00', salon.timezone),
          lt: instant(next + 'T00:00', salon.timezone),
        },
      },
    };
  }
  @Get('summary')
  async summary(@Query() query: unknown, @Req() req: AuthRequest) {
    const { where, salonId, timezone } = await this.range(query, req);
    return this.db.$transaction(
      async (tx) => {
        const [sales, voids, payments, refunds, methods, due] = await Promise.all([
          tx.orderSale.aggregate({ where, _sum: { total: true }, _count: true }),
          tx.saleVoid.aggregate({ where, _sum: { total: true }, _count: true }),
          tx.payment.aggregate({ where, _sum: { amount: true, change: true } }),
          tx.paymentRefund.aggregate({ where, _sum: { amount: true } }),
          tx.payment.groupBy({ by: ['method'], where, _sum: { amount: true } }),
          tx.$queryRaw<
            { amount: string; count: bigint }[]
          >`SELECT COALESCE(SUM(s.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.salon_id=s.salon_id AND p.order_id=s.order_id),0) + COALESCE((SELECT SUM(r.amount) FROM payment_refunds r JOIN payments p ON p.id=r.payment_id AND p.salon_id=r.salon_id WHERE p.salon_id=s.salon_id AND p.order_id=s.order_id),0)),0)::text AS amount,COUNT(*)::bigint AS count FROM order_sales s JOIN salon_orders o ON o.id=s.order_id AND o.salon_id=s.salon_id WHERE s.salon_id=${salonId}::uuid AND o.status='DUE'`,
        ]);
        const gross = cents(sales._sum.total?.toFixed(2) ?? '0'),
          cancelled = cents(voids._sum.total?.toFixed(2) ?? '0'),
          received = cents(payments._sum.amount?.toFixed(2) ?? '0'),
          returned = cents(refunds._sum.amount?.toFixed(2) ?? '0');
        return {
          timezone,
          salesCount: sales._count,
          voidCount: voids._count,
          sales: money(gross),
          voided: money(cancelled),
          netSales: signedMoney(gross - cancelled),
          received: money(received),
          refunded: money(returned),
          netReceived: signedMoney(received - returned),
          change: payments._sum.change?.toFixed(2) ?? '0.00',
          outstanding: due[0].amount,
          outstandingCount: Number(due[0].count),
          byMethod: methods.map((m) => ({
            method: m.method,
            amount: m._sum.amount?.toFixed(2) ?? '0.00',
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Get()
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { where, kind, page, salonId } = await this.range(query, req),
      paging = {
        skip: (page - 1) * 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      };
    return this.db.$transaction(
      async (tx) => {
        if (kind === 'sales' || kind === 'due') {
          const filter = kind === 'due' ? { salonId, order: { status: 'DUE' } } : where;
          const [rows, total] = await Promise.all([
            tx.orderSale.findMany({
              where: filter,
              ...paging,
              include: { ...saleInclude, order: { select: { clientName: true, status: true } } },
            }),
            tx.orderSale.count({ where: filter }),
          ]);
          return {
            items: rows.map((s) => ({
              id: s.id,
              orderId: s.orderId,
              clientName: s.order.clientName,
              createdAt: s.createdAt,
              amount: kind === 'due' ? money(saleAmounts(s).due) : s.total.toFixed(2),
              status: s.order.status,
              paymentMethods: [...new Set(s.payments.map((p) => p.method))],
            })),
            total,
            page,
            pageSize: 20,
          };
        }
        if (kind === 'payments') {
          const [rows, total] = await Promise.all([
            tx.payment.findMany({
              where,
              ...paging,
              include: { sale: { include: { order: { select: { clientName: true } } } } },
            }),
            tx.payment.count({ where }),
          ]);
          return {
            items: rows.map((p) => ({
              id: p.id,
              orderId: p.orderId,
              clientName: p.sale.order.clientName,
              createdAt: p.createdAt,
              amount: p.amount.toFixed(2),
              method: p.method,
              change: p.change.toFixed(2),
            })),
            total,
            page,
            pageSize: 20,
          };
        }
        if (kind === 'refunds') {
          const [rows, total] = await Promise.all([
            tx.paymentRefund.findMany({
              where,
              ...paging,
              include: {
                payment: {
                  include: { sale: { include: { order: { select: { clientName: true } } } } },
                },
              },
            }),
            tx.paymentRefund.count({ where }),
          ]);
          return {
            items: rows.map((r) => ({
              id: r.id,
              orderId: r.payment.orderId,
              clientName: r.payment.sale.order.clientName,
              createdAt: r.createdAt,
              amount: r.amount.toFixed(2),
              method: r.payment.method,
            })),
            total,
            page,
            pageSize: 20,
          };
        }
        const [rows, total] = await Promise.all([
          tx.saleVoid.findMany({
            where,
            ...paging,
            include: { sale: { include: { order: { select: { clientName: true } } } } },
          }),
          tx.saleVoid.count({ where }),
        ]);
        return {
          items: rows.map((v) => ({
            id: v.id,
            orderId: v.orderId,
            clientName: v.sale.order.clientName,
            createdAt: v.createdAt,
            amount: v.total.toFixed(2),
          })),
          total,
          page,
          pageSize: 20,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
