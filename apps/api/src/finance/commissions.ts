import { Controller, Get, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { SessionGuard } from '../auth/auth';
import { instant, localParts } from '../appointments/rules';
import { dateInput } from '../appointments/validation';
import { cents, money } from '../orders/rules';
import { signedMoney } from './rules';
import { allocate, commissionAmount, signedCents } from './commission-math';

export async function isAdministrator(tx: Prisma.TransactionClient, req: AuthRequest) {
  return !!(await tx.userRole.findFirst({
    where: {
      salonId: req.identity.salonId,
      membershipId: req.identity.membershipId,
      role: { code: 'ROLE_ADMIN', protected: true },
    },
  }));
}
export async function requireAdministrator(tx: Prisma.TransactionClient, req: AuthRequest) {
  if (!(await isAdministrator(tx, req)))
    throw new ForbiddenException('Somente o administrador pode configurar comissões.');
}
export async function snapshotCommissions(
  tx: Prisma.TransactionClient,
  salonId: string,
  orderId: string,
) {
  const items = await tx.visitItem.findMany({
    where: { salonId, visit: { orderId, status: 'COMPLETED' } },
    include: { visit: { include: { professional: true } } },
    orderBy: { id: 'asc' },
  });
  if (!items.length) return; // Existing historical sales are never backfilled with current rates.
  const order = await tx.salonOrder.findUniqueOrThrow({ where: { id: orderId } });
  const amounts = allocate(
    cents(order.total.toFixed(2)),
    items.map((i) => cents(i.price.toFixed(2))),
  );
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await tx.commissionBasis.create({
      data: {
        salonId,
        orderId,
        itemId: item.id,
        professionalId: item.visit.professionalId,
        professionalName: item.visit.professionalName,
        serviceName: item.name,
        rate: item.visit.professional.commissionRate,
        base: money(amounts[i]),
      },
    });
  }
}
// Caller holds order lock. Recompute cumulative targets, append only the delta.
// Refund + repayment therefore restores exactly the original commission, without rounding drift.
export async function syncCommissions(
  tx: Prisma.TransactionClient,
  salonId: string,
  orderId: string,
  eventId: string,
) {
  const bases = await tx.commissionBasis.findMany({
    where: { salonId, orderId },
    orderBy: { itemId: 'asc' },
  });
  if (!bases.length) return;
  const payments = await tx.payment.findMany({
    where: { salonId, orderId },
    include: { refunds: true },
  });
  const net = payments.reduce(
    (s, p) =>
      s +
      cents(p.amount.toFixed(2)) -
      p.refunds.reduce((n, r) => n + cents(r.amount.toFixed(2)), 0n),
    0n,
  );
  const allocated = allocate(
    net,
    bases.map((b) => cents(b.base.toFixed(2))),
  );
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i],
      previous = await tx.commissionEntry.aggregate({
        where: { salonId, basisId: b.id },
        _sum: { base: true, amount: true },
      });
    const base = allocated[i] - signedCents(previous._sum.base?.toFixed(2) ?? '0');
    const amount =
      commissionAmount(allocated[i], cents(b.rate.toFixed(2))) -
      signedCents(previous._sum.amount?.toFixed(2) ?? '0');
    if (base !== 0n || amount !== 0n)
      await tx.commissionEntry.create({
        data: {
          salonId,
          basisId: b.id,
          eventId,
          base: signedMoney(base),
          amount: signedMoney(amount),
        },
      });
  }
}
const querySchema = z
  .object({
    from: dateInput,
    to: dateInput,
    page: z.coerce.number().int().min(1).max(100000).default(1),
    professionalId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    'Selecione até 366 dias.',
  );
@Controller('commissions')
@UseGuards(SessionGuard)
export class CommissionsController {
  constructor(private db: Database) {}
  @Get('context') async context(@Req() req: AuthRequest) {
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: req.identity.salonId } });
    const all = await isAdministrator(this.db, req);
    const professionals = await this.db.professional.findMany({
      where: { salonId: salon.id, ...(all ? {} : { membershipId: req.identity.membershipId }) },
      select: { id: true, name: true, commissionRate: true },
      orderBy: { name: 'asc' },
    });
    return {
      today: localParts(new Date(), salon.timezone).date,
      timezone: salon.timezone,
      all,
      professionals,
    };
  }
  @Get() async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const input = parse(querySchema, query),
      salonId = req.identity.salonId;
    return this.db.$transaction(
      async (tx) => {
        const all = await isAdministrator(tx, req);
        const salon = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
        const next = new Date(Date.parse(input.to + 'T12:00:00Z') + 86400000)
          .toISOString()
          .slice(0, 10);
        const start = instant(input.from + 'T00:00', salon.timezone),
          end = instant(next + 'T00:00', salon.timezone);
        const scope = all
          ? Prisma.empty
          : Prisma.sql`AND p.membership_id=${req.identity.membershipId}::uuid`;
        const selected = input.professionalId
          ? Prisma.sql`AND b.professional_id=${input.professionalId}::uuid`
          : Prisma.empty;
        const filter = Prisma.sql`FROM commission_entries e JOIN commission_bases b ON b.id=e.basis_id AND b.salon_id=e.salon_id
       JOIN professionals p ON p.id=b.professional_id AND p.salon_id=b.salon_id
       WHERE e.salon_id=${salonId}::uuid AND e.created_at>=${start} AND e.created_at<${end} ${scope} ${selected}`;
        const totals = await tx.$queryRaw<{ total: bigint; base: string; amount: string }[]>(
          Prisma.sql`SELECT count(*) AS total,coalesce(sum(e.base),0)::text AS base,coalesce(sum(e.amount),0)::text AS amount ${filter}`,
        );
        const items = await tx.$queryRaw(
          Prisma.sql`SELECT e.id,e.created_at AS "createdAt",b.professional_name AS "professionalName",b.service_name AS "serviceName",b.rate::text,e.base::text,e.amount::text ${filter} ORDER BY e.created_at DESC,e.id DESC LIMIT 20 OFFSET ${(input.page - 1) * 20}`,
        );
        return {
          items,
          total: Number(totals[0].total),
          page: input.page,
          pageSize: 20,
          base: totals[0].base,
          commission: totals[0].amount,
          salon: signedMoney(signedCents(totals[0].base) - signedCents(totals[0].amount)),
          timezone: salon.timezone,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
