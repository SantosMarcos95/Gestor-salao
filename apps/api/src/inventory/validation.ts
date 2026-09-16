import { z } from 'zod';
import { catalogReason, professionalInput } from '../catalog/validation';

export const decimal = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
export const scaled = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
};
export const decimalString = (value: bigint): string => {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${abs / 1000000n}.${String(abs % 1000000n).padStart(6, '0')}`;
};
export const MAX = 999999999999999999n;
export const packageInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    quantity: decimal.refine((v) => scaled(v) > 0n),
    unit: z.enum(['un', 'g', 'kg', 'ml', 'l']),
  })
  .strict();
export const packageFactor = (pack: z.infer<typeof packageInput>) =>
  scaled(pack.quantity) * (pack.unit === 'kg' || pack.unit === 'l' ? 1000n : 1n);
const productFields = {
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).nullable().default(null),
  baseUnit: z.enum(['un', 'g', 'ml']),
  minimum: decimal,
  salePrice: z
    .string()
    .regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
    .refine((v) => !/^0(?:\.0{1,2})?$/.test(v))
    .nullable()
    .optional(),
  saleQuantity: decimal.refine((v) => scaled(v) > 0n).optional(),
  packages: z.array(packageInput).max(20),
  reason: catalogReason,
};
const compatible = (p: { baseUnit: string; packages: z.infer<typeof packageInput>[] }) =>
  new Set(p.packages.map((x) => x.name.toLowerCase())).size === p.packages.length &&
  p.packages.every(
    (x) =>
      (x.unit === p.baseUnit ||
        (x.unit === 'kg' && p.baseUnit === 'g') ||
        (x.unit === 'l' && p.baseUnit === 'ml')) &&
      packageFactor(x) <= MAX,
  );
export const productInput = z
  .object(productFields)
  .strict()
  .refine(compatible, 'Embalagens duplicadas, incompatíveis ou muito grandes.');
export const productUpdate = z
  .object({ ...productFields, version: z.number().int().positive() })
  .strict()
  .refine(compatible);
export const supplierInput = professionalInput.pick({
  name: true,
  phone: true,
  email: true,
  notes: true,
  reason: true,
});
export const supplierUpdate = supplierInput
  .extend({ version: z.number().int().positive() })
  .strict();
export const movementInput = z
  .object({
    kind: z.enum(['ENTRY', 'LOSS', 'OUT', 'ADJUST']),
    quantity: decimal,
    packageName: z.string().trim().max(80).nullable().default(null),
    supplierId: z.string().uuid().nullable().default(null),
    unitCost: decimal.nullable().default(null),
    version: z.number().int().positive(),
    reason: catalogReason,
    requestKey: z.string().uuid(),
  })
  .strict()
  .refine((x) => (x.kind === 'ADJUST' ? !x.packageName : scaled(x.quantity) > 0n))
  .refine((x) => x.kind === 'ENTRY' || (!x.supplierId && x.unitCost === null));
export const movementPermission = {
  ENTRY: 'estoque.entrada',
  LOSS: 'estoque.registrar_perda',
  OUT: 'estoque.baixa_manual',
  ADJUST: 'estoque.ajustar',
};
