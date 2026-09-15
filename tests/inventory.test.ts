import { describe, expect, it } from 'vitest';
import {
  decimalString,
  MAX,
  movementInput,
  packageFactor,
  productInput,
  scaled,
} from '../apps/api/src/inventory/validation';
const product = {
  name: 'Shampoo',
  baseUnit: 'ml',
  minimum: '0.000001',
  packages: [{ name: 'Frasco', quantity: '1', unit: 'l' }],
  reason: 'Cadastro inicial',
};
describe('Quantidades de estoque', () => {
  it('preserva a precisão no limite e converte litros sem ponto flutuante', () => {
    expect(scaled('999999999999.999999')).toBe(MAX);
    expect(decimalString(MAX)).toBe('999999999999.999999');
    expect(decimalString(-100001n)).toBe('-0.100001');
    expect(decimalString(packageFactor({ name: 'Frasco', quantity: '1.000001', unit: 'l' }))).toBe(
      '1000.001000',
    );
  });
  it('rejeita unidades incompatíveis, nomes duplicados e excesso de precisão', () => {
    expect(productInput.safeParse(product).success).toBe(true);
    expect(productInput.safeParse({ ...product, baseUnit: 'g' }).success).toBe(false);
    expect(productInput.safeParse({ ...product, minimum: '0.0000001' }).success).toBe(false);
    expect(
      productInput.safeParse({ ...product, packages: [...product.packages, ...product.packages] })
        .success,
    ).toBe(false);
    expect(
      productInput.safeParse({
        ...product,
        packages: [{ name: 'Grande', quantity: '999999999999', unit: 'l' }],
      }).success,
    ).toBe(false);
  });
  it('aceita zerar saldo no inventário, mas rejeita entrada zero e custo em perda', () => {
    const m = {
      kind: 'ADJUST',
      quantity: '0',
      version: 1,
      reason: 'Contagem física',
      requestKey: 'c062e5c6-9ab3-4ce2-8546-c2c1f90986ca',
    };
    expect(movementInput.safeParse(m).success).toBe(true);
    expect(movementInput.safeParse({ ...m, kind: 'ENTRY' }).success).toBe(false);
    expect(
      movementInput.safeParse({ ...m, kind: 'LOSS', quantity: '1', unitCost: '0.1' }).success,
    ).toBe(false);
  });
});
