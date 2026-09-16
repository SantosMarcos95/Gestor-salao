export type Option = { id: string; name: string };
export type Professional = Option & {
  active: boolean;
  membershipId: string | null;
  workPeriods?: { weekday: number; startMinute: number; endMinute: number }[];
};
export type ServiceOption = Option & { price: string; durationMinutes: number };
export type Status = 'SCHEDULED' | 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
export const statusNames: Record<Status, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  ARRIVED: 'Chegou',
  COMPLETED: 'Concluído',
  NO_SHOW: 'Não compareceu',
  CANCELLED: 'Cancelado',
};
export type Appointment = {
  visit?: { id: string; orderId: string } | null;
  id: string;
  professionalId: string;
  clientId: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  status: Status;
  version: number;
  notes: string | null;
  total: string;
  professional: Professional;
  client: Option;
  location: Option;
  services: (ServiceOption & { serviceId: string; position: number })[];
};
export type Detail = Appointment & {
  timezone: string;
  history: {
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    actor: { user: { name: string } };
    fromStatus: Status | null;
    toStatus: Status | null;
  }[];
};
export type Context = {
  timezone: string;
  today: string;
  locations: Option[];
  items: Professional[];
  total: number;
  page: number;
  pageSize: number;
};
export type Agenda = {
  items: Appointment[];
  professionals: Professional[];
  blocks: { id: string; professionalId: string; startsAt: string; endsAt: string }[];
  timezone: string;
  date: string;
  days: number;
  total: number;
  page: number;
  pageSize: number;
};
export function localDateTime(value: string, timezone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const time = (value: string, timezone: string) => localDateTime(value, timezone).slice(11);
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T12:00Z`));
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function canFor(
  permissions: string[],
  membershipId: string,
  professional: Professional,
  action: 'editar' | 'excluir',
) {
  return (
    permissions.includes(`agenda.${action}_qualquer`) ||
    (professional.membershipId === membershipId && permissions.includes(`agenda.${action}_propria`))
  );
}
