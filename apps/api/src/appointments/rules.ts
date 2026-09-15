import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { Identity } from '../common';
import { localInstant } from '../availability/validation';
export const occupying = { notIn: ['CANCELLED', 'NO_SHOW'] as AppointmentStatus[] };
export const terminal = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];
export function scope(
  identity: Identity,
  action: 'visualizar' | 'criar' | 'editar' | 'excluir',
): Prisma.ProfessionalWhereInput {
  const all = action === 'visualizar' ? 'todas' : 'qualquer';
  if (identity.permissions.includes(`agenda.${action}_${all}`))
    return { salonId: identity.salonId };
  if (identity.permissions.includes(`agenda.${action}_propria`))
    return { salonId: identity.salonId, membershipId: identity.membershipId };
  throw new ForbiddenException('Você não tem permissão para esta ação na agenda.');
}
export function instant(local: string, timezone: string) {
  try {
    return localInstant(local, timezone);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}
export function localParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: +parts.hour * 60 + +parts.minute,
  };
}
export type Period = { weekday: number; startMinute: number; endMinute: number };
export function withinWork(startsAt: Date, endsAt: Date, timezone: string, periods: Period[]) {
  // Check each occupied minute, handling split shifts, midnight and timezone transitions.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 86400000) return false;
  for (let ms = startsAt.getTime(); ms < endsAt.getTime(); ms += 60000) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
    );
    const weekday = weekdays.indexOf(p.weekday),
      minute = +p.hour * 60 + +p.minute;
    if (
      !periods.some((v) => v.weekday === weekday && v.startMinute <= minute && v.endMinute > minute)
    )
      return false;
  }
  return true;
}
export const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['SCHEDULED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
  ARRIVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};
