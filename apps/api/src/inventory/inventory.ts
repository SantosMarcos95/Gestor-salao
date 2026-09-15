import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Product, StockMovement } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { catalogQuery, catalogStatus } from '../catalog/validation';
import { activeFilter, catalogAudit } from '../catalog/shared';
import {
  decimalString,
  MAX,
  movementInput,
  movementPermission,
  packageFactor,
  productInput,
  productUpdate,
  scaled,
} from './validation';

const productView = (p: Product, req: AuthRequest) => ({
  ...p,
  minimum: p.minimum.toFixed(6),
  balance: req.identity.permissions.includes('estoque.visualizar')
    ? p.balance.toFixed(6)
    : undefined,
  belowMinimum: req.identity.permissions.includes('estoque.visualizar')
    ? p.balance.lessThanOrEqualTo(p.minimum)
    : undefined,
});
const movementView = (
  m: StockMovement & { consumption?: { visitId: string } | null },
  req: AuthRequest,
) => ({
  ...m,
  quantity: m.quantity.toFixed(6),
  delta: m.delta.toFixed(6),
  balanceBefore: m.balanceBefore.toFixed(6),
  balanceAfter: m.balanceAfter.toFixed(6),
  unitCost: req.identity.permissions.includes('produtos.visualizar_custo')
    ? (m.unitCost?.toFixed(6) ?? null)
    : undefined,
  requestHash: undefined,
});
async function lockProduct(tx: Prisma.TransactionClient, salonId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM products WHERE salon_id = ${salonId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  const product = await tx.product.findFirst({ where: { salonId, id } });
  if (!product) throw new NotFoundException('Produto não encontrado.');
  return product;
}
@Controller('products')
@UseGuards(SessionGuard)
export class ProductsController {
  constructor(private db: Database) {}
  @Get()
  @Require('produtos.visualizar')
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page, status } = parse(catalogQuery, query);
    const where = {
      salonId: req.identity.salonId,
      ...activeFilter(status),
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.product.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.product.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map((p) => productView(p, req)), total, page, pageSize: 20 };
  }
  @Post()
  @Require('produtos.criar')
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, ...data } = parse(productInput, body);
    return this.db.$transaction(async (tx) => {
      const after = await tx.product.create({ data: { ...data, salonId: req.identity.salonId } });
      await catalogAudit(tx, req, 'products', after.id, 'PRODUTO_CRIADO', reason, after);
      return productView(after, req);
    });
  }
  @Patch(':id')
  @Require('produtos.visualizar', 'produtos.editar')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, ...data } = parse(productUpdate, body);
    return this.db.$transaction(async (tx) => {
      const before = await lockProduct(tx, req.identity.salonId, id);
      if (before.version !== version)
        throw new ConflictException('O produto mudou. Feche a janela e atualize a lista.');
      if (before.baseUnit !== data.baseUnit)
        throw new BadRequestException(
          'A unidade-base não pode ser alterada. Cadastre outro produto.',
        );
      const after = await tx.product.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      await catalogAudit(tx, req, 'products', id, 'PRODUTO_ALTERADO', reason, after, before);
      return productView(after, req);
    });
  }
  @Patch(':id/status')
  @Require('produtos.visualizar', 'produtos.desativar')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, active } = parse(catalogStatus, body);
    return this.db.$transaction(async (tx) => {
      const before = await lockProduct(tx, req.identity.salonId, id);
      if (before.version !== version)
        throw new ConflictException('O produto mudou. Feche a janela e atualize a lista.');
      const after = await tx.product.update({
        where: { id },
        data: { active, version: { increment: 1 } },
      });
      await catalogAudit(
        tx,
        req,
        'products',
        id,
        active ? 'PRODUTO_ATIVADO' : 'PRODUTO_DESATIVADO',
        reason,
        after,
        before,
      );
      return productView(after, req);
    });
  }
  @Get(':id/movements')
  @Require('produtos.visualizar', 'estoque.visualizar')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const { page } = parse(catalogQuery, query);
    const where = { salonId: req.identity.salonId, productId: id };
    if (!(await this.db.product.findFirst({ where: { id, salonId: where.salonId } })))
      throw new NotFoundException('Produto não encontrado.');
    const [items, total] = await this.db.$transaction(
      [
        this.db.stockMovement.findMany({
          where,
          include: { consumption: { select: { visitId: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
          skip: (page - 1) * 20,
        }),
        this.db.stockMovement.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map((m) => movementView(m, req)), total, page, pageSize: 20 };
  }
  @Post(':id/movements')
  @Require('produtos.visualizar', 'estoque.visualizar')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(movementInput, body);
    if (!req.identity.permissions.includes(movementPermission[input.kind]))
      throw new ForbiddenException('Sem permissão para esta movimentação.');
    const salonId = req.identity.salonId;
    const hash = createHash('sha256')
      .update(JSON.stringify({ id, actorId: req.identity.membershipId, ...input }))
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      // Serialize retries even if a key is reused for a different product.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${salonId + input.requestKey}, 0))::text`;
      const existing = await tx.stockMovement.findUnique({
        where: { salonId_requestKey: { salonId, requestKey: input.requestKey } },
      });
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException('Este envio já foi usado para outra movimentação.');
        return movementView(existing, req);
      }
      const before = await lockProduct(tx, salonId, id);
      if (before.version !== input.version)
        throw new ConflictException(
          'O estoque mudou. Feche a janela e confira o saldo antes de lançar.',
        );
      if (!before.active) throw new BadRequestException('Ative o produto antes de movimentar.');
      const packages = before.packages as {
        name: string;
        quantity: string;
        unit: 'un' | 'g' | 'kg' | 'ml' | 'l';
      }[];
      const pack = input.packageName ? packages.find((p) => p.name === input.packageName) : null;
      if (input.packageName && !pack) throw new BadRequestException('Embalagem não encontrada.');
      let quantity = scaled(input.quantity);
      if (pack) {
        const product = quantity * packageFactor(pack);
        if (product % 1000000n)
          throw new BadRequestException('A conversão excede seis casas decimais.');
        quantity = product / 1000000n;
      }
      const balance = scaled(before.balance.toFixed(6));
      const delta =
        input.kind === 'ADJUST'
          ? quantity - balance
          : input.kind === 'ENTRY'
            ? quantity
            : -quantity;
      const next = balance + delta;
      if (quantity > MAX || next > MAX)
        throw new BadRequestException('Quantidade acima do limite.');
      if (next < 0n)
        throw new BadRequestException('Saldo insuficiente. Estoque negativo não está habilitado.');
      if (delta === 0n) throw new BadRequestException('O ajuste deve alterar o saldo atual.');
      let supplierName: string | null = null;
      if (input.supplierId) {
        await tx.$queryRaw`SELECT id FROM suppliers WHERE salon_id = ${salonId}::uuid AND id = ${input.supplierId}::uuid FOR SHARE`;
        const supplier = await tx.supplier.findFirst({
          where: { id: input.supplierId, salonId, active: true },
        });
        if (!supplier) throw new NotFoundException('Fornecedor ativo não encontrado.');
        supplierName = supplier.name;
      }
      const after = await tx.product.update({
        where: { id },
        data: { balance: decimalString(next), version: { increment: 1 } },
      });
      const movement = await tx.stockMovement.create({
        data: {
          salonId,
          productId: id,
          actorId: req.identity.membershipId,
          kind: input.kind,
          quantity: decimalString(quantity),
          delta: decimalString(delta),
          balanceBefore: before.balance,
          balanceAfter: after.balance,
          supplierId: input.supplierId,
          supplierName,
          unitCost: input.unitCost,
          productName: before.name,
          baseUnit: before.baseUnit,
          ...(pack ? { packageSnapshot: { ...pack, count: input.quantity } } : {}),
          reason: input.reason,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });
      await catalogAudit(
        tx,
        req,
        'stock_movements',
        movement.id,
        'ESTOQUE_MOVIMENTADO',
        input.reason,
        movement,
        { balance: before.balance, productId: id },
      );
      return movementView(movement, req);
    });
  }
}
