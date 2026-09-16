import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuthRequest } from '../common';
import { catalogAudit } from '../catalog/shared';
import { decimalString, MAX, scaled } from '../inventory/validation';

// Called only while holding the order lock, in the first checkout transaction.
export async function debitSoldProducts(
  tx: Prisma.TransactionClient,
  req: AuthRequest,
  orderId: string,
) {
  const salonId = req.identity.salonId;
  const items = await tx.orderProductItem.findMany({
    where: { salonId, orderId },
    orderBy: [{ productId: 'asc' }, { id: 'asc' }],
  });
  for (const item of items) {
    if (item.movementId) throw new ConflictException('O estoque desta venda já foi baixado.');
    await tx.$queryRaw`SELECT id FROM products WHERE salon_id=${salonId}::uuid AND id=${item.productId}::uuid FOR UPDATE`;
    const product = await tx.product.findFirstOrThrow({ where: { id: item.productId, salonId } });
    if (!product.active)
      throw new ConflictException(`Ative ${item.productName} antes de receber a comanda.`);
    const amount = scaled(item.saleQuantity.toFixed(6)) * BigInt(item.units);
    const before = scaled(product.balance.toFixed(6));
    if (amount > MAX) throw new BadRequestException('Quantidade vendida acima do limite.');
    if (before < amount)
      throw new ConflictException(
        `Estoque insuficiente para ${item.productName}. Confira o saldo antes de receber.`,
      );
    const after = await tx.product.update({
      where: { id: product.id },
      data: { balance: decimalString(before - amount), version: { increment: 1 } },
    });
    const movement = await tx.stockMovement.create({
      data: {
        salonId,
        productId: product.id,
        actorId: req.identity.membershipId,
        kind: 'SALE',
        quantity: decimalString(amount),
        delta: decimalString(-amount),
        balanceBefore: product.balance,
        balanceAfter: after.balance,
        productName: item.productName,
        baseUnit: item.baseUnit,
        reason: 'Venda na comanda',
        requestKey: randomUUID(),
        requestHash: createHash('sha256').update(`sale:${salonId}:${item.id}`).digest('hex'),
      },
    });
    await tx.orderProductItem.update({ where: { id: item.id }, data: { movementId: movement.id } });
    await catalogAudit(
      tx,
      req,
      'stock_movements',
      movement.id,
      'PRODUTO_VENDIDO',
      'Venda na comanda',
      {
        orderId,
        itemId: item.id,
        quantity: decimalString(amount),
        balance: after.balance.toFixed(6),
      },
    );
  }
}
