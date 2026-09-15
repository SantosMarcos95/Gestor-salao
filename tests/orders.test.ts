import { describe, expect, it } from 'vitest';
import { consumeInput, money, totals, cents } from '../apps/api/src/orders/rules';
describe('Totais de comandas', () => {
  it('soma e desconta centavos exatos, inclusive no limite de armazenamento', () => {
    expect(totals(['0.10', '0.20'], '0.05')).toEqual({
      subtotal: '0.30',
      discount: '0.05',
      total: '0.25',
    });
    expect(money(cents('999999999999.99'))).toBe('999999999999.99');
    expect(totals(['45.50', '30.25'], '75.75').total).toBe('0.00');
  });
  it('impede total acima do limite e desconto maior que os serviços', () => {
    expect(() => totals(['999999999999.99', '0.01'], '0')).toThrow();
    expect(() => totals(['10.00'], '10.01')).toThrow();
  });
  it('exige confirmação explícita do consumo positivo e aceita motivo omitido', () => {
    const input = {
      requestKey: '11084d0d-0ac5-4760-989b-cc062acb74d4',
      version: 1,
      productId: 'ca623382-4037-4100-a9ea-7b5f1e461d20',
      quantity: '0.000001',
      confirmed: true,
    };
    expect(consumeInput.safeParse(input).success).toBe(true);
    expect(consumeInput.safeParse({ ...input, confirmed: false }).success).toBe(false);
    expect(consumeInput.safeParse({ ...input, quantity: '0' }).success).toBe(false);
  });
});
