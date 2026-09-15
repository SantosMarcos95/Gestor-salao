import { z } from 'zod';
import { catalogReason } from '../catalog/validation';

export const revision = z
  .object({ version: z.number().int().positive(), reason: catalogReason })
  .strict();
export const workInput = revision
  .extend({
    periods: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            startMinute: z.number().int().min(0).max(1439),
            endMinute: z.number().int().min(1).max(1440),
          })
          .strict(),
      )
      .max(42),
  })
  .superRefine(({ periods }, ctx) => {
    const sorted = [...periods].sort(
      (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
    );
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i],
        previous = sorted[i - 1];
      if (
        p.startMinute >= p.endMinute ||
        (previous && previous.weekday === p.weekday && previous.endMinute > p.startMinute)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['periods'],
          message: 'Os períodos devem ter início anterior ao fim e não podem se sobrepor.',
        });
    }
  });
export const servicesInput = revision
  .extend({ serviceIds: z.array(z.string().uuid()).max(500) })
  .refine((v) => new Set(v.serviceIds).size === v.serviceIds.length, 'Serviços repetidos.');
export const blockInput = z
  .object({
    startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    endLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    description: z.string().trim().min(2).max(200),
    reason: catalogReason,
  })
  .strict();

// Resolve wall-clock input in the salon's timezone, independently of the browser/server zone.
// Reject nonexistent or ambiguous times instead of silently moving a block during DST changes.
export function localInstant(local: string, timezone: string): Date {
  const wall = Date.parse(`${local}:00Z`);
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== local ||
    +local.slice(0, 4) < 1900 ||
    +local.slice(0, 4) > 2100
  )
    throw new Error('Data inválida. Use um ano entre 1900 e 2100.');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wallAt = (ms: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
    );
    return Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
  };
  const candidates = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = wall + hours * 3600000;
    const candidate = wall - (wallAt(sample) - sample);
    if (wallAt(candidate) === wall) candidates.add(candidate);
  }
  if (candidates.size !== 1)
    throw new Error('Horário inexistente ou ambíguo no fuso do salão. Escolha outro horário.');
  return new Date([...candidates][0]);
}
