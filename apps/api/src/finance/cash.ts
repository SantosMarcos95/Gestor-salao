import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { cents, money, command, commandFields } from '../orders/rules';
import { catalogAudit } from '../catalog/shared';
import { serviceInput } from '../catalog/validation';
import { signedMoney } from './rules';

const fields = { ...commandFields, confirmed: z.literal(true) };
const openInput = z.object({ ...fields, opening: serviceInput.shape.price }).strict();
const withdrawalInput = z
  .object({
    ...fields,
    amount: serviceInput.shape.price.refine((v) => cents(v) > 0n),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const closeInput = z
  .object({
    ...fields,
    counted: serviceInput.shape.price,
    expected: z.string().regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/),
  })
  .strict();
const paging = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export async function lockCash(tx: Prisma.TransactionClient, salonId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'cash:' + salonId},0))::text`;
}
async function balance(
  tx: Prisma.TransactionClient,
  salonId: string,
  sessionId: string,
  opening: string,
) {
  const sums = await tx.cashMovement.groupBy({
    by: ['kind'],
    where: { salonId, sessionId },
    _sum: { amount: true },
  });
  let expected = cents(opening);
  const amounts: Record<string, string> = { PAYMENT: '0.00', REFUND: '0.00', WITHDRAWAL: '0.00' };
  for (const row of sums) {
    const value = row._sum.amount?.toFixed(2) ?? '0.00';
    amounts[row.kind] = value;
    expected += (row.kind === 'PAYMENT' ? 1n : -1n) * cents(value);
  }
  return {
    expected: signedMoney(expected),
    received: amounts.PAYMENT,
    refunded: amounts.REFUND,
    withdrawn: amounts.WITHDRAWAL,
  };
}
// Until the first opening, existing salons can continue their previous workflow.
// Once enabled, a closed register rejects cash operations transactionally.
export async function recordCash(
  tx: Prisma.TransactionClient,
  req: AuthRequest,
  kind: 'PAYMENT' | 'REFUND',
  amount: string,
  sourceId: string,
) {
  const salonId = req.identity.salonId;
  await lockCash(tx, salonId);
  const session = await tx.cashSession.findFirst({ where: { salonId, closedAt: null } });
  if (!session) {
    if (await tx.cashSession.count({ where: { salonId } }))
      throw new ConflictException(
        'Abra o caixa antes de registrar recebimentos ou estornos em dinheiro.',
      );
    return;
  }
  const movement = await tx.cashMovement.create({
    data: {
      salonId,
      sessionId: session.id,
      actorId: req.identity.membershipId,
      kind,
      amount,
      sourceId,
      reason:
        kind === 'PAYMENT' ? 'Recebimento em dinheiro (troco descontado)' : 'Estorno em dinheiro',
    },
  });
  await catalogAudit(
    tx,
    req,
    'cash_sessions',
    session.id,
    'CAIXA_MOVIMENTO',
    movement.reason,
    movement,
  );
}
@Controller('cash')
@UseGuards(SessionGuard)
@Require('caixa.gerenciar')
export class CashController {
  constructor(private db: Database) {}
  @Get() async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { page } = parse(paging, query),
      salonId = req.identity.salonId;
    return this.db.$transaction(
      async (tx) => {
        const [items, total, current] = await Promise.all([
          tx.cashSession.findMany({
            where: { salonId },
            orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * 20,
            take: 20,
          }),
          tx.cashSession.count({ where: { salonId } }),
          tx.cashSession.findFirst({ where: { salonId, closedAt: null } }),
        ]);
        return {
          items,
          total,
          page,
          pageSize: 20,
          current: current
            ? {
                ...current,
                ...(await balance(tx, salonId, current.id, current.opening.toFixed(2))),
              }
            : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Get(':id') async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const { page } = parse(paging, query),
      salonId = req.identity.salonId;
    return this.db.$transaction(
      async (tx) => {
        const session = await tx.cashSession.findFirst({ where: { salonId, id } });
        if (!session) throw new NotFoundException('Caixa não encontrado.');
        const [items, total, actors] = await Promise.all([
          tx.cashMovement.findMany({
            where: { salonId, sessionId: id },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 20,
            skip: (page - 1) * 20,
          }),
          tx.cashMovement.count({ where: { salonId, sessionId: id } }),
          tx.salonUser.findMany({
            where: { salonId },
            select: { id: true, user: { select: { name: true } } },
          }),
        ]);
        const names = new Map(actors.map((a) => [a.id, a.user.name]));
        return {
          session: {
            ...session,
            openedByName: names.get(session.openedBy),
            closedByName: session.closedBy ? names.get(session.closedBy) : null,
          },
          ...(await balance(tx, salonId, id, session.opening.toFixed(2))),
          items: items.map((m) => ({ ...m, actorName: names.get(m.actorId) })),
          total,
          page,
          pageSize: 20,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Post('open') open(@Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(openInput, body),
      salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      const id = await command(tx, req, 'cash:open', input, async () => {
        await lockCash(tx, salonId);
        if (await tx.cashSession.findFirst({ where: { salonId, closedAt: null } }))
          throw new ConflictException('Já existe um caixa aberto neste salão.');
        const session = await tx.cashSession.create({
          data: { salonId, openedBy: req.identity.membershipId, opening: input.opening },
        });
        await catalogAudit(
          tx,
          req,
          'cash_sessions',
          session.id,
          'CAIXA_ABERTO',
          input.reason,
          session,
        );
        return session.id;
      });
      return { id };
    });
  }
  @Post(':id/withdraw') withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(withdrawalInput, body),
      salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `cash:${id}:withdraw`, input, async () => {
        await lockCash(tx, salonId);
        const session = await tx.cashSession.findFirst({ where: { id, salonId, closedAt: null } });
        if (!session) throw new ConflictException('Caixa fechado ou não encontrado.');
        const current = await balance(tx, salonId, id, session.opening.toFixed(2));
        if (new Prisma.Decimal(input.amount).greaterThan(current.expected))
          throw new ConflictException('A sangria ultrapassa o saldo esperado do caixa.');
        const movement = await tx.cashMovement.create({
          data: {
            salonId,
            sessionId: id,
            actorId: req.identity.membershipId,
            kind: 'WITHDRAWAL',
            amount: input.amount,
            reason: input.reason,
          },
        });
        await catalogAudit(tx, req, 'cash_sessions', id, 'CAIXA_SANGRIA', input.reason, movement);
        return id;
      });
      return { id };
    });
  }
  @Post(':id/close') close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(closeInput, body),
      salonId = req.identity.salonId;
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `cash:${id}:close`, input, async () => {
        await lockCash(tx, salonId);
        const session = await tx.cashSession.findFirst({ where: { id, salonId, closedAt: null } });
        if (!session) throw new ConflictException('Caixa fechado ou não encontrado.');
        const current = await balance(tx, salonId, id, session.opening.toFixed(2));
        const difference = new Prisma.Decimal(input.counted).minus(current.expected).toFixed(2);
        if (!new Prisma.Decimal(input.expected).equals(current.expected))
          throw new ConflictException(
            'O saldo mudou. Atualize o caixa e confira a contagem antes de fechar.',
          );
        if (difference !== '0.00' && input.reason.trim().length < 3)
          throw new ConflictException('Informe o motivo da diferença de caixa.');
        const after = await tx.cashSession.update({
          where: { id },
          data: {
            closedAt: new Date(),
            closedBy: req.identity.membershipId,
            counted: input.counted,
            expected: current.expected,
            difference,
            closingReason: input.reason,
          },
        });
        await catalogAudit(
          tx,
          req,
          'cash_sessions',
          id,
          'CAIXA_FECHADO',
          input.reason,
          after,
          session,
        );
        return id;
      });
      return { id };
    });
  }
}
