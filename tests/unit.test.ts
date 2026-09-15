import { describe, expect, it } from 'vitest';
import { resolvePermissions } from '../apps/api/src/auth/permissions';
import { clientInput } from '../apps/api/src/clients/validation';
describe('permissões efetivas', () => {
  it('negação individual vence concessões herdadas', () => {
    expect(
      resolvePermissions(
        ['clientes.criar', 'clientes.editar'],
        [
          { code: 'clientes.criar', effect: 'DENY' },
          { code: 'auditoria.visualizar', effect: 'ALLOW' },
        ],
      ),
    ).toEqual(['auditoria.visualizar', 'clientes.editar']);
  });
  it('não concede acessos implicitamente', () => expect(resolvePermissions([], [])).toEqual([]));
});
describe('validação de clientes', () => {
  it('rejeita campos controlados pelo servidor', () =>
    expect(clientInput.safeParse({ name: 'Ana Souza', salonId: 'outro-salao' }).success).toBe(
      false,
    ));
  it('rejeita datas impossíveis e futuras', () => {
    for (const birthDate of ['2025-02-30', '2099-01-01', '1899-01-01'])
      expect(clientInput.safeParse({ name: 'Ana Souza', birthDate }).success).toBe(false);
  });
  it('normaliza e-mail e aceita campos opcionais vazios', () => {
    expect(
      clientInput.parse({
        name: ' Ana Souza ',
        phone: '',
        email: 'ANA@EXAMPLE.COM',
        birthDate: '2000-02-29',
      }),
    ).toMatchObject({
      name: 'Ana Souza',
      phone: null,
      email: 'ana@example.com',
      birthDate: new Date('2000-02-29T00:00:00.000Z'),
    });
  });
});
