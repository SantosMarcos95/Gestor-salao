import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import { randomBytes, createHash } from 'node:crypto';
import { hash, verify } from 'argon2';
import { z } from 'zod';
import type { Response } from 'express';
import { Database } from '../database';
import { AuthRequest, parse } from '../common';
import { resolvePermissions } from './permissions';
import {
  changePasswordInput,
  incorrectPassword,
  lockPasswordAccount,
  requireCurrentSession,
  requireUnrestrictedPassword,
} from './password';

export const Require = (...permissions: string[]) => SetMetadata('permissions', permissions);
const AllowPasswordChange = () => SetMetadata('allowPasswordChange', true);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = 'salao_session';
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api',
});

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private db: Database,
    private reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.[cookieName];
    if (typeof token !== 'string' || token.length !== 64)
      throw new UnauthorizedException('Entre para continuar.');
    const session = await this.db.userSession.findUnique({
      where: { tokenHash: digest(token) },
      include: {
        user: true,
        membership: {
          include: {
            salon: true,
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
            overrides: { include: { permission: true } },
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      !session.membership.active ||
      session.membership.userId !== session.userId
    )
      throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    const member = session.membership;
    if (
      !this.reflector.getAllAndOverride<boolean>('allowPasswordChange', [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      requireUnrestrictedPassword(session.user.mustChangePassword);
    }
    const permissions = resolvePermissions(
      member.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)),
      member.overrides.map((o) => ({ code: o.permission.code, effect: o.effect })),
    );
    const required =
      this.reflector.getAllAndOverride<string[]>('permissions', [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (!required.every((p) => permissions.includes(p)))
      throw new ForbiddenException('Você não tem permissão para esta ação.');
    req.identity = {
      userId: session.userId,
      membershipId: member.id,
      salonId: member.salonId,
      sessionId: session.id,
      permissions,
      name: session.user.name,
      salonName: member.salon.name,
      roles: member.roles.map((r) => r.role.name),
      mustChangePassword: session.user.mustChangePassword,
    };
    return true;
  }
}

@Injectable()
export class AuthService {
  private dummyHash = hash(randomBytes(32).toString('hex'));
  constructor(private db: Database) {}
  async login(email: string, password: string, requestId: string) {
    const user = await this.db.user.findUnique({
      where: { email },
      include: { memberships: { where: { active: true }, orderBy: { id: 'asc' } } },
    });
    const valid = await verify(user?.passwordHash ?? (await this.dummyHash), password);
    if (!valid || !user || user.status !== 'ACTIVE' || !user.memberships.length)
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    // First release supports one salon. Tenant selection must be explicit before multi-salon UI ships.
    const membership = user.memberships[0];
    const token = randomBytes(32).toString('hex');
    await this.db.$transaction(async (tx) => {
      await lockPasswordAccount(tx, membership.salonId, user.id);
      const current = await tx.user.findUnique({ where: { id: user.id } });
      const currentMember = await tx.salonUser.findUnique({ where: { id: membership.id } });
      if (
        !current ||
        current.passwordHash !== user.passwordHash ||
        current.email !== email ||
        current.status !== 'ACTIVE' ||
        !currentMember?.active
      ) {
        throw new UnauthorizedException('E-mail ou senha inválidos.');
      }
      await tx.userSession.create({
        data: {
          userId: user.id,
          membershipId: membership.id,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
      });
      await tx.auditLog.create({
        data: {
          salonId: membership.salonId,
          actorId: membership.id,
          action: 'LOGIN',
          entity: 'users',
          entityId: user.id,
          requestId,
        },
      });
    });
    return token;
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private db: Database,
  ) {}
  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = parse(
      z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .strict(),
      body,
    );
    const token = await this.auth.login(data.email, data.password, req.requestId);
    res.cookie(cookieName, token, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
    return { message: 'Bem-vindo.' };
  }
  @Get('me')
  @UseGuards(SessionGuard)
  @AllowPasswordChange()
  me(@Req() req: AuthRequest) {
    const { name, salonName, permissions, roles, membershipId, mustChangePassword } = req.identity;
    return { name, salonName, permissions, roles, membershipId, mustChangePassword };
  }
  @Post('password')
  @UseGuards(SessionGuard)
  @AllowPasswordChange()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async password(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = parse(changePasswordInput, body);
    const passwordHash = await hash(data.newPassword);
    await this.db.$transaction(async (tx) => {
      await lockPasswordAccount(tx, req.identity.salonId, req.identity.userId);
      const session = await requireCurrentSession(tx, req);
      if (!(await verify(session.user.passwordHash, data.currentPassword)))
        throw incorrectPassword();
      await tx.user.update({
        where: { id: session.userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          salonId: req.identity.salonId,
          actorId: req.identity.membershipId,
          action: 'SENHA_ALTERADA',
          entity: 'users',
          entityId: session.userId,
          requestId: req.requestId,
        },
      });
    });
    res.clearCookie(cookieName, cookieOptions());
    return { message: 'Senha alterada. Entre novamente com a nova senha.' };
  }
  @Post('logout')
  @UseGuards(SessionGuard)
  @AllowPasswordChange()
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.$transaction(async (tx) => {
      await tx.userSession.update({
        where: { id: req.identity.sessionId },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          salonId: req.identity.salonId,
          actorId: req.identity.membershipId,
          action: 'LOGOUT',
          entity: 'users',
          entityId: req.identity.userId,
          requestId: req.requestId,
        },
      });
    });
    res.clearCookie(cookieName, cookieOptions());
    return { message: 'Sessão encerrada.' };
  }
}
