export type Packaging = { name: string; quantity: string; unit: 'un' | 'g' | 'kg' | 'ml' | 'l' };
export type Product = {
  id: string;
  name: string;
  description: string | null;
  baseUnit: 'un' | 'g' | 'ml';
  packages: Packaging[];
  minimum: string;
  salePrice: string | null;
  saleQuantity: string;
  balance?: string;
  belowMinimum?: boolean;
  active: boolean;
  version: number;
};
export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  version: number;
};
export type Movement = {
  consumption?: { visitId: string } | null;
  id: string;
  kind: string;
  quantity: string;
  delta: string;
  balanceBefore: string;
  balanceAfter: string;
  baseUnit: string;
  supplierName: string | null;
  unitCost?: string | null;
  reason: string;
  createdAt: string;
  packageSnapshot: (Packaging & { count: string }) | null;
};
export const quantity = (v: string) =>
  v
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
    .replace('.', ',');
export const decimalValue = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .trim()
    .replace(',', '.');
export const kinds: Record<string, string> = {
  ENTRY: 'Entrada',
  LOSS: 'Perda',
  OUT: 'Baixa manual',
  ADJUST: 'Ajuste de inventário',
  SALE: 'Venda em comanda',
};
export const capabilities: Record<string, string> = {
  ENTRY: 'estoque.entrada',
  LOSS: 'estoque.registrar_perda',
  OUT: 'estoque.baixa_manual',
  ADJUST: 'estoque.ajustar',
};
