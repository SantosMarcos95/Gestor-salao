import { describe, it, expect } from 'vitest';
import { checkoutInput, preparePayments, signedMoney } from '../apps/api/src/finance/rules';
import { parseMoney } from '../apps/web/src/pages/finance/types';
describe('Recebimentos e troco', () => {
  it('aplica valores exatos e calcula troco separado do pagamento', () => {
    const lines = preparePayments(
      [
        { method: 'CASH', amount: '10.05', tendered: '20', reference: null },
        { method: 'PIX', amount: '25', reference: null },
      ],
      3505n,
    );
    expect(lines[0].change).toBe('9.95');
    expect(lines[0].amount).toBe('10.05');
    expect(lines[1].change).toBe('0.00');
    expect(preparePayments([], 0n)).toEqual([]);
  });
  it('rejeita diferença no saldo, dinheiro insuficiente e troco em cartão', () => {
    expect(() =>
      preparePayments([{ method: 'CASH', amount: '1', reference: null }], 101n),
    ).toThrow();
    expect(() =>
      preparePayments([{ method: 'CASH', amount: '1', tendered: '0.99', reference: null }], 100n),
    ).toThrow();
    expect(() =>
      preparePayments([{ method: 'CREDIT', amount: '1', tendered: '2', reference: null }], 100n),
    ).toThrow();
  });
  it('preserva negativos do período e valida dinheiro na interface sem float', () => {
    expect(signedMoney(-1n)).toBe('-0.01');
    expect(signedMoney(-101n)).toBe('-1.01');
    expect(parseMoney('999999999999,99')).toBe(99999999999999n);
    expect(parseMoney('-1')).toBe(null);
    expect(parseMoney('1,001')).toBe(null);
    const input = {
      version: 1,
      requestKey: 'fe5a8095-55dd-472d-86b9-e24caec513e0',
      confirmed: true,
      payments: [],
    };
    expect(checkoutInput.safeParse(input).success).toBe(true);
    expect(checkoutInput.safeParse({ ...input, confirmed: false }).success).toBe(false);
  });
});
