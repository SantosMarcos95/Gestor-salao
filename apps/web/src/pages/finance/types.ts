export const methods: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT: 'Cartão de crédito',
  DEBIT: 'Cartão de débito',
  OTHER: 'Outro',
};
export type Payment = {
  id: string;
  method: string;
  amount: string;
  tendered: string;
  change: string;
  remaining: string;
  reference: string | null;
  createdAt: string;
  refunds: { id: string; amount: string; createdAt: string; reason: string }[];
};
export type Settlement = {
  order: { id: string; clientName: string; version: number; status: string; total: string };
  sale: {
    id: string;
    total: string;
    paid: string;
    refunded: string;
    netReceived: string;
    due: string;
    createdAt: string;
    void: { id: string; total: string; createdAt: string } | null;
    payments: Payment[];
  } | null;
};
export function parseMoney(value: string): bigint | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, part = ''] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
}
export const money = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
