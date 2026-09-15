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
import { Service } from '@prisma/client';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { catalogQuery, catalogStatus, serviceInput, serviceUpdate } from './validation';
import { activeFilter, catalogAudit } from './shared';

const view = (service: Service) => ({ ...service, price: service.price.toFixed(2) });
@Controller('services')
@UseGuards(SessionGuard)
export class ServicesController {
  constructor(private db: Database) {}
  @Get()
  @Require('servicos.visualizar')
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page, status } = parse(catalogQuery, query);
    const where = {
      salonId: req.identity.salonId,
      ...activeFilter(status),
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.service.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.service.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map(view), total, page, pageSize: 20 };
  }
  @Post()
  @Require('servicos.criar')
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, ...data } = parse(serviceInput, body);
    return this.db.$transaction(async (tx) => {
      const after = view(
        await tx.service.create({ data: { ...data, salonId: req.identity.salonId } }),
      );
      await catalogAudit(tx, req, 'services', after.id, 'SERVICO_CRIADO', reason, after);
      return after;
    });
  }
  @Patch(':id')
  @Require('servicos.visualizar', 'servicos.editar')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, ...data } = parse(serviceUpdate, body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.service.findFirst({ where: { id, salonId: req.identity.salonId } });
      if (!before) throw new NotFoundException('Serviço não encontrado.');
      const result = await tx.service.updateMany({
        where: { id, salonId: req.identity.salonId, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException('Este serviço mudou. Feche a edição e atualize a lista.');
      const after = view(await tx.service.findUniqueOrThrow({ where: { id } }));
      await catalogAudit(tx, req, 'services', id, 'SERVICO_ALTERADO', reason, after, view(before));
      return after;
    });
  }
  @Patch(':id/status')
  @Require('servicos.visualizar', 'servicos.desativar')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { reason, version, active } = parse(catalogStatus, body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.service.findFirst({ where: { id, salonId: req.identity.salonId } });
      if (!before) throw new NotFoundException('Serviço não encontrado.');
      const result = await tx.service.updateMany({
        where: { id, salonId: req.identity.salonId, version },
        data: { active, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException('Este serviço mudou. Feche a janela e atualize a lista.');
      const after = view(await tx.service.findUniqueOrThrow({ where: { id } }));
      await catalogAudit(
        tx,
        req,
        'services',
        id,
        active ? 'SERVICO_ATIVADO' : 'SERVICO_DESATIVADO',
        reason,
        after,
        view(before),
      );
      return after;
    });
  }
}
