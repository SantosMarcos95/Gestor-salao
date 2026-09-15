import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AuthRequest, Identity } from '../common';
import { catalogQuery, serviceInput } from '../catalog/validation';
import { decimal, scaled } from '../inventory/validation';

export const reason = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => v ?? '');
export const commandFields = { requestKey: z.string().uuid(), reason };
export const change = z.object({ ...commandFields, version: z.number().int().positive() }).strict();
export const orderInput = z
  .object({
    ...commandFields,
    clientId: z.string().uuid(),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();
export const orderQuery = catalogQuery
  .pick({ search: true, page: true })
  .extend({
    status: z.enum(['OPEN', 'READY', 'CLOSED', 'DUE', 'CANCELLED', 'all']).default('OPEN'),
    clientId: z.string().uuid().optional(),
  })
  .strict();
export const visitQuery = catalogQuery
  .pick({ search: true, page: true })
  .extend({
    status: z
      .enum(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'all'])
      .default('IN_PROGRESS'),
  })
  .strict();
export const visitInput = change
  .extend({
    professionalId: z.string().uuid(),
    serviceIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export const importInput = change
  .extend({ appointmentId: z.string().uuid(), appointmentVersion: z.number().int().positive() })
  .strict();
export const pricesInput = change
  .extend({
    prices: z
      .array(z.object({ id: z.string().uuid(), price: serviceInput.shape.price }).strict())
      .min(1)
      .max(20)
      .refine((v) => new Set(v.map((i) => i.id)).size === v.length),
  })
  .strict();
export const discountInput = change.extend({ discount: serviceInput.shape.price }).strict();
export const consumeInput = change
  .extend({
    productId: z.string().uuid(),
    quantity: decimal.refine((v) => scaled(v) > 0n),
    confirmed: z.literal(true),
  })
  .strict();
export const cents = (value: string) => {
  const [whole, part = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
};
export const money = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function totals(prices: string[], discount: string) {
  const subtotal = prices.reduce((n, p) => n + cents(p), 0n),
    off = cents(discount);
  if (subtotal > 99999999999999n)
    throw new BadRequestException('O total ultrapassa o limite permitido.');
  if (off > subtotal)
    throw new BadRequestException(
      'O desconto não pode ultrapassar o valor dos serviços. Reduza o desconto antes de retirar serviços.',
    );
  return { subtotal: money(subtotal), discount: money(off), total: money(subtotal - off) };
}
export function requirePermission(identity: Identity, code: string) {
  if (!identity.permissions.includes(code))
    throw new ForbiddenException('Você não tem permissão para esta ação.');
}
export function orderScope(identity: Identity): Prisma.SalonOrderWhereInput {
  if (identity.permissions.includes('comandas.visualizar_todas'))
    return { salonId: identity.salonId };
  requirePermission(identity, 'comandas.visualizar_proprias');
  return { salonId: identity.salonId, createdBy: identity.membershipId };
}
export function visitScope(identity: Identity): Prisma.VisitWhereInput {
  const permissions = identity.permissions;
  if (
    permissions.includes('comandas.visualizar_todas') ||
    permissions.includes('atendimentos.iniciar_qualquer') ||
    permissions.includes('atendimentos.concluir_qualquer')
  )
    return { salonId: identity.salonId };
  const own = permissions.some((p) =>
    [
      'atendimentos.iniciar_proprio',
      'atendimentos.concluir_proprio',
      'atendimentos.registrar_consumo',
    ].includes(p),
  );
  const orders = permissions.includes('comandas.visualizar_proprias');
  if (!own && !orders) throw new ForbiddenException('Você não tem acesso aos atendimentos.');
  return {
    salonId: identity.salonId,
    OR: [
      ...(own ? [{ professional: { membershipId: identity.membershipId } }] : []),
      ...(orders ? [{ order: { createdBy: identity.membershipId } }] : []),
    ],
  };
}
export function visitAction(
  identity: Identity,
  membershipId: string | null,
  action: 'iniciar' | 'concluir' | 'consumir',
) {
  if (action === 'consumir') {
    requirePermission(identity, 'atendimentos.registrar_consumo');
    if (
      membershipId === identity.membershipId ||
      identity.permissions.includes('atendimentos.iniciar_qualquer') ||
      identity.permissions.includes('atendimentos.concluir_qualquer')
    )
      return;
  } else if (
    identity.permissions.includes(`atendimentos.${action}_qualquer`) ||
    (membershipId === identity.membershipId &&
      identity.permissions.includes(`atendimentos.${action}_proprio`))
  )
    return;
  throw new ForbiddenException('Você não tem permissão para atuar neste atendimento.');
}
export async function lockOrder(
  tx: Prisma.TransactionClient,
  identity: Identity,
  id: string,
  authorize = true,
) {
  if (authorize && !(await tx.salonOrder.findFirst({ where: { id, ...orderScope(identity) } })))
    throw new NotFoundException('Comanda não encontrada.');
  await tx.$queryRaw`SELECT id FROM salon_orders WHERE salon_id=${identity.salonId}::uuid AND id=${id}::uuid FOR UPDATE`;
  const order = await tx.salonOrder.findFirst({ where: { id, salonId: identity.salonId } });
  if (!order) throw new NotFoundException('Comanda não encontrada.');
  return order;
}
export function openOrder(order: { status: string }) {
  if (order.status !== 'OPEN')
    throw new ConflictException('A comanda não está aberta para alterações.');
}
export function checkVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new ConflictException('Este registro mudou. Atualize os detalhes antes de continuar.');
}
export async function command(
  tx: Prisma.TransactionClient,
  req: AuthRequest,
  action: string,
  input: { requestKey: string },
  run: () => Promise<string>,
) {
  const { salonId, membershipId } = req.identity;
  const hash = createHash('sha256')
    .update(JSON.stringify({ action, actor: membershipId, input }))
    .digest('hex');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'order-command:' + salonId + input.requestKey},0))::text`;
  const prior = await tx.orderCommand.findUnique({
    where: { salonId_requestKey: { salonId, requestKey: input.requestKey } },
  });
  if (prior) {
    if (prior.hash !== hash)
      throw new ConflictException('Este envio já foi utilizado com outros dados.');
    return prior.targetId;
  }
  const targetId = await run();
  await tx.orderCommand.create({
    data: { salonId, actorId: membershipId, requestKey: input.requestKey, hash, targetId },
  });
  return targetId;
}
export const visitInclude = {
  items: { orderBy: { position: 'asc' as const } },
  professional: { select: { membershipId: true } },
  order: { select: { id: true, clientName: true, status: true } },
  consumptions: { orderBy: { createdAt: 'asc' as const }, include: { movement: true } },
};
export type FullVisit = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;
export function visitView(v: FullVisit, identity: Identity) {
  return {
    ...v,
    items: v.items.map((i) => ({ ...i, price: i.price.toFixed(2) })),
    total: money(v.items.reduce((n, i) => n + cents(i.price.toFixed(2)), 0n)),
    consumptions: v.consumptions.map((c) => ({
      id: c.id,
      productName: c.movement.productName,
      baseUnit: c.movement.baseUnit,
      quantity: c.movement.quantity.toFixed(6),
      createdAt: c.createdAt,
      unitCost: identity.permissions.includes('produtos.visualizar_custo')
        ? (c.unitCost?.toFixed(6) ?? null)
        : undefined,
    })),
  };
}
export async function recalculate(
  tx: Prisma.TransactionClient,
  id: string,
  salonId: string,
  discount?: string,
) {
  const order = await tx.salonOrder.findFirstOrThrow({
    where: { id, salonId },
    include: { visits: { where: { status: { not: 'CANCELLED' } }, include: { items: true } } },
  });
  const amounts = totals(
    order.visits.flatMap((v) => v.items.map((i) => i.price.toFixed(2))),
    discount ?? order.discount.toFixed(2),
  );
  return tx.salonOrder.update({ where: { id }, data: { ...amounts, version: { increment: 1 } } });
}
