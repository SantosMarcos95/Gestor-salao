import { ExportButton } from './ExportButton';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
type Metrics = {
  availableMinutes: number;
  occupiedMinutes: number;
  freeMinutes: number;
  blockedMinutes: number;
  outsideMinutes: number;
  rate: number | null;
  cancelled: number;
  noShow: number;
};
type Row = Metrics & { id: string; name: string; active: boolean; appointments: number };
const time = (n: number) => {
  const minutes = Math.round(n);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
};
const percent = (n: number | null) =>
  n === null ? 'Sem jornada disponível' : `${n.toLocaleString('pt-BR')}%`;
export function OccupancyReport({ today, timezone }: { today: string; timezone: string }) {
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState('active');
  const valid = !!from && !!to && from <= to && Date.parse(to) - Date.parse(from) < 31 * 86400000;
  const query = useQuery({
    queryKey: ['reports-occupancy', from, to, search, page, status],
    queryFn: () =>
      api<Page<Row> & { summary: Metrics }>(
        `/reports/occupancy?from=${from}&to=${to}&search=${encodeURIComponent(search)}&page=${page}&status=${status}`,
      ),
    enabled: valid,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO DO SALÃO</span>
          <h1>Ocupação da agenda</h1>
          <p className="muted">Tempo agendado e livre por profissional. Horários em {timezone}.</p>
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
          Buscar profissional
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
          Equipe
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="active">Profissionais ativos</option>
            <option value="all">Todos, incluindo inativos</option>
          </select>
        </label>
        <button className="button" disabled={!valid} onClick={() => query.refetch()}>
          Atualizar
        </button>
      </div>
      <p>
        Baseado na jornada cadastrada hoje, inclusive para períodos passados. Alterar a jornada ou
        cancelar um bloqueio pode mudar os resultados anteriores.
      </p>
      <ExportButton
        path={`/reports/occupancy/export?from=${from}&to=${to}&search=${encodeURIComponent(search)}&status=${status}`}
        disabled={!valid || query.isPending || query.isError}
      />
      <details className="panel">
        <summary>Como a ocupação é calculada</summary>
        <p>
          Tempo disponível é a jornada menos intervalos e bloqueios. Tempo ocupado considera
          agendados, confirmados, clientes que chegaram e serviços concluídos, somente dentro do
          tempo disponível. Sobreposições contam uma única vez.
        </p>
        <p>
          Tempo livre = disponível − ocupado. Ocupação = ocupado ÷ disponível. Cancelamentos e
          faltas não ocupam tempo e aparecem separados. Reservas que atravessam o período têm a
          duração limitada às datas escolhidas.
        </p>
        <p>
          Atendimentos sem reserva na agenda não entram. Este relatório não mede o tempo real
          trabalhado nem garante que um serviço caiba nos intervalos livres. O total reúne todos os
          profissionais da busca, não apenas os da página. A taxa total é calculada pelos tempos
          somados.
        </p>
      </details>
      {!valid ? (
        <p className="error" role="alert">
          Selecione um período de até 31 dias em ordem crescente.
        </p>
      ) : query.isPending ? (
        <p>Calculando ocupação…</p>
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
              ['Ocupação', percent(query.data.summary.rate)],
              ['Tempo disponível', time(query.data.summary.availableMinutes)],
              ['Tempo ocupado', time(query.data.summary.occupiedMinutes)],
              ['Tempo livre', time(query.data.summary.freeMinutes)],
              ['Tempo bloqueado na jornada', time(query.data.summary.blockedMinutes)],
              ['Cancelamentos', String(query.data.summary.cancelled)],
              ['Faltas', String(query.data.summary.noShow)],
            ].map(([label, value]) => (
              <section className="panel finance-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          {query.data.summary.outsideMinutes > 0 && (
            <p role="status">
              Há {time(query.data.summary.outsideMinutes)} agendados fora da disponibilidade atual.
              Esse tempo não entra na taxa de ocupação. Confira jornadas e bloqueios.
            </p>
          )}
          <section className="panel table-panel">
            {!query.data.items.length ? (
              <p className="empty">Nenhum profissional encontrado.</p>
            ) : (
              <div className="table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>PROFISSIONAL</th>
                      <th>DISPONÍVEL</th>
                      <th>OCUPADO</th>
                      <th>LIVRE</th>
                      <th>OCUPAÇÃO</th>
                      <th>CANCELAMENTOS</th>
                      <th>FALTAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Profissional">
                          {r.name}
                          {!r.active && ' (inativo)'}
                          {r.outsideMinutes > 0 && (
                            <p className="muted">
                              {time(r.outsideMinutes)} fora da disponibilidade
                            </p>
                          )}
                        </td>
                        <td data-label="Disponível">{time(r.availableMinutes)}</td>
                        <td data-label="Ocupado">{time(r.occupiedMinutes)}</td>
                        <td data-label="Livre">{time(r.freeMinutes)}</td>
                        <td data-label="Ocupação">{percent(r.rate)}</td>
                        <td data-label="Cancelamentos">{r.cancelled}</td>
                        <td data-label="Faltas">{r.noShow}</td>
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
