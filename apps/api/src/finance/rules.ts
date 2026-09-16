import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { change, cents, money, requiredCancelReason } from '../orders/rules';
import { serviceInput, catalogQuery } from '../catalog/validation';
import { dateInput } from '../appointments/validation';
export const paymentMethod = z.enum(['CASH', 'PIX', 'CREDIT', 'DEBIT', 'OTHER']);
const amount = serviceInput.shape.price;
const reference = z.string().trim().max(150).nullable().default(null);
export const paymentLine = z
  .object({
    method: paymentMethod,
    amount: amount.refine((v) => cents(v) > 0n),
    tendered: amount.optional(),
    reference,
  })
  .strict();
export const checkoutInput = change
  .extend({ payments: z.array(paymentLine).max(20), confirmed: z.literal(true) })
  .strict();
export const refundInput = change
  .extend({
    paymentId: z.string().uuid(),
    amount: amount.refine((v) => cents(v) > 0n),
    reference,
    confirmed: z.literal(true),
  })
  .strict();
export const voidInput = change
  .extend({ confirmed: z.literal(true), reason: requiredCancelReason })
  .strict();
export const financeQuery = z
  .object({
    from: dateInput,
    to: dateInput,
    page: catalogQuery.shape.page,
    kind: z.enum(['sales', 'payments', 'refunds', 'voids', 'due']).default('sales'),
  })
  .strict()
  .refine(
    (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    'Selecione até 366 dias em ordem crescente.',
  );
export const signedMoney = (v: bigint) => (v < 0n ? '-' + money(-v) : money(v));
export function preparePayments(lines: z.infer<typeof paymentLine>[], due: bigint) {
  if (lines.reduce((sum, line) => sum + cents(line.amount), 0n) !== due)
    throw new BadRequestException('A soma dos pagamentos deve ser igual ao saldo da comanda.');
  return lines.map((line) => {
    const applied = cents(line.amount),
      tendered = cents(line.tendered ?? line.amount);
    if (tendered < applied)
      throw new BadRequestException('O valor entregue não pode ser menor que o valor aplicado.');
    if (line.method !== 'CASH' && tendered !== applied)
      throw new BadRequestException('Somente dinheiro permite troco.');
    return {
      ...line,
      amount: money(applied),
      tendered: money(tendered),
      change: money(tendered - applied),
    };
  });
}
