import { ExportButton } from './ExportButton';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { ReceiptsReport } from './ReceiptsReport';
import { StockReport } from './StockReport';
import { OccupancyReport } from './OccupancyReport';
import { Pagination } from '../../components/Pagination';
import { formatPrice } from '../services/types';
type Row = { id: string; name: string; services: number; visits: number; amount: string | null };
type Report = Page<Row> & { canValues: boolean; summary: Omit<Row, 'id' | 'name'> };
export function ReportsPage({ permissions }: { permissions: string[] }) {
  const agenda = permissions.includes('relatorios.agenda');
  const stock = permissions.includes('relatorios.estoque');
  const finance = permissions.includes('relatorios.financeiro');
  const [view, setView] = useState(agenda ? 'production' : stock ? 'stock' : 'receipts');
  const context = useQuery({
    queryKey: ['reports-context', agenda, stock],
    queryFn: () =>
      api<{ today: string; timezone: string }>(
        agenda
          ? '/reports/context'
          : stock
            ? '/reports/stock/context'
            : '/reports/receipts/context',
      ),
  });
  if (context.isPending) return <p>Carregando relatórios…</p>;
  if (context.isError)
    return (
      <div role="alert">
        <p className="error">{context.error.message}</p>
        <button className="button" onClick={() => context.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  return (
    <>
      <div className="panel order-filters">
        <label>
          Tipo de relatório
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <>
              {agenda && (
                <>
                  <option value="production">Serviços e profissionais</option>
                  <option value="occupancy">Ocupação da agenda</option>
                </>
              )}
              {stock && <option value="stock">Consumo e reposição de estoque</option>}
              {finance && <option value="receipts">Recebimentos detalhados</option>}
            </>
          </select>
        </label>
      </div>
      {view === 'receipts' ? (
        <ReceiptsReport {...context.data} />
      ) : view === 'stock' ? (
        <StockReport {...context.data} />
      ) : view === 'production' ? (
        <ProductionReport {...context.data} />
      ) : (
        <OccupancyReport {...context.data} />
      )}
    </>
  );
}
function ProductionReport({ today, timezone }: { today: string; timezone: string }) {
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [group, setGroup] = useState('services');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const valid = !!from && !!to && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const query = useQuery({
    queryKey: ['reports-production', from, to, group, search, page],
    queryFn: () =>
      api<Report>(
        `/reports/production?from=${from}&to=${to}&group=${group}&search=${encodeURIComponent(search)}&page=${page}`,
      ),
    enabled: valid,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO DO SALÃO</span>
          <h1>Relatórios</h1>
          <p className="muted">
            Serviços realizados e produção por profissional. Horários em {timezone}.
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
          Organizar por
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setSearch('');
              setPage(1);
            }}
          >
            <option value="services">Serviços</option>
            <option value="professionals">Profissionais</option>
          </select>
        </label>
        <label>
          Buscar {group === 'services' ? 'serviço' : 'profissional'}
          <input
            value={search}
            maxLength={150}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button className="button" disabled={!valid} onClick={() => query.refetch()}>
          Atualizar
        </button>
      </div>
      <p className="muted">
        Somente serviços concluídos, da agenda ou das comandas, sem duplicar os que foram trazidos
        da agenda. Ordenados pela quantidade realizada.
      </p>
      <ExportButton
        path={`/reports/production/export?from=${from}&to=${to}&group=${group}&search=${encodeURIComponent(search)}`}
        disabled={!valid || query.isPending || query.isError}
      />
      <details className="panel">
        <summary>Como o período e os valores são calculados</summary>
        <p>
          Usamos a data de conclusão do atendimento. Para serviços concluídos apenas na agenda,
          usamos o término agendado, inclusive após trazê-los para uma comanda. Agendamentos
          cancelados, faltas e atendimentos não concluídos ficam de fora.
        </p>
        <p>
          Os valores são os combinados em cada serviço, antes do desconto da comanda. Não
          representam pagamentos, lucro ou comissão. Estornos financeiros não retiram um serviço que
          continua concluído. Os nomes exibidos são os atuais do cadastro, incluindo profissionais e
          serviços inativos.
        </p>
        <p>
          Um atendimento pode reunir vários serviços. Por isso, ao agrupar por serviço, o mesmo
          atendimento pode aparecer em mais de uma linha; o total de atendimentos conta cada um uma
          única vez.
        </p>
      </details>
      {!valid ? (
        <p className="error" role="alert">
          Selecione datas em ordem crescente, com diferença de até 366 dias.
        </p>
      ) : query.isPending ? (
        <p>Calculando relatório…</p>
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
            <section className="panel finance-card">
              <span>Serviços concluídos</span>
              <strong>{query.data.summary.services}</strong>
            </section>
            <section className="panel finance-card">
              <span>Atendimentos concluídos</span>
              <strong>{query.data.summary.visits}</strong>
            </section>
            {query.data.canValues && (
              <section className="panel finance-card">
                <span>Valor dos serviços antes do desconto</span>
                <strong>{formatPrice(query.data.summary.amount!)}</strong>
              </section>
            )}
          </div>
          {search && <p className="muted">Totais considerando a busca informada.</p>}
          <section className="panel table-panel">
            {!query.data.items.length ? (
              <p className="empty">Nenhum serviço concluído neste período e nesta busca.</p>
            ) : (
              <div className="table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>{group === 'services' ? 'SERVIÇO' : 'PROFISSIONAL'}</th>
                      <th>SERVIÇOS CONCLUÍDOS</th>
                      <th>ATENDIMENTOS</th>
                      {query.data.canValues && <th>VALOR ANTES DO DESCONTO</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((r) => (
                      <tr key={r.id}>
                        <td data-label={group === 'services' ? 'Serviço' : 'Profissional'}>
                          {r.name}
                        </td>
                        <td data-label="Serviços concluídos">{r.services}</td>
                        <td data-label="Atendimentos">{r.visits}</td>
                        {query.data.canValues && (
                          <td data-label="Valor antes do desconto">{formatPrice(r.amount!)}</td>
                        )}
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
