import {
  Body,
  ConflictException,
  Controller,
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
import { Supplier } from '@prisma/client';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { catalogQuery, catalogStatus } from '../catalog/validation';
import { supplierInput, supplierUpdate } from './validation';
import { activeFilter, catalogAudit } from '../catalog/shared';

const view = (supplier: Supplier) => supplier;
@Controller('suppliers')
@UseGuards(SessionGuard)
export class SuppliersController {
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
        this.db.supplier.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.supplier.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map(view), total, page, pageSize: 20 };
  }
  @Post()
  @Require('produtos.criar')
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, ...data } = parse(supplierInput, body);
    return this.db.$transaction(async (tx) => {
      const after = view(
        await tx.supplier.create({ data: { ...data, salonId: req.identity.salonId } }),
      );
      await catalogAudit(tx, req, 'suppliers', after.id, 'FORNECEDOR_CRIADO', reason, after);
      return after;
    });
  }
  @Patch(':id')
  @Require('produtos.visualizar', 'produtos.editar')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, ...data } = parse(supplierUpdate, body);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM suppliers WHERE salon_id = ${req.identity.salonId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.supplier.findFirst({ where: { id, salonId: req.identity.salonId } });
      if (!before) throw new NotFoundException('Fornecedor não encontrado.');
      const result = await tx.supplier.updateMany({
        where: { id, salonId: req.identity.salonId, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException('Este fornecedor mudou. Feche a edição e atualize a lista.');
      const after = view(await tx.supplier.findUniqueOrThrow({ where: { id } }));
      await catalogAudit(
        tx,
        req,
        'suppliers',
        id,
        'FORNECEDOR_ALTERADO',
        reason,
        after,
        view(before),
      );
      return after;
    });
  }
  @Patch(':id/status')
  @Require('produtos.visualizar', 'produtos.desativar')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, active } = parse(catalogStatus, body);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM suppliers WHERE salon_id = ${req.identity.salonId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.supplier.findFirst({ where: { id, salonId: req.identity.salonId } });
      if (!before) throw new NotFoundException('Fornecedor não encontrado.');
      const result = await tx.supplier.updateMany({
        where: { id, salonId: req.identity.salonId, version },
        data: { active, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException('Este fornecedor mudou. Feche a janela e atualize a lista.');
      const after = view(await tx.supplier.findUniqueOrThrow({ where: { id } }));
      await catalogAudit(
        tx,
        req,
        'suppliers',
        id,
        active ? 'FORNECEDOR_ATIVADO' : 'FORNECEDOR_DESATIVADO',
        reason,
        after,
        view(before),
      );
      return after;
    });
  }
}
