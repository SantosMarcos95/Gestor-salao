import {
  BadRequestException,
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
import { createHash, randomUUID } from 'node:crypto';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { SessionGuard } from '../auth/auth';
import { catalogQuery } from '../catalog/validation';
import { catalogAudit } from '../catalog/shared';
import { decimalString, scaled } from '../inventory/validation';
import {
  change,
  checkVersion,
  command,
  consumeInput,
  lockOrder,
  openOrder,
  orderScope,
  recalculate,
  requirePermission,
  visitAction,
  visitInclude,
  visitQuery,
  visitScope,
  visitView,
} from './rules';

@Controller('visits')
@UseGuards(SessionGuard)
export class VisitsController {
  constructor(private db: Database) {}
  private async view(tx: Prisma.TransactionClient, req: AuthRequest, id: string) {
    const visit = await tx.visit.findFirst({
      where: { id, ...visitScope(req.identity) },
      include: visitInclude,
    });
    if (!visit) throw new NotFoundException('Atendimento não encontrado.');
    return visit;
  }
  private async locked(tx: Prisma.TransactionClient, req: AuthRequest, id: string) {
    const initial = await this.view(tx, req, id);
    const order = await lockOrder(tx, req.identity, initial.orderId, false);
    openOrder(order);
    return this.view(tx, req, id);
  }
  @Get()
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { page, status, search } = parse(visitQuery, query);
    const where = {
      ...visitScope(req.identity),
      ...(status === 'all' ? {} : { status }),
      order: {
        ...(status === 'WAITING' || status === 'IN_PROGRESS' ? { status: 'OPEN' } : {}),
        clientName: { contains: search, mode: 'insensitive' as const },
      },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.visit.findMany({
          where,
          include: visitInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.visit.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map((v) => visitView(v, req.identity)), total, page, pageSize: 20 };
  }
  @Get(':id/products')
  async products(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const v = await this.view(this.db, req, id);
    visitAction(req.identity, v.professional.membershipId, 'consumir');
    const { page, search } = parse(catalogQuery, query),
      where = {
        salonId: req.identity.salonId,
        active: true,
        name: { contains: search, mode: 'insensitive' as const },
      };
    const [items, total] = await this.db.$transaction(
      [
        this.db.product.findMany({
          where,
          select: { id: true, name: true, baseUnit: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.product.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return visitView(await this.view(this.db, req, id), req.identity);
  }
  @Post(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    return this.transition(id, body, req, 'iniciar');
  }
  @Post(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    return this.transition(id, body, req, 'concluir');
  }
  private async transition(
    id: string,
    body: unknown,
    req: AuthRequest,
    action: 'iniciar' | 'concluir',
  ) {
    const input = parse(change, body);
    return this.db.$transaction(async (tx) => {
      const authorized = await this.view(tx, req, id);
      visitAction(req.identity, authorized.professional.membershipId, action);
      await command(tx, req, `visit:${id}:${action}`, input, async () => {
        const before = await this.locked(tx, req, id);
        visitAction(req.identity, before.professional.membershipId, action);
        checkVersion(before.version, input.version);
        if (before.status !== (action === 'iniciar' ? 'WAITING' : 'IN_PROGRESS'))
          throw new ConflictException('O atendimento não está na etapa esperada.');
        const after = await tx.visit.update({
          where: { id },
          data: {
            status: action === 'iniciar' ? 'IN_PROGRESS' : 'COMPLETED',
            ...(action === 'iniciar' ? { startedAt: new Date() } : { completedAt: new Date() }),
            version: { increment: 1 },
          },
          include: visitInclude,
        });
        await tx.salonOrder.update({
          where: { id: before.orderId },
          data: { version: { increment: 1 } },
        });
        if (before.appointmentId) {
          const a = await tx.appointment.findUniqueOrThrow({ where: { id: before.appointmentId } });
          const next = await tx.appointment.update({
            where: { id: a.id },
            data: {
              status: action === 'iniciar' ? 'ARRIVED' : 'COMPLETED',
              version: { increment: 1 },
            },
          });
          await catalogAudit(
            tx,
            req,
            'appointments',
            a.id,
            'AGENDAMENTO_STATUS',
            input.reason,
            next,
            a,
          );
        }
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          before.orderId,
          action === 'iniciar' ? 'ATENDIMENTO_INICIADO' : 'ATENDIMENTO_CONCLUIDO',
          input.reason,
          { visitId: id, status: after.status },
          { visitId: id, status: before.status },
        );
        return id;
      });
      return visitView(await this.view(tx, req, id), req.identity);
    });
  }
  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(change, body);
    requirePermission(req.identity, 'comandas.cancelar');
    return this.db.$transaction(async (tx) => {
      const authorized = await this.view(tx, req, id);
      if (
        !(await tx.salonOrder.findFirst({
          where: { id: authorized.orderId, ...orderScope(req.identity) },
        }))
      )
        throw new NotFoundException('Comanda não encontrada.');
      await command(tx, req, `visit:${id}:cancel`, input, async () => {
        const before = await this.locked(tx, req, id);
        checkVersion(before.version, input.version);
        if (before.status === 'CANCELLED') throw new ConflictException('Atendimento já cancelado.');
        await tx.visit.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } },
        });
        await recalculate(tx, before.orderId, before.salonId);
        if (before.appointmentId) {
          const a = await tx.appointment.findUniqueOrThrow({ where: { id: before.appointmentId } });
          const next = await tx.appointment.update({
            where: { id: a.id },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          });
          await catalogAudit(
            tx,
            req,
            'appointments',
            a.id,
            'AGENDAMENTO_CANCELADO',
            input.reason,
            next,
            a,
          );
        }
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          before.orderId,
          'ATENDIMENTO_CANCELADO',
          input.reason,
          { visitId: id, status: 'CANCELLED', consumptionPreserved: true },
          { visitId: id, status: before.status },
        );
        return id;
      });
      return visitView(await this.view(tx, req, id), req.identity);
    });
  }
  @Post(':id/consumptions')
  async consume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(consumeInput, body);
    return this.db.$transaction(async (tx) => {
      const authorized = await this.view(tx, req, id);
      visitAction(req.identity, authorized.professional.membershipId, 'consumir');
      await command(tx, req, `visit:${id}:consume`, input, async () => {
        const visit = await this.locked(tx, req, id);
        visitAction(req.identity, visit.professional.membershipId, 'consumir');
        checkVersion(visit.version, input.version);
        if (visit.status !== 'IN_PROGRESS')
          throw new ConflictException('Registre consumo durante o atendimento, antes de concluir.');
        if (visit.consumptions.length >= 100)
          throw new BadRequestException('Limite de 100 registros de consumo por atendimento.');
        await tx.$queryRaw`SELECT id FROM products WHERE salon_id=${visit.salonId}::uuid AND id=${input.productId}::uuid FOR UPDATE`;
        const product = await tx.product.findFirst({
          where: { id: input.productId, salonId: visit.salonId, active: true },
        });
        if (!product) throw new NotFoundException('Produto ativo não encontrado.');
        const balance = scaled(product.balance.toFixed(6)),
          amount = scaled(input.quantity);
        if (amount > balance)
          throw new BadRequestException('Saldo insuficiente para confirmar o consumo.');
        const latest = await tx.stockMovement.findFirst({
          where: {
            salonId: visit.salonId,
            productId: product.id,
            kind: 'ENTRY',
            unitCost: { not: null },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { unitCost: true },
        });
        const after = await tx.product.update({
          where: { id: product.id },
          data: { balance: decimalString(balance - amount), version: { increment: 1 } },
        });
        const movement = await tx.stockMovement.create({
          data: {
            salonId: visit.salonId,
            productId: product.id,
            actorId: req.identity.membershipId,
            kind: 'OUT',
            quantity: input.quantity,
            delta: decimalString(-amount),
            balanceBefore: product.balance,
            balanceAfter: after.balance,
            productName: product.name,
            baseUnit: product.baseUnit,
            reason: input.reason,
            requestKey: randomUUID(),
            requestHash: createHash('sha256')
              .update(JSON.stringify({ visitId: id, ...input }))
              .digest('hex'),
          },
        });
        await tx.visitConsumption.create({
          data: {
            salonId: visit.salonId,
            visitId: id,
            movementId: movement.id,
            unitCost: latest?.unitCost ?? null,
          },
        });
        await tx.visit.update({ where: { id }, data: { version: { increment: 1 } } });
        await tx.salonOrder.update({
          where: { id: visit.orderId },
          data: { version: { increment: 1 } },
        });
        await catalogAudit(
          tx,
          req,
          'stock_movements',
          movement.id,
          'CONSUMO_CONFIRMADO',
          input.reason,
          { ...movement, visitId: id, orderId: visit.orderId },
          { balance: product.balance, productId: product.id },
        );
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          visit.orderId,
          'CONSUMO_CONFIRMADO',
          input.reason,
          {
            visitId: id,
            productName: product.name,
            quantity: input.quantity,
            baseUnit: product.baseUnit,
            movementId: movement.id,
          },
        );
        return id;
      });
      return visitView(await this.view(tx, req, id), req.identity);
    });
  }
}
