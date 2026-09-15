import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../common';

export const newPasswordInput = z.string().min(8).max(128);
export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordInput,
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Escolha uma senha diferente da atual.',
    path: ['newPassword'],
  });
export const resetPasswordInput = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordInput,
    reason: z.string().trim().min(5).max(500),
    revision: z.string().length(64),
  })
  .strict();

// Lock ordering matches access administration: salon first, then the account.
export async function lockPasswordAccount(
  tx: Prisma.TransactionClient,
  salonId: string,
  userId: string,
) {
  await tx.$queryRaw`SELECT id FROM salons WHERE id = ${salonId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

export async function requireCurrentSession(tx: Prisma.TransactionClient, req: AuthRequest) {
  const session = await tx.userSession.findUnique({
    where: { id: req.identity.sessionId },
    include: { user: true, membership: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== 'ACTIVE' ||
    !session.membership.active ||
    session.userId !== req.identity.userId ||
    session.membershipId !== req.identity.membershipId
  ) {
    throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
  }
  return session;
}

export function incorrectPassword() {
  return new BadRequestException('A senha atual está incorreta.');
}

export function requireUnrestrictedPassword(mustChange: boolean) {
  if (mustChange) throw new ForbiddenException('Troque sua senha antes de continuar.');
}
