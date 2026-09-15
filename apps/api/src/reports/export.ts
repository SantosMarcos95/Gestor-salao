import { BadRequestException } from '@nestjs/common';
import { Database } from '../database';
import { AuthRequest } from '../common';
export const EXPORT_LIMIT = 10000;
export function csv(rows: (string | number | boolean | null)[][]) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = value == null ? '' : String(value);
            // Spreadsheet formulas must never be evaluated from customer-controlled text.
            if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) && !/^-?\d+(?:[.,]\d+)?$/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(';'),
      )
      .join('\r\n') +
    '\r\n'
  );
}
export async function exportReport(
  db: Database,
  req: AuthRequest,
  kind: string,
  data: { total: number; from: string; to: string; timezone: string },
  rows: (string | number | boolean | null)[][],
) {
  if (data.total > EXPORT_LIMIT)
    throw new BadRequestException(
      'A exportação permite até 10.000 linhas. Reduza o período ou a busca.',
    );
  const filters = Object.entries(req.query)
    .filter(([key]) => key !== 'page')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' | ');
  const notes: Record<string, string> = {
    producao:
      'Valores antes do desconto da comanda; não representam recebimentos. Agrupamento conforme filtros.',
    estoque: 'Saldo, mínimo e reposição são atuais. Consumo e movimentações seguem o período.',
    ocupacao: 'Baseado na jornada atual, inclusive para datas passadas. Tempos em minutos.',
    recebimentos:
      'Pagamento e estorno seguem suas próprias datas. Valores positivos; tipo identifica a entrada ou devolução. Troco separado.',
  };
  const content = csv([
    ['Relatório', kind],
    ['Período', data.from, data.to],
    ['Fuso', data.timezone],
    ['Gerado em', new Date().toISOString()],
    ['Filtros', filters],
    ['Observações', notes[kind]],
    [],
    ...rows,
  ]);
  await db.auditLog.create({
    data: {
      salonId: req.identity.salonId,
      actorId: req.identity.membershipId,
      action: 'RELATORIO_EXPORTADO',
      entity: 'reports',
      entityId: req.identity.salonId,
      requestId: req.requestId,
      after: {
        report: kind,
        from: data.from,
        to: data.to,
        rows: data.total,
        timezone: data.timezone,
      },
    },
  });
  return { filename: `${kind}-${data.from}-${data.to}.csv`, content };
}
export const decimalCsv = (value: string | null) => value?.replace('.', ',') ?? '';
