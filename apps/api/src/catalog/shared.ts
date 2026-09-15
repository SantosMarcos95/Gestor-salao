import { Prisma } from '@prisma/client';
import { AuthRequest } from '../common';

export const snapshot = (value: object): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function catalogAudit(
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
      after: snapshot(after),
      ...(before ? { before: snapshot(before) } : {}),
    },
  });
}
export const activeFilter = (status: 'active' | 'inactive' | 'all') =>
  status === 'all' ? {} : { active: status === 'active' };
