import { z } from 'zod';
import { catalogQuery, serviceInput } from '../catalog/validation';
const optionalReason = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => v ?? '');
export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return (
      Number.isFinite(+d) &&
      d.toISOString().slice(0, 10) === v &&
      v >= '1900-01-01' &&
      v <= '2100-12-24'
    );
  });
export const viewQuery = z
  .object({
    date: dateInput,
    days: z.coerce
      .number()
      .refine((v) => v === 1 || v === 7)
      .default(1),
    professionalId: z.string().uuid().optional(),
    page: catalogQuery.shape.page,
    status: z
      .enum(['all', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])
      .default('all'),
  })
  .strict();
export const optionsQuery = catalogQuery
  .pick({ search: true, page: true })
  .extend({ action: z.enum(['visualizar', 'criar', 'editar']).default('visualizar') });
const fields = z
  .object({
    professionalId: z.string().uuid(),
    clientId: z.string().uuid(),
    locationId: z.string().uuid(),
    startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    serviceIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .refine((v) => new Set(v).size === v.length, 'Serviços repetidos.'),
    servicePrices: z
      .array(
        z
          .object({
            serviceId: z.string().uuid(),
            price: serviceInput.shape.price,
          })
          .strict(),
      )
      .max(20)
      .refine((v) => new Set(v.map((s) => s.serviceId)).size === v.length, 'Preços repetidos.')
      .optional(),
    notes: z.string().trim().max(2000).nullable().default(null),
    reason: optionalReason,
  })
  .strict();
export const createInput = fields.extend({ requestKey: z.string().uuid() }).strict();
export const updateInput = fields.extend({ version: z.number().int().positive() }).strict();
export const statusInput = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']),
    reason: optionalReason,
  })
  .strict()
  .refine((v) => v.status !== 'CANCELLED' || !!v.reason.trim(), {
    message: 'Informe o motivo do cancelamento.',
    path: ['reason'],
  });
