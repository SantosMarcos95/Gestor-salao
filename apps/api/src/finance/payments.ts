import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { AuthRequest } from '../common';
import { parse } from '../common';
import { SessionGuard } from '../auth/auth';
import { catalogAudit } from '../catalog/shared';
import {
  cents,
  change,
  checkVersion,
  command,
  lockOrder,
  money,
  orderScope,
  requirePermission,
} from '../orders/rules';
import { checkoutInput, preparePayments, refundInput, voidInput } from './rules';

export const saleInclude = {
  payments: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { refunds: { orderBy: { createdAt: 'asc' as const } } },
  },
  void: true,
};
export type Sale = Prisma.OrderSaleGetPayload<{ include: typeof saleInclude }>;
export function saleAmounts(sale: Sale) {
  const paid = sale.payments.reduce((n, p) => n + cents(p.amount.toFixed(2)), 0n),
    refunded = sale.payments
      .flatMap((p) => p.refunds)
      .reduce((n, r) => n + cents(r.amount.toFixed(2)), 0n);
  return {
    paid,
    refunded,
    net: paid - refunded,
    due: sale.void ? 0n : cents(sale.total.toFixed(2)) - paid + refunded,
  };
}
export function saleView(sale: Sale) {
  const sum = saleAmounts(sale);
  return {
    ...sale,
    total: sale.total.toFixed(2),
    paid: money(sum.paid),
    refunded: money(sum.refunded),
    netReceived: money(sum.net),
    due: money(sum.due),
    void: sale.void ? { ...sale.void, total: sale.void.total.toFixed(2) } : null,
    payments: sale.payments.map((p) => ({
      ...p,
      amount: p.amount.toFixed(2),
      tendered: p.tendered.toFixed(2),
      change: p.change.toFixed(2),
      remaining: money(
        cents(p.amount.toFixed(2)) - p.refunds.reduce((n, r) => n + cents(r.amount.toFixed(2)), 0n),
      ),
      refunds: p.refunds.map((r) => ({ ...r, amount: r.amount.toFixed(2) })),
    })),
  };
}
@Controller('payments')
@UseGuards(SessionGuard)
export class PaymentsController {
  constructor(private db: Database) {}
  private async authorize(tx: Prisma.TransactionClient, req: AuthRequest, id: string) {
    const where = req.identity.permissions.includes('financeiro.visualizar')
      ? { salonId: req.identity.salonId }
      : orderScope(req.identity);
    const order = await tx.salonOrder.findFirst({ where: { id, ...where } });
    if (!order) throw new NotFoundException('Comanda não encontrada.');
    return order;
  }
  private async view(tx: Prisma.TransactionClient, req: AuthRequest, id: string) {
    const order = await this.authorize(tx, req, id);
    const sale = await tx.orderSale.findUnique({
      where: { salonId_orderId: { salonId: order.salonId, orderId: id } },
      include: saleInclude,
    });
    return {
      order: {
        id: order.id,
        clientName: order.clientName,
        status: order.status,
        version: order.version,
        total: order.total.toFixed(2),
      },
      sale: sale ? saleView(sale) : null,
    };
  }
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.db.$transaction((tx) => this.view(tx, req, id), {
      isolationLevel: 'RepeatableRead',
    });
  }
  @Post(':id/checkout')
  checkout(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(checkoutInput, body);
    requirePermission(req.identity, 'pagamentos.registrar');
    requirePermission(req.identity, 'comandas.fechar');
    return this.db.$transaction(async (tx) => {
      await this.authorize(tx, req, id);
      await command(tx, req, `finance:${id}:checkout`, input, async () => {
        const order = await lockOrder(tx, req.identity, id, false);
        checkVersion(order.version, input.version);
        if (!['READY', 'DUE'].includes(order.status))
          throw new ConflictException(
            'Finalize os serviços ou selecione uma comanda com saldo pendente.',
          );
        let sale = await tx.orderSale.findUnique({
          where: { salonId_orderId: { salonId: order.salonId, orderId: id } },
          include: saleInclude,
        });
        const due = sale ? saleAmounts(sale).due : cents(order.total.toFixed(2));
        if (sale?.void) throw new ConflictException('A venda foi cancelada.');
        if (sale && sale.payments.length + input.payments.length > 200)
          throw new BadRequestException('Limite de registros desta comanda atingido.');
        if (sale && due === 0n) throw new ConflictException('A comanda já está quitada.');
        const payments = preparePayments(input.payments, due);
        if (!sale) {
          sale = await tx.orderSale.create({
            data: {
              salonId: order.salonId,
              orderId: id,
              actorId: req.identity.membershipId,
              total: order.total,
            },
            include: saleInclude,
          });
          await catalogAudit(tx, req, 'salon_orders', id, 'VENDA_REGISTRADA', input.reason, {
            saleId: sale.id,
            total: order.total,
          });
        }
        for (const line of payments) {
          const payment = await tx.payment.create({
            data: {
              ...line,
              salonId: order.salonId,
              orderId: id,
              actorId: req.identity.membershipId,
              reason: input.reason,
            },
          });
          await catalogAudit(
            tx,
            req,
            'salon_orders',
            id,
            'PAGAMENTO_REGISTRADO',
            input.reason,
            payment,
          );
        }
        const after = await tx.salonOrder.update({
          where: { id },
          data: { status: 'CLOSED', version: { increment: 1 } },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'COMANDA_QUITADA',
          input.reason,
          after,
          order,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/refund')
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(refundInput, body);
    requirePermission(req.identity, 'pagamentos.estornar');
    return this.db.$transaction(async (tx) => {
      await this.authorize(tx, req, id);
      await command(tx, req, `finance:${id}:refund`, input, async () => {
        const order = await lockOrder(tx, req.identity, id, false);
        checkVersion(order.version, input.version);
        if (!['CLOSED', 'DUE'].includes(order.status))
          throw new ConflictException('Esta comanda não permite estorno de recebimento.');
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, salonId: order.salonId, orderId: id },
          include: { refunds: true },
        });
        if (!payment) throw new NotFoundException('Pagamento da comanda não encontrado.');
        if (payment.refunds.length >= 100)
          throw new BadRequestException('Limite de estornos deste pagamento atingido.');
        const remaining =
          cents(payment.amount.toFixed(2)) -
          payment.refunds.reduce((n, r) => n + cents(r.amount.toFixed(2)), 0n);
        if (cents(input.amount) > remaining)
          throw new BadRequestException(
            'O estorno ultrapassa o valor ainda disponível neste pagamento.',
          );
        const refund = await tx.paymentRefund.create({
          data: {
            salonId: order.salonId,
            paymentId: payment.id,
            actorId: req.identity.membershipId,
            amount: input.amount,
            reference: input.reference,
            reason: input.reason,
          },
        });
        await tx.salonOrder.update({
          where: { id },
          data: { status: 'DUE', version: { increment: 1 } },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'PAGAMENTO_ESTORNADO',
          input.reason,
          refund,
          { paymentId: payment.id, available: money(remaining) },
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/void')
  voidSale(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(voidInput, body);
    for (const code of ['comandas.cancelar', 'comandas.corrigir_fechada', 'pagamentos.estornar'])
      requirePermission(req.identity, code);
    return this.db.$transaction(async (tx) => {
      await this.authorize(tx, req, id);
      await command(tx, req, `finance:${id}:void`, input, async () => {
        const order = await lockOrder(tx, req.identity, id, false);
        checkVersion(order.version, input.version);
        if (!['CLOSED', 'DUE'].includes(order.status))
          throw new ConflictException('A comanda não possui venda ativa para cancelar.');
        const sale = await tx.orderSale.findUniqueOrThrow({
          where: { salonId_orderId: { salonId: order.salonId, orderId: id } },
          include: saleInclude,
        });
        if (sale.void) throw new ConflictException('A venda já foi cancelada.');
        for (const p of sale.payments) {
          const remaining =
            cents(p.amount.toFixed(2)) -
            p.refunds.reduce((n, r) => n + cents(r.amount.toFixed(2)), 0n);
          if (remaining > 0n) {
            const refund = await tx.paymentRefund.create({
              data: {
                salonId: order.salonId,
                paymentId: p.id,
                actorId: req.identity.membershipId,
                amount: money(remaining),
                reason: input.reason,
              },
            });
            await catalogAudit(
              tx,
              req,
              'salon_orders',
              id,
              'PAGAMENTO_ESTORNADO',
              input.reason,
              refund,
            );
          }
        }
        const cancelled = await tx.saleVoid.create({
          data: {
            salonId: order.salonId,
            orderId: id,
            actorId: req.identity.membershipId,
            total: sale.total,
            reason: input.reason,
          },
        });
        await tx.salonOrder.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'VENDA_CANCELADA',
          input.reason,
          cancelled,
          { saleId: sale.id, total: sale.total },
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
}
