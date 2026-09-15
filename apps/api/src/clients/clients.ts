import {
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { clientInput, updateInput, deleteInput } from './validation';
const snapshot = (value: object): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

@Controller('clients')
@UseGuards(SessionGuard)
export class ClientsController {
  constructor(private db: Database) {}
  @Get()
  @Require('clientes.visualizar_todos')
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page } = parse(
      z.object({
        search: z.string().trim().max(150).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      }),
      query,
    );
    const where = {
      salonId: req.identity.salonId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.client.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (page - 1) * 20,
        }),
        this.db.client.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  @Post()
  @Require('clientes.criar')
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(clientInput, body);
    const { salonId, membershipId } = req.identity;
    return this.db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: { ...data, salonId, createdBy: membershipId, updatedBy: membershipId },
      });
      await tx.auditLog.create({
        data: {
          salonId,
          actorId: membershipId,
          action: 'CLIENTE_CRIADO',
          entity: 'clients',
          entityId: client.id,
          after: snapshot(client),
          requestId: req.requestId,
        },
      });
      return client;
    });
  }
  @Patch(':id')
  @Require('clientes.editar', 'clientes.visualizar_todos')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { version, ...data } = parse(updateInput, body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.client.findFirst({
        where: { id, salonId: req.identity.salonId, deletedAt: null },
      });
      if (!before) throw new NotFoundException('Cliente não encontrado.');
      const result = await tx.client.updateMany({
        where: { id, salonId: req.identity.salonId, version, deletedAt: null },
        data: { ...data, version: { increment: 1 }, updatedBy: req.identity.membershipId },
      });
      if (!result.count)
        throw new ConflictException(
          'Este cadastro foi alterado por outra pessoa. Atualize a lista antes de editar novamente.',
        );
      const after = await tx.client.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          salonId: req.identity.salonId,
          actorId: req.identity.membershipId,
          action: 'CLIENTE_ALTERADO',
          entity: 'clients',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
          requestId: req.requestId,
        },
      });
      return after;
    });
  }
  @Delete(':id')
  @Require('clientes.excluir', 'clientes.visualizar_todos')
  remove(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { version, reason } = parse(deleteInput, body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.client.findFirst({
        where: { id, salonId: req.identity.salonId, deletedAt: null },
      });
      if (!before) throw new NotFoundException('Cliente não encontrado.');
      const result = await tx.client.updateMany({
        where: { id, salonId: req.identity.salonId, version, deletedAt: null },
        data: {
          deletedAt: new Date(),
          deletedBy: req.identity.membershipId,
          deletionReason: reason,
          updatedBy: req.identity.membershipId,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new ConflictException(
          'O cadastro mudou. Atualize a lista antes de tentar novamente.',
        );
      const after = await tx.client.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          salonId: req.identity.salonId,
          actorId: req.identity.membershipId,
          action: 'CLIENTE_EXCLUIDO',
          entity: 'clients',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
          reason,
          requestId: req.requestId,
        },
      });
      return { message: 'Cliente arquivado. O histórico foi preservado.' };
    });
  }
}
