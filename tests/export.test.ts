import { describe, expect, it } from 'vitest';
import { csv, exportReport } from '../apps/api/src/reports/export';
import type { Database } from '../apps/api/src/database';
import type { AuthRequest } from '../apps/api/src/common';
describe('CSV de relatórios', () => {
  it('preserva acentos, delimitadores, aspas, quebras de linha e decimais', () => {
    expect(csv([['ação; "teste"\nlinha', '123456789012,123456', '-25,00', null]])).toBe(
      '\uFEFF"ação; ""teste""\nlinha";"123456789012,123456";"-25,00";""\r\n',
    );
  });
  it('neutraliza fórmulas em textos sem converter números negativos', () => {
    expect(csv([['=SUM(A1)', '+cmd', '-1+2', '@SUM(A1)', '\t=1+1', '-0,01']])).toBe(
      '\uFEFF"\'=SUM(A1)";"\'+cmd";"\'-1+2";"\'@SUM(A1)";"\'\t=1+1";"-0,01"\r\n',
    );
  });
  it('recusa limite excedido antes de gerar arquivo ou registrar sucesso', async () => {
    await expect(
      exportReport(
        {} as Database,
        {} as AuthRequest,
        'estoque',
        { total: 10001, from: '2026-09-01', to: '2026-09-10', timezone: 'America/Sao_Paulo' },
        [],
      ),
    ).rejects.toThrow('10.000');
  });
});
