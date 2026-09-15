import { z } from 'zod';
import { clientInput } from '../clients/validation';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);
export const catalogReason = z.string().trim().min(5).max(500);
export const catalogQuery = z.object({
  search: z.string().trim().max(150).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export const catalogStatus = z
  .object({ active: z.boolean(), version: z.number().int().positive(), reason: catalogReason })
  .strict();
export const professionalInput = clientInput
  .pick({ name: true, phone: true, email: true, notes: true })
  .extend({
    specialty: optionalText(150),
    membershipId: z.string().uuid().nullable().default(null),
    reason: catalogReason,
  })
  .strict();
export const professionalUpdate = professionalInput
  .extend({ version: z.number().int().positive() })
  .strict();
// Decimal strings avoid rounding amounts through JavaScript floating point.
export const serviceInput = z
  .object({
    name: z.string().trim().min(2).max(150),
    description: optionalText(2000),
    durationMinutes: z.number().int().min(1).max(1440),
    price: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/),
    reason: catalogReason,
  })
  .strict();
export const serviceUpdate = serviceInput.extend({ version: z.number().int().positive() }).strict();
