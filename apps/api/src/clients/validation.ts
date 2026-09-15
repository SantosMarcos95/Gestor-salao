import { z } from 'zod';
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const phone = z
  .string()
  .trim()
  .max(30)
  .refine(
    (v) => !v || (/^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, '').length >= 8),
    'Telefone inválido.',
  )
  .transform((v) => v || null)
  .nullable()
  .optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const parsed = new Date(v + 'T00:00:00.000Z');
    return (
      !isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === v &&
      parsed <= new Date() &&
      parsed.getUTCFullYear() >= 1900
    );
  }, 'Data de nascimento inválida.')
  .transform((v) => new Date(v + 'T00:00:00.000Z'))
  .nullable()
  .optional();
export const clientInput = z
  .object({
    name: z.string().trim().min(2).max(150),
    phone,
    whatsapp: phone,
    email: z
      .union([
        z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        z.literal('').transform(() => null),
      ])
      .nullable()
      .optional(),
    birthDate: date,
    notes: optionalText(2000),
  })
  .strict();
export const updateInput = clientInput.extend({ version: z.number().int().positive() });
export const deleteInput = z
  .object({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(500) })
  .strict();
