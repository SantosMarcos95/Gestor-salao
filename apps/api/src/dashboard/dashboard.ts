import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { SessionGuard } from '../auth/auth';
import { instant, localParts, scope } from '../appointments/rules';
import { financeQuery } from '../finance/rules';

@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private db: Database) {}

  @Get('context')
  async context(@Req() req: AuthRequest) {
    const { timezone } = await this.db.salon.findUniqueOrThrow({
      where: { id: req.identity.salonId },
      select: { timezone: true },
    });
    return { timezone, today: localParts(new Date(), timezone).date };
  }

  @Get()
  async summary(@Query() query: unknown, @Req() req: AuthRequest) {
    const { from, to } = parse(financeQuery, query);
    const { salonId, permissions, membershipId } = req.identity;
    const can = (p: string) => permissions.includes(p);
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const next = new Date(Date.parse(to + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
        const startsAt = {
          gte: instant(from + 'T00:00', timezone),
          lt: instant(next + 'T00:00', timezone),
        };
        const agenda =
          can('agenda.visualizar_todas') || can('agenda.visualizar_propria')
            ? await tx.appointment.groupBy({
                by: ['status'],
                where: { salonId, startsAt, professional: scope(req.identity, 'visualizar') },
                _count: true,
              })
            : null;
        const orders =
          can('comandas.visualizar_todas') || can('comandas.visualizar_proprias')
            ? await tx.salonOrder.groupBy({
                by: ['status'],
                where: {
                  salonId,
                  ...(can('comandas.visualizar_todas') ? {} : { createdBy: membershipId }),
                  status: { in: ['OPEN', 'READY', 'DUE'] },
                },
                _count: true,
              })
            : null;
        const stock =
          can('produtos.visualizar') && can('estoque.visualizar')
            ? await tx.product.count({
                where: { salonId, active: true, balance: { lte: tx.product.fields.minimum } },
              })
            : null;
        const clients = can('clientes.visualizar_todos')
          ? await tx.client.count({ where: { salonId, deletedAt: null } })
          : null;
        return {
          timezone,
          from,
          to,
          clients,
          stock,
          agenda: agenda?.map((r) => ({ status: r.status, count: r._count })) ?? null,
          orders: orders?.map((r) => ({ status: r.status, count: r._count })) ?? null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
