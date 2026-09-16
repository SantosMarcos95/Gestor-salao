import { ExportButton } from './ExportButton';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { quantity } from '../inventory/types';
type Row = {
  id: string;
  name: string;
  active: boolean;
  baseUnit: string;
  balance: string;
  minimum: string;
  needed: string;
  belowMinimum: boolean;
  consumed: string;
  sold: string;
  entries: string;
  losses: string;
  manual: string;
  adjustments: string;
};
type Report = Page<Row> & { summary: { products: number; replenish: number; consumed: number } };
export function StockReport({ today, timezone }: { today: string; timezone: string }) {
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState('active'),
    [replenish, setReplenish] = useState('all');
  const valid = !!from && !!to && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const query = useQuery({
    queryKey: ['reports-stock', from, to, search, page, status, replenish],
    queryFn: () =>
      api<Report>(
        `/reports/stock?from=${from}&to=${to}&search=${encodeURIComponent(search)}&page=${page}&status=${status}&replenish=${replenish}`,
      ),
    enabled: valid,
  });
  const amount = (value: string, unit: string) => `${quantity(value)} ${unit}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO DO SALÃO</span>
          <h1>Consumo e reposição de estoque</h1>
          <p className="muted">
            Consumo no período e produtos que precisam de reposição agora. Horários em {timezone}.
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
          Buscar produto
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
          Produtos
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="active">Ativos</option>
            <option value="all">Todos, incluindo inativos</option>
          </select>
        </label>
        <label>
          Reposição
          <select
            value={replenish}
            onChange={(e) => {
              setReplenish(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos os saldos</option>
            <option value="needed">No mínimo ou abaixo</option>
          </select>
        </label>
        <button className="button" disabled={!valid} onClick={() => query.refetch()}>
          Atualizar
        </button>
      </div>
      <p>
        Consumo e movimentações seguem as datas escolhidas. Saldo, mínimo e reposição mostram a
        situação atual, independente do período.
      </p>
      <ExportButton
        path={`/reports/stock/export?from=${from}&to=${to}&search=${encodeURIComponent(search)}&status=${status}&replenish=${replenish}`}
        disabled={!valid || query.isPending || query.isError}
      />
      <details className="panel">
        <summary>Como interpretar as quantidades</summary>
        <p>
          Consumo inclui apenas produtos confirmados nos atendimentos, pela data da baixa. Cancelar
          o atendimento não devolve o produto consumido. Vendas, perdas e baixas manuais são
          mostradas separadamente.
        </p>
        <p>
          “Falta até o mínimo” é a diferença entre o mínimo cadastrado e o saldo atual. Ao atingir
          exatamente o mínimo, o produto continua em alerta, mas essa diferença é zero. Não é uma
          previsão de compra nem quantidade de embalagens.
        </p>
        <p>
          Cada produto usa sua unidade-base (ml, g ou un). As quantidades de produtos diferentes não
          são somadas. Ajustes mostram a variação positiva ou negativa do inventário. Alertas de
          reposição consideram somente produtos ativos. Produtos inativos podem ser consultados pelo
          filtro.
        </p>
      </details>
      {!valid ? (
        <p className="error" role="alert">
          Selecione datas em ordem crescente, com diferença de até 366 dias.
        </p>
      ) : query.isPending ? (
        <p>Calculando estoque…</p>
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
              ['Produtos encontrados', query.data.summary.products],
              ['Produtos utilizados no período', query.data.summary.consumed],
              ['Produtos para repor agora', query.data.summary.replenish],
            ].map(([label, value]) => (
              <section className="panel finance-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <p className="muted">
            Totais considerando todos os produtos dos filtros, não apenas os da página.
          </p>
          <section className="panel table-panel">
            {!query.data.items.length ? (
              <p className="empty">Nenhum produto encontrado para estes filtros.</p>
            ) : (
              <div className="table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>PRODUTO</th>
                      <th>CONSUMO NO PERÍODO</th>
                      <th>SALDO ATUAL</th>
                      <th>MÍNIMO</th>
                      <th>FALTA ATÉ O MÍNIMO</th>
                      <th>MOVIMENTAÇÕES NO PERÍODO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Produto">
                          <strong>{r.name}</strong>
                          {!r.active && <p>Inativo</p>}
                          {r.belowMinimum && <p className="error">Repor estoque</p>}
                        </td>
                        <td data-label="Consumo no período">{amount(r.consumed, r.baseUnit)}</td>
                        <td data-label="Saldo atual">{amount(r.balance, r.baseUnit)}</td>
                        <td data-label="Mínimo">{amount(r.minimum, r.baseUnit)}</td>
                        <td data-label="Falta até o mínimo">{amount(r.needed, r.baseUnit)}</td>
                        <td data-label="Movimentações no período">
                          <details>
                            <summary>Ver movimentações de {r.name}</summary>
                            <p>Entradas: {amount(r.entries, r.baseUnit)}</p>
                            <p>Vendas: {amount(r.sold, r.baseUnit)}</p>
                            <p>Perdas: {amount(r.losses, r.baseUnit)}</p>
                            <p>Baixas manuais: {amount(r.manual, r.baseUnit)}</p>
                            <p>Ajustes: {amount(r.adjustments, r.baseUnit)}</p>
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
