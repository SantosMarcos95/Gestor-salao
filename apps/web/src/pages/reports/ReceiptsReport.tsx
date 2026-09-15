import { ExportButton } from './ExportButton';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { formatPrice } from '../services/types';
import { methods } from '../finance/types';
type Totals = { received: string; refunded: string; net: string };
type Entry = {
  id: string;
  paymentId: string;
  orderId: string;
  clientName: string;
  createdAt: string;
  method: string;
  kind: string;
  amount: string;
  change: string;
  reference: string | null;
  reason: string;
};
type Report = Page<Entry> & {
  summary: Totals & { change: string };
  byMethod: (Totals & { method: string })[];
};
export function ReceiptsReport({ today, timezone }: { today: string; timezone: string }) {
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [search, setSearch] = useState(''),
    [method, setMethod] = useState('all'),
    [kind, setKind] = useState('all'),
    [page, setPage] = useState(1);
  const valid = !!from && !!to && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const query = useQuery({
    queryKey: ['reports-receipts', from, to, search, method, kind, page],
    queryFn: () =>
      api<Report>(
        `/reports/receipts?from=${from}&to=${to}&search=${encodeURIComponent(search)}&method=${method}&kind=${kind}&page=${page}`,
      ),
    enabled: valid,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO DO SALÃO</span>
          <h1>Recebimentos detalhados</h1>
          <p className="muted">
            Pagamentos e estornos por data do registro. Horários em {timezone}.
          </p>
        </div>
      </div>
      <div className="panel order-filters">
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Buscar cliente
          <input
            value={search}
            maxLength={150}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Forma de pagamento
          <select
            aria-label="Forma de pagamento"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todas as formas</option>
            {Object.entries(methods).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de lançamento
          <select
            aria-label="Tipo de lançamento"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Pagamentos e estornos</option>
            <option value="payment">Somente pagamentos</option>
            <option value="refund">Somente estornos</option>
          </select>
        </label>
        <button className="button" disabled={!valid} onClick={() => query.refetch()}>
          Atualizar
        </button>
      </div>
      <p>
        Os totais consideram todos os lançamentos dos filtros, não apenas os da página. Total
        líquido = recebido − estornos.
      </p>
      <ExportButton
        path={`/reports/receipts/export?from=${from}&to=${to}&search=${encodeURIComponent(search)}&method=${method}&kind=${kind}`}
        disabled={!valid || query.isPending || query.isError}
      />
      <details className="panel">
        <summary>Como interpretar este relatório</summary>
        <p>
          Um pagamento dividido aparece em uma linha para cada forma utilizada. Um estorno aparece
          na data em que foi registrado, com a forma do pagamento original, mesmo quando ele ocorreu
          fora do período selecionado. Por isso, o líquido pode ser negativo.
        </p>
        <p>
          O troco não entra no total recebido. Os valores de cartão são os registrados pelo salão,
          sem descontar taxas ou conferir repasses da operadora. Não representam lucro. A busca usa
          o nome do cliente preservado na comanda.
        </p>
      </details>
      {!valid ? (
        <p className="error" role="alert">
          Selecione datas em ordem crescente, com diferença de até 366 dias.
        </p>
      ) : query.isPending ? (
        <p>Calculando recebimentos…</p>
      ) : query.isError ? (
        <div role="alert">
          <p className="error">{query.error.message}</p>
          <button className="button" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="finance-cards">
            {[
              ['Total recebido', query.data.summary.received],
              ['Total estornado', query.data.summary.refunded],
              ['Total líquido', query.data.summary.net],
            ].map(([label, value]) => (
              <section className="panel finance-card" key={label}>
                <span>{label}</span>
                <strong>{formatPrice(value)}</strong>
              </section>
            ))}
          </div>
          <p className="muted">
            Troco nos pagamentos dos filtros: {formatPrice(query.data.summary.change)}.
          </p>
          <section className="panel table-panel">
            <h2>Totais por forma de pagamento</h2>
            <div className="table-scroll">
              <table className="catalog-table" aria-label="Totais por forma de pagamento">
                <thead>
                  <tr>
                    <th>FORMA</th>
                    <th>RECEBIDO</th>
                    <th>ESTORNADO</th>
                    <th>LÍQUIDO</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td data-label="Forma">{methods[m.method]}</td>
                      <td data-label="Recebido">{formatPrice(m.received)}</td>
                      <td data-label="Estornado">{formatPrice(m.refunded)}</td>
                      <td data-label="Líquido">{formatPrice(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel table-panel">
            <h2>Lançamentos encontrados ({query.data.total})</h2>
            {!query.data.items.length ? (
              <p className="empty">Nenhum lançamento encontrado para estes filtros.</p>
            ) : (
              <div className="table-scroll">
                <table className="catalog-table" aria-label="Lançamentos detalhados">
                  <thead>
                    <tr>
                      <th>CLIENTE</th>
                      <th>DATA</th>
                      <th>TIPO</th>
                      <th>FORMA</th>
                      <th>VALOR</th>
                      <th>DETALHES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((r) => (
                      <tr key={`${r.kind}-${r.id}`}>
                        <td data-label="Cliente">{r.clientName}</td>
                        <td data-label="Data">
                          {new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: timezone })}
                        </td>
                        <td data-label="Tipo">{r.kind === 'payment' ? 'Pagamento' : 'Estorno'}</td>
                        <td data-label="Forma">{methods[r.method]}</td>
                        <td data-label="Valor">{formatPrice(r.amount)}</td>
                        <td data-label="Detalhes">
                          <details>
                            <summary>Ver detalhes do lançamento</summary>
                            {r.reference && <p>Referência: {r.reference}</p>}
                            {r.reason && <p>Motivo: {r.reason}</p>}
                            {r.kind === 'payment' && r.method === 'CASH' && (
                              <p>Troco: {formatPrice(r.change)}</p>
                            )}
                            <p style={{ overflowWrap: 'anywhere' }}>Comanda: {r.orderId}</p>
                            <p style={{ overflowWrap: 'anywhere' }}>
                              Pagamento original: {r.paymentId}
                            </p>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} total={query.data.total} onPage={setPage} />
          </section>
        </>
      )}
    </>
  );
}
