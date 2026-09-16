import { describe, it, expect } from 'vitest';
import { allocate, commissionAmount, signedCents } from '../apps/api/src/finance/commission-math';
describe('comissões exatas', () => {
  it('R$90 após desconto a 60% = R$54', () => expect(commissionAmount(9000n, 6000n)).toBe(5400n));
  it('rateia descontos com resto estável e soma exata', () => {
    expect(allocate(18000n, [10000n, 10000n])).toEqual([9000n, 9000n]);
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(allocate(0n, [0n, 0n])).toEqual([0n, 0n]);
  });
  it('arredonda meio centavo e aceita 0 e 100%', () => {
    expect(commissionAmount(1n, 5000n)).toBe(1n);
    expect(commissionAmount(99999999999999n, 10000n)).toBe(99999999999999n);
    expect(commissionAmount(9000n, 0n)).toBe(0n);
    expect(signedCents('-0.01')).toBe(-1n);
  });
  it('rateio conserva valores para múltiplos pagamentos/estornos', () => {
    for (let n = 0n; n < 200n; n++) {
      const values = allocate(n, [37n, 29n, 133n]);
      expect(values.reduce((a, b) => a + b, 0n)).toBe(n);
    }
  });
});
