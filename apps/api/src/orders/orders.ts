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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { SessionGuard } from '../auth/auth';
import { catalogQuery } from '../catalog/validation';
import { catalogAudit } from '../catalog/shared';
import { scope as agendaScope } from '../appointments/rules';
import {
  change,
  cancelInput,
  checkVersion,
  command,
  commandFields,
  discountInput,
  importInput,
  lockOrder,
  openOrder,
  orderInput,
  orderProductInput,
  orderQuery,
  orderScope,
  pricesInput,
  recalculate,
  requirePermission,
  visitInclude,
  visitInput,
  visitView,
} from './rules';

@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private db: Database) {}
  private async view(tx: Prisma.TransactionClient, req: AuthRequest, id: string) {
    const order = await tx.salonOrder.findFirst({
      where: { id, ...orderScope(req.identity) },
      include: {
        visits: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: visitInclude },
        productItems: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!order) throw new NotFoundException('Comanda não encontrada.');
    return {
      ...order,
      subtotal: order.subtotal.toFixed(2),
      discount: order.discount.toFixed(2),
      total: order.total.toFixed(2),
      visits: order.visits.map((v) => visitView(v, req.identity)),
      productItems: order.productItems.map((i) => ({
        ...i,
        saleQuantity: i.saleQuantity.toFixed(6),
        unitPrice: i.unitPrice.toFixed(2),
        total: i.total.toFixed(2),
      })),
    };
  }
  @Get()
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    const { page, search, status, clientId } = parse(orderQuery, query);
    const where = {
      ...orderScope(req.identity),
      ...(clientId ? { clientId } : {}),
      ...(status === 'all' ? {} : { status }),
      clientName: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.salonOrder.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.salonOrder.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map((o) => ({
        ...o,
        subtotal: o.subtotal.toFixed(2),
        discount: o.discount.toFixed(2),
        total: o.total.toFixed(2),
      })),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get('options/clients')
  async clients(@Query() query: unknown, @Req() req: AuthRequest) {
    orderScope(req.identity);
    requirePermission(req.identity, 'comandas.abrir');
    requirePermission(req.identity, 'clientes.visualizar_todos');
    const { search, page } = parse(catalogQuery, query),
      where = {
        salonId: req.identity.salonId,
        deletedAt: null,
        name: { contains: search, mode: 'insensitive' as const },
      };
    const [items, total] = await this.db.$transaction(
      [
        this.db.client.findMany({
          where,
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.client.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  @Get('options/professionals')
  async professionals(@Query() query: unknown, @Req() req: AuthRequest) {
    orderScope(req.identity);
    requirePermission(req.identity, 'comandas.editar');
    const { search, page } = parse(catalogQuery, query),
      where = {
        salonId: req.identity.salonId,
        active: true,
        name: { contains: search, mode: 'insensitive' as const },
      };
    const [items, total] = await this.db.$transaction(
      [
        this.db.professional.findMany({
          where,
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.professional.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 20 };
  }
  @Get('options/services')
  async services(@Query() query: unknown, @Req() req: AuthRequest) {
    orderScope(req.identity);
    requirePermission(req.identity, 'comandas.editar');
    const { search, page, professionalId } = parse(
      catalogQuery.extend({ professionalId: z.string().uuid() }),
      query,
    );
    const where = {
      salonId: req.identity.salonId,
      active: true,
      professionals: {
        some: { professionalId, professional: { active: true, salonId: req.identity.salonId } },
      },
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.service.findMany({
          where,
          select: { id: true, name: true, price: true, durationMinutes: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.service.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map((s) => ({ ...s, price: s.price.toFixed(2) })),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get('options/products')
  async products(@Query() query: unknown, @Req() req: AuthRequest) {
    orderScope(req.identity);
    requirePermission(req.identity, 'comandas.editar');
    requirePermission(req.identity, 'produtos.visualizar');
    const { search, page } = parse(catalogQuery.pick({ search: true, page: true }), query);
    const where = {
      salonId: req.identity.salonId,
      active: true,
      salePrice: { not: null },
      name: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            baseUnit: true,
            saleQuantity: true,
            salePrice: true,
            balance: true,
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.product.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map((p) => ({
        ...p,
        saleQuantity: p.saleQuantity.toFixed(6),
        salePrice: p.salePrice!.toFixed(2),
        balance: req.identity.permissions.includes('estoque.visualizar')
          ? p.balance.toFixed(6)
          : undefined,
      })),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get(':id/appointments')
  async appointments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.view(this.db, req, id);
    requirePermission(req.identity, 'comandas.editar');
    const order = await this.db.salonOrder.findUniqueOrThrow({ where: { id } }),
      { search, page } = parse(catalogQuery, query);
    const where = {
      salonId: req.identity.salonId,
      clientId: order.clientId,
      professional: agendaScope(req.identity, 'visualizar'),
      status: {
        in: ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'COMPLETED'] as (
          | 'SCHEDULED'
          | 'CONFIRMED'
          | 'ARRIVED'
          | 'COMPLETED'
        )[],
      },
      visit: null,
      OR: [
        { professional: { name: { contains: search, mode: 'insensitive' as const } } },
        { services: { some: { name: { contains: search, mode: 'insensitive' as const } } } },
      ],
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.appointment.findMany({
          where,
          include: {
            professional: { select: { name: true } },
            services: { orderBy: { position: 'asc' } },
          },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.appointment.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: req.identity.salonId } });
    return {
      items: items.map((a) => ({
        id: a.id,
        version: a.version,
        name: `${new Intl.DateTimeFormat('pt-BR', { timeZone: salon.timezone, dateStyle: 'short', timeStyle: 'short' }).format(a.startsAt)} · ${a.professional.name} · ${a.services.map((s) => s.name).join(', ')}`,
      })),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(
      async (tx) => {
        const order = await this.view(tx, req, id);
        const history = await tx.auditLog.findMany({
          where: { salonId: req.identity.salonId, entity: 'salon_orders', entityId: id },
          select: {
            id: true,
            action: true,
            reason: true,
            createdAt: true,
            actor: { select: { user: { select: { name: true } } } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        });
        return { ...order, history };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Post()
  async create(@Body() body: unknown, @Req() req: AuthRequest) {
    orderScope(req.identity);
    requirePermission(req.identity, 'comandas.abrir');
    requirePermission(req.identity, 'clientes.visualizar_todos');
    const input = parse(orderInput, body);
    return this.db.$transaction(async (tx) => {
      const id = await command(tx, req, 'order:create', input, async () => {
        await tx.$queryRaw`SELECT id FROM clients WHERE salon_id=${req.identity.salonId}::uuid AND id=${input.clientId}::uuid FOR SHARE`;
        const client = await tx.client.findFirst({
          where: { id: input.clientId, salonId: req.identity.salonId, deletedAt: null },
        });
        if (!client) throw new NotFoundException('Cliente ativo não encontrado.');
        const order = await tx.salonOrder.create({
          data: {
            salonId: req.identity.salonId,
            clientId: client.id,
            clientName: client.name,
            createdBy: req.identity.membershipId,
            notes: input.notes,
          },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          order.id,
          'COMANDA_ABERTA',
          input.reason,
          order,
        );
        return order.id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post('from-appointment/:appointmentId')
  async fromAppointment(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    orderScope(req.identity);
    requirePermission(req.identity, 'comandas.abrir');
    requirePermission(req.identity, 'comandas.editar');
    requirePermission(req.identity, 'clientes.visualizar_todos');
    const input = parse(
      z.object({ ...commandFields, appointmentVersion: z.number().int().positive() }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const id = await command(
        tx,
        req,
        `order:from-appointment:${appointmentId}`,
        input,
        async () => {
          await tx.$queryRaw`SELECT id FROM appointments WHERE salon_id=${req.identity.salonId}::uuid AND id=${appointmentId}::uuid FOR UPDATE`;
          const a = await tx.appointment.findFirst({
            where: {
              id: appointmentId,
              salonId: req.identity.salonId,
              professional: agendaScope(req.identity, 'visualizar'),
            },
            include: {
              services: { orderBy: { position: 'asc' } },
              professional: true,
              client: true,
              visit: true,
            },
          });
          if (!a) throw new NotFoundException('Agendamento não encontrado.');
          if (a.visit) {
            if (
              !(await tx.salonOrder.findFirst({
                where: { id: a.visit.orderId, ...orderScope(req.identity) },
              }))
            )
              throw new NotFoundException('Comanda não encontrada.');
            return a.visit.orderId;
          }
          checkVersion(a.version, input.appointmentVersion);
          if (!['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'COMPLETED'].includes(a.status))
            throw new ConflictException('Este agendamento foi cancelado ou marcado como falta.');
          if (!a.client || a.client.deletedAt)
            throw new NotFoundException('Cliente ativo não encontrado.');
          if (!a.professional.active) throw new BadRequestException('O profissional está inativo.');
          const order = await tx.salonOrder.create({
            data: {
              salonId: a.salonId,
              clientId: a.clientId,
              clientName: a.client.name,
              createdBy: req.identity.membershipId,
            },
          });
          await catalogAudit(
            tx,
            req,
            'salon_orders',
            order.id,
            'COMANDA_ABERTA',
            input.reason,
            order,
          );
          const visit = await tx.visit.create({
            data: {
              salonId: a.salonId,
              orderId: order.id,
              clientId: a.clientId,
              professionalId: a.professionalId,
              professionalName: a.professional.name,
              appointmentId: a.id,
              items: {
                create: a.services.map((s) => ({
                  serviceId: s.serviceId,
                  position: s.position,
                  name: s.name,
                  price: s.price,
                  durationMinutes: s.durationMinutes,
                })),
              },
            },
          });
          if (a.status === 'COMPLETED')
            await tx.visit.update({ where: { id: visit.id }, data: { status: 'COMPLETED' } });
          const after = await recalculate(tx, order.id, a.salonId);
          await catalogAudit(
            tx,
            req,
            'salon_orders',
            order.id,
            'AGENDAMENTO_IMPORTADO',
            input.reason,
            { ...after, visitId: visit.id, appointmentId: a.id },
            order,
          );
          return order.id;
        },
      );
      return this.view(tx, req, id);
    });
  }
  @Post(':id/products')
  addProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(orderProductInput, body);
    requirePermission(req.identity, 'comandas.editar');
    requirePermission(req.identity, 'produtos.visualizar');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:product`, input, async () => {
        const before = await lockOrder(tx, req.identity, id);
        openOrder(before);
        checkVersion(before.version, input.version);
        if (
          (await tx.orderProductItem.count({ where: { salonId: before.salonId, orderId: id } })) >=
          100
        )
          throw new BadRequestException('Limite de produtos da comanda atingido.');
        const product = await tx.product.findFirst({
          where: { id: input.productId, salonId: before.salonId, active: true },
        });
        if (!product || !product.salePrice)
          throw new NotFoundException('Produto ativo com preço de venda não encontrado.');
        const lineTotal = product.salePrice.mul(input.units);
        if (lineTotal.greaterThan('999999999999.99'))
          throw new BadRequestException('O valor do item ultrapassa o limite permitido.');
        const item = await tx.orderProductItem.create({
          data: {
            salonId: before.salonId,
            orderId: id,
            productId: product.id,
            productName: product.name,
            baseUnit: product.baseUnit,
            saleQuantity: product.saleQuantity,
            units: input.units,
            unitPrice: product.salePrice,
            total: lineTotal,
          },
        });
        await recalculate(tx, id, before.salonId);
        await catalogAudit(tx, req, 'salon_orders', id, 'PRODUTO_ADICIONADO', input.reason, {
          itemId: item.id,
          productId: item.productId,
          units: item.units,
          total: item.total.toFixed(2),
        });
        return item.id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/products/:itemId/remove')
  removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(change, body);
    requirePermission(req.identity, 'comandas.editar');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:product:${itemId}:remove`, input, async () => {
        const before = await lockOrder(tx, req.identity, id);
        openOrder(before);
        checkVersion(before.version, input.version);
        const item = await tx.orderProductItem.findFirst({
          where: { id: itemId, salonId: before.salonId, orderId: id, movementId: null },
        });
        if (!item) throw new NotFoundException('Produto da comanda não encontrado.');
        await tx.orderProductItem.delete({ where: { id: itemId } });
        await recalculate(tx, id, before.salonId);
        await catalogAudit(tx, req, 'salon_orders', id, 'PRODUTO_REMOVIDO', input.reason, {
          itemId,
          productId: item.productId,
          units: item.units,
          total: item.total.toFixed(2),
        });
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/visits')
  add(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(visitInput, body);
    requirePermission(req.identity, 'comandas.editar');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:visit`, input, async () => {
        const order = await lockOrder(tx, req.identity, id);
        openOrder(order);
        checkVersion(order.version, input.version);
        if ((await tx.visit.count({ where: { orderId: id, salonId: order.salonId } })) >= 100)
          throw new BadRequestException('Limite de 100 atendimentos por comanda.');
        await tx.$queryRaw`SELECT id FROM professionals WHERE salon_id=${order.salonId}::uuid AND id=${input.professionalId}::uuid FOR SHARE`;
        const professional = await tx.professional.findFirst({
          where: { id: input.professionalId, salonId: order.salonId, active: true },
        });
        if (!professional) throw new NotFoundException('Profissional ativo não encontrado.');
        await tx.$queryRaw`SELECT id FROM services WHERE salon_id=${order.salonId}::uuid AND id IN (${Prisma.join(input.serviceIds.map((s) => Prisma.sql`${s}::uuid`))}) ORDER BY id FOR SHARE`;
        const services = await tx.service.findMany({
          where: {
            id: { in: input.serviceIds },
            salonId: order.salonId,
            active: true,
            professionals: { some: { professionalId: professional.id } },
          },
        });
        if (services.length !== input.serviceIds.length)
          throw new BadRequestException('Selecione serviços ativos vinculados ao profissional.');
        const visit = await tx.visit.create({
          data: {
            salonId: order.salonId,
            orderId: id,
            clientId: order.clientId,
            professionalId: professional.id,
            professionalName: professional.name,
            items: {
              create: input.serviceIds.map((serviceId, position) => {
                const s = services.find((s) => s.id === serviceId)!;
                return {
                  serviceId,
                  position,
                  name: s.name,
                  price: s.price,
                  durationMinutes: s.durationMinutes,
                };
              }),
            },
          },
        });
        const after = await recalculate(tx, id, order.salonId);
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'ATENDIMENTO_ADICIONADO',
          input.reason,
          { ...after, visitId: visit.id },
          order,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/import')
  importAppointment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(importInput, body);
    requirePermission(req.identity, 'comandas.editar');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:import`, input, async () => {
        const order = await lockOrder(tx, req.identity, id);
        openOrder(order);
        checkVersion(order.version, input.version);
        if ((await tx.visit.count({ where: { orderId: id, salonId: order.salonId } })) >= 100)
          throw new BadRequestException('Limite de 100 atendimentos por comanda.');
        await tx.$queryRaw`SELECT id FROM appointments WHERE salon_id=${order.salonId}::uuid AND id=${input.appointmentId}::uuid FOR UPDATE`;
        const a = await tx.appointment.findFirst({
          where: {
            id: input.appointmentId,
            salonId: order.salonId,
            clientId: order.clientId,
            professional: agendaScope(req.identity, 'visualizar'),
          },
          include: { services: { orderBy: { position: 'asc' } }, professional: true, visit: true },
        });
        if (!a) throw new NotFoundException('Agendamento do cliente não encontrado.');
        checkVersion(a.version, input.appointmentVersion);
        if (a.visit || !['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'COMPLETED'].includes(a.status))
          throw new ConflictException(
            'Este agendamento já foi vinculado, cancelado ou marcado como falta.',
          );
        if (!a.professional.active) throw new BadRequestException('O profissional está inativo.');
        const visit = await tx.visit.create({
          data: {
            salonId: order.salonId,
            orderId: id,
            clientId: order.clientId,
            professionalId: a.professionalId,
            professionalName: a.professional.name,
            appointmentId: a.id,
            items: {
              create: a.services.map((s) => ({
                serviceId: s.serviceId,
                position: s.position,
                name: s.name,
                price: s.price,
                durationMinutes: s.durationMinutes,
              })),
            },
          },
        });
        // Insert historical items before closing the visit: closed items are immutable.
        // Agenda completion does not record actual start/end times; do not invent them.
        if (a.status === 'COMPLETED')
          await tx.visit.update({ where: { id: visit.id }, data: { status: 'COMPLETED' } });
        const after = await recalculate(tx, id, order.salonId);
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'AGENDAMENTO_IMPORTADO',
          input.reason,
          { ...after, visitId: visit.id, appointmentId: a.id },
          order,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/discount')
  discount(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(discountInput, body);
    requirePermission(req.identity, 'comandas.editar');
    requirePermission(req.identity, 'comandas.aplicar_desconto');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:discount`, input, async () => {
        const before = await lockOrder(tx, req.identity, id);
        openOrder(before);
        checkVersion(before.version, input.version);
        const after = await recalculate(tx, id, before.salonId, input.discount);
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'DESCONTO_ALTERADO',
          input.reason,
          after,
          before,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/visits/:visitId/prices')
  prices(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(pricesInput, body);
    requirePermission(req.identity, 'comandas.editar');
    requirePermission(req.identity, 'comandas.alterar_preco');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:prices:${visitId}`, input, async () => {
        const order = await lockOrder(tx, req.identity, id);
        openOrder(order);
        checkVersion(order.version, input.version);
        const before = await tx.visit.findFirst({
          where: { id: visitId, orderId: id, salonId: order.salonId },
          include: { items: true },
        });
        if (!before) throw new NotFoundException('Atendimento não encontrado.');
        if (!['WAITING', 'IN_PROGRESS'].includes(before.status))
          throw new ConflictException('Os valores de atendimentos encerrados estão preservados.');
        if (input.prices.some((i) => !before.items.some((s) => s.id === i.id)))
          throw new BadRequestException('Item não pertence ao atendimento.');
        for (const item of input.prices)
          await tx.visitItem.update({ where: { id: item.id }, data: { price: item.price } });
        await tx.visit.update({ where: { id: visitId }, data: { version: { increment: 1 } } });
        await recalculate(tx, id, order.salonId);
        const after = await tx.visit.findUniqueOrThrow({
          where: { id: visitId },
          include: { items: true },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'VALORES_ALTERADOS',
          input.reason,
          after,
          before,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/ready')
  ready(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(change, body);
    requirePermission(req.identity, 'comandas.fechar');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:ready`, input, async () => {
        const before = await lockOrder(tx, req.identity, id);
        openOrder(before);
        checkVersion(before.version, input.version);
        const visits = await tx.visit.findMany({ where: { orderId: id, salonId: before.salonId } });
        const productCount = await tx.orderProductItem.count({
          where: { orderId: id, salonId: before.salonId },
        });
        if (
          (!visits.some((v) => v.status === 'COMPLETED') && !productCount) ||
          visits.some((v) => ['WAITING', 'IN_PROGRESS'].includes(v.status))
        )
          throw new ConflictException(
            'Conclua ou cancele os atendimentos. A comanda precisa de um serviço concluído ou produto.',
          );
        await recalculate(tx, id, before.salonId);
        const after = await tx.salonOrder.update({
          where: { id },
          data: { status: 'READY', readyAt: new Date() },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'COMANDA_PRONTA',
          input.reason,
          after,
          before,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(cancelInput, body);
    requirePermission(req.identity, 'comandas.cancelar');
    return this.db.$transaction(async (tx) => {
      await command(tx, req, `order:${id}:cancel`, input, async () => {
        const before = await lockOrder(tx, req.identity, id);
        checkVersion(before.version, input.version);
        if (!['OPEN', 'READY'].includes(before.status))
          throw new ConflictException(
            'Esta comanda não pode ser cancelada aqui. Se houver venda registrada, use o cancelamento no financeiro.',
          );
        const visits = await tx.visit.findMany({
          where: {
            orderId: id,
            salonId: before.salonId,
            status: { in: ['WAITING', 'IN_PROGRESS'] },
          },
        });
        for (const v of visits) {
          await tx.visit.update({
            where: { id: v.id },
            data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } },
          });
          if (v.appointmentId) {
            const appointment = await tx.appointment.findUniqueOrThrow({
              where: { id: v.appointmentId },
            });
            const cancelled = await tx.appointment.update({
              where: { id: v.appointmentId },
              data: { status: 'CANCELLED', version: { increment: 1 } },
            });
            await catalogAudit(
              tx,
              req,
              'appointments',
              appointment.id,
              'AGENDAMENTO_CANCELADO',
              input.reason,
              cancelled,
              appointment,
            );
          }
        }
        const after = await tx.salonOrder.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } },
        });
        await catalogAudit(
          tx,
          req,
          'salon_orders',
          id,
          'COMANDA_CANCELADA',
          input.reason,
          { ...after, cancelledVisits: visits.map((v) => v.id) },
          before,
        );
        return id;
      });
      return this.view(tx, req, id);
    });
  }
}
