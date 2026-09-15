import {
  Body,
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
import { Prisma } from '@prisma/client';
import { hash, verify } from 'argon2';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { Require, SessionGuard } from '../auth/auth';
import { resolvePermissions } from '../auth/permissions';
import {
  incorrectPassword,
  lockPasswordAccount,
  requireCurrentSession,
  resetPasswordInput,
} from '../auth/password';

const management = ['usuarios.gerenciar', 'roles.gerenciar'];
const memberInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      updatedAt: true,
      mustChangePassword: true,
    },
  },
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  overrides: { include: { permission: true } },
} satisfies Prisma.SalonUserInclude;
type Member = Prisma.SalonUserGetPayload<{ include: typeof memberInclude }>;
const effective = (m: Member) =>
  resolvePermissions(
    m.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)),
    m.overrides.map((o) => ({ code: o.permission.code, effect: o.effect })),
  );
const revision = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function memberView(m: Member) {
  const data = {
    id: m.id,
    name: m.user.name,
    email: m.user.email,
    active: m.active,
    status: m.user.status,
    roleIds: m.roles.map((r) => r.roleId).sort(),
    roles: m.roles.map((r) => r.role.name).sort(),
    overrides: m.overrides
      .map((o) => ({ code: o.permission.code, effect: o.effect }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    permissions: effective(m),
  };
  return { ...data, revision: revision({ ...data, credentialsUpdatedAt: m.user.updatedAt }) };
}
const roleInclude = { permissions: { include: { permission: true } } } satisfies Prisma.RoleInclude;
function roleView(r: Prisma.RoleGetPayload<{ include: typeof roleInclude }>) {
  const data = {
    id: r.id,
    name: r.name,
    code: r.code,
    protected: r.protected,
    permissions: r.permissions.map((p) => p.permission.code).sort(),
  };
  return { ...data, revision: revision(data) };
}
const reason = z.string().trim().min(5).max(500);
const codes = z
  .array(z.string().min(1).max(100))
  .max(100)
  .refine((v) => new Set(v).size === v.length);
const accessInput = z.object({
  active: z.boolean(),
  roleIds: z
    .array(z.string().uuid())
    .min(1)
    .max(20)
    .refine((v) => new Set(v).size === v.length),
  overrides: z
    .array(z.object({ code: z.string().max(100), effect: z.enum(['ALLOW', 'DENY']) }).strict())
    .max(100)
    .refine((v) => new Set(v.map((o) => o.code)).size === v.length),
  reason,
});
const newUser = accessInput
  .extend({
    name: z.string().trim().min(2).max(150),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(8).max(128),
  })
  .strict();
const editUser = accessInput.extend({ revision: z.string().length(64) }).strict();
const roleInput = z
  .object({ name: z.string().trim().min(2).max(100), permissions: codes, reason })
  .strict();
const json = (v: object): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

@Controller('access')
@UseGuards(SessionGuard)
export class AccessController {
  constructor(private db: Database) {}

  // All access writers share this lock, including changes to different administrators.
  private async authorize(tx: Prisma.TransactionClient, req: AuthRequest, required: string[]) {
    await tx.$queryRaw`SELECT id FROM salons WHERE id = ${req.identity.salonId}::uuid FOR UPDATE`;
    const actor = await tx.salonUser.findFirst({
      where: { id: req.identity.membershipId, salonId: req.identity.salonId },
      include: memberInclude,
    });
    const session = await tx.userSession.findUnique({ where: { id: req.identity.sessionId } });
    if (
      !actor ||
      !actor.active ||
      actor.user.status !== 'ACTIVE' ||
      actor.user.mustChangePassword ||
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !required.every((p) => effective(actor).includes(p))
    )
      throw new ForbiddenException('Seu acesso mudou. Atualize a página.');
    return effective(actor);
  }
  private checkGrant(actor: string[], requested: string[]) {
    if (requested.some((p) => !actor.includes(p)))
      throw new ForbiddenException(
        'Você só pode administrar acessos que estejam dentro das suas próprias permissões.',
      );
  }
  private async protectAdmin(tx: Prisma.TransactionClient, salonId: string) {
    const members = await tx.salonUser.findMany({
      where: { salonId, active: true, user: { status: 'ACTIVE' } },
      include: memberInclude,
    });
    if (
      !members.some(
        (m) =>
          m.roles.some((r) => r.role.code === 'ROLE_ADMIN' && r.role.protected) &&
          management.every((p) => effective(m).includes(p)),
      )
    )
      throw new ConflictException(
        'Mantenha pelo menos um administrador ativo com permissão para gerenciar usuários e perfis.',
      );
  }
  private async audit(
    tx: Prisma.TransactionClient,
    req: AuthRequest,
    entity: string,
    entityId: string,
    action: string,
    reason: string,
    after: object,
    before?: object,
  ) {
    await tx.auditLog.create({
      data: {
        salonId: req.identity.salonId,
        actorId: req.identity.membershipId,
        entity,
        entityId,
        action,
        reason,
        requestId: req.requestId,
        after: json(after),
        ...(before ? { before: json(before) } : {}),
      },
    });
  }
  @Get('users')
  @Require('usuarios.gerenciar')
  async users(@Query() query: unknown, @Req() req: AuthRequest) {
    const { search, page } = parse(
      z.object({
        search: z.string().trim().max(150).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      }),
      query,
    );
    const where: Prisma.SalonUserWhereInput = {
      salonId: req.identity.salonId,
      user: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.salonUser.findMany({
          where,
          include: memberInclude,
          orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        this.db.salonUser.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map(memberView), total, page, pageSize: 20 };
  }
  @Get('roles')
  @Require('roles.gerenciar')
  async roles(@Req() req: AuthRequest) {
    return (
      await this.db.role.findMany({
        where: { salonId: req.identity.salonId },
        include: roleInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      })
    ).map(roleView);
  }
  @Get('permissions')
  @Require('roles.gerenciar')
  permissions() {
    return this.db.permission.findMany({
      select: { code: true, description: true },
      orderBy: { code: 'asc' },
    });
  }

  private async assignment(
    tx: Prisma.TransactionClient,
    salonId: string,
    data: z.infer<typeof accessInput>,
    actor: string[],
  ) {
    const roles = await tx.role.findMany({
      where: { salonId, id: { in: data.roleIds } },
      include: roleInclude,
    });
    if (roles.length !== data.roleIds.length)
      throw new NotFoundException('Perfil não encontrado neste salão.');
    const permissions = await tx.permission.findMany({
      where: { code: { in: data.overrides.map((o) => o.code) } },
    });
    if (permissions.length !== data.overrides.length)
      throw new NotFoundException('Permissão não encontrada.');
    this.checkGrant(actor, [
      ...roles.flatMap((r) => r.permissions.map((p) => p.permission.code)),
      ...data.overrides.map((o) => o.code),
    ]);
    return permissions;
  }
  @Post('users')
  @Require(...management)
  async createUser(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(newUser, body);
    const passwordHash = await hash(data.password);
    return this.db.$transaction(async (tx) => {
      const actor = await this.authorize(tx, req, management);
      const permissions = await this.assignment(tx, req.identity.salonId, data, actor);
      if (await tx.user.findUnique({ where: { email: data.email }, select: { id: true } }))
        throw new ConflictException(
          'Não foi possível cadastrar com este e-mail. Utilize outro endereço.',
        );
      const user = await tx.user.create({
        data: { name: data.name, email: data.email, passwordHash },
      });
      const member = await tx.salonUser.create({
        data: { salonId: req.identity.salonId, userId: user.id, active: data.active },
      });
      await this.saveAssignment(tx, member.id, req.identity.salonId, data, permissions);
      const after = memberView(
        await tx.salonUser.findUniqueOrThrow({ where: { id: member.id }, include: memberInclude }),
      );
      await this.audit(tx, req, 'salon_users', member.id, 'USUARIO_CRIADO', data.reason, after);
      return after;
    });
  }
  private async saveAssignment(
    tx: Prisma.TransactionClient,
    id: string,
    salonId: string,
    data: z.infer<typeof accessInput>,
    permissions: { id: string; code: string }[],
  ) {
    await tx.userRole.deleteMany({ where: { membershipId: id, salonId } });
    await tx.userRole.createMany({
      data: data.roleIds.map((roleId) => ({ salonId, membershipId: id, roleId })),
    });
    await tx.userPermissionOverride.deleteMany({ where: { membershipId: id } });
    if (permissions.length)
      await tx.userPermissionOverride.createMany({
        data: permissions.map((p) => ({
          membershipId: id,
          permissionId: p.id,
          effect: data.overrides.find((o) => o.code === p.code)!.effect,
        })),
      });
  }
  @Patch('users/:id')
  @Require(...management)
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(editUser, body);
    return this.db.$transaction(async (tx) => {
      const actor = await this.authorize(tx, req, management);
      const member = await tx.salonUser.findFirst({
        where: { id, salonId: req.identity.salonId },
        include: memberInclude,
      });
      if (!member) throw new NotFoundException('Usuário não encontrado neste salão.');
      const before = memberView(member);
      if (before.revision !== data.revision)
        throw new ConflictException(
          'Este acesso mudou. Feche a edição e atualize a lista antes de tentar novamente.',
        );
      this.checkGrant(actor, effective(member));
      const permissions = await this.assignment(tx, req.identity.salonId, data, actor);
      await this.saveAssignment(tx, id, req.identity.salonId, data, permissions);
      await tx.salonUser.update({ where: { id }, data: { active: data.active } });
      await this.protectAdmin(tx, req.identity.salonId);
      if (!data.active)
        await tx.userSession.updateMany({
          where: { membershipId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      const after = memberView(
        await tx.salonUser.findUniqueOrThrow({ where: { id }, include: memberInclude }),
      );
      await this.audit(tx, req, 'salon_users', id, 'USUARIO_ALTERADO', data.reason, after, before);
      return after;
    });
  }
  @Post('users/:id/password')
  @Require(...management)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(resetPasswordInput, body);
    const passwordHash = await hash(data.newPassword);
    return this.db.$transaction(async (tx) => {
      const actor = await this.authorize(tx, req, management);
      const target = await tx.salonUser.findFirst({
        where: { id, salonId: req.identity.salonId },
        include: memberInclude,
      });
      if (!target) throw new NotFoundException('Usuário não encontrado neste salão.');
      if (target.userId === req.identity.userId)
        throw new ForbiddenException('Use Minha conta para trocar sua própria senha.');
      this.checkGrant(actor, effective(target));
      // A salon administrator cannot take over a global account shared with another salon.
      if (
        await tx.salonUser.count({
          where: { userId: target.userId, salonId: { not: req.identity.salonId } },
        })
      ) {
        throw new ForbiddenException(
          'Esta conta possui vínculo com outro salão. O titular deve trocar a própria senha.',
        );
      }
      await lockPasswordAccount(tx, req.identity.salonId, target.userId);
      const current = await tx.salonUser.findUniqueOrThrow({
        where: { id },
        include: memberInclude,
      });
      if (memberView(current).revision !== data.revision)
        throw new ConflictException('Este acesso mudou. Feche a janela e atualize a lista.');
      const session = await requireCurrentSession(tx, req);
      if (!(await verify(session.user.passwordHash, data.currentPassword)))
        throw incorrectPassword();
      await tx.user.update({
        where: { id: target.userId },
        data: { passwordHash, mustChangePassword: true },
      });
      await tx.userSession.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, req, 'salon_users', id, 'SENHA_REDEFINIDA', data.reason, {
        name: target.user.name,
        email: target.user.email,
      });
      return { message: 'Senha provisória definida. O usuário deverá trocá-la no próximo acesso.' };
    });
  }

  @Post('roles')
  @Require('roles.gerenciar')
  async createRole(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(roleInput, body);
    return this.db.$transaction(async (tx) => {
      const actor = await this.authorize(tx, req, ['roles.gerenciar']);
      this.checkGrant(actor, data.permissions);
      const permissions = await this.lookupPermissions(tx, data.permissions);
      const role = await tx.role.create({
        data: {
          salonId: req.identity.salonId,
          name: data.name,
          code: `CUSTOM_${randomUUID()}`,
          permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
        include: roleInclude,
      });
      const after = roleView(role);
      await this.audit(tx, req, 'roles', role.id, 'PERFIL_CRIADO', data.reason, after);
      return after;
    });
  }
  private async lookupPermissions(tx: Prisma.TransactionClient, codes: string[]) {
    const permissions = await tx.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== codes.length)
      throw new NotFoundException('Permissão não encontrada.');
    return permissions;
  }
  @Patch('roles/:id')
  @Require('roles.gerenciar')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(roleInput.extend({ revision: z.string().length(64) }).strict(), body);
    return this.db.$transaction(async (tx) => {
      const actor = await this.authorize(tx, req, ['roles.gerenciar']);
      const role = await tx.role.findFirst({
        where: { id, salonId: req.identity.salonId },
        include: roleInclude,
      });
      if (!role) throw new NotFoundException('Perfil não encontrado neste salão.');
      if (role.protected)
        throw new ForbiddenException(
          'O perfil Administrador é protegido. Crie outro perfil para personalizar as permissões.',
        );
      const before = roleView(role);
      if (before.revision !== data.revision)
        throw new ConflictException('Este perfil mudou. Feche a edição e atualize a lista.');
      this.checkGrant(actor, [...before.permissions, ...data.permissions]);
      const permissions = await this.lookupPermissions(tx, data.permissions);
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const after = roleView(
        await tx.role.update({
          where: { id },
          data: {
            name: data.name,
            permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
          },
          include: roleInclude,
        }),
      );
      await this.protectAdmin(tx, req.identity.salonId);
      await this.audit(tx, req, 'roles', id, 'PERFIL_ALTERADO', data.reason, after, before);
      return after;
    });
  }
}
