import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page, type Profile } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { ActionDialog, type Action } from './ActionDialog';
import { VisitCard } from './VisitCard';
import { visitStates, type Visit } from './types';
export function VisitsPage({ profile }: { profile: Profile }) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('WAITING'),
    [page, setPage] = useState(1),
    [action, setAction] = useState<{ type: Action; visit: Visit } | null>(null);
  const query = useQuery({
    queryKey: ['visits', search, status, page, profile.permissions.join(',')],
    queryFn: () =>
      api<Page<Visit>>(
        `/visits?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CUIDADO EM ANDAMENTO</span>
          <h1>Atendimentos</h1>
          <p className="muted">
            Inicie os serviços da comanda, confirme o consumo e conclua o atendimento.
          </p>
        </div>
      </div>
      <div className="panel order-filters">
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
          Status do atendimento
          <select
            aria-label="Status do atendimento"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            {Object.entries(visitStates).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button" onClick={() => query.refetch()}>
          Atualizar
        </button>
      </div>
      {query.isPending ? (
        <p className="empty">Carregando atendimentos…</p>
      ) : query.isError ? (
        <>
          <p className="error" role="alert">
            {query.error.message}
          </p>
          <button className="button" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : !query.data.items.length ? (
        <p className="empty panel">
          Nenhum atendimento neste filtro. Os atendimentos são adicionados nas comandas.
        </p>
      ) : (
        <div className="visits-grid">
          {query.data.items.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              profile={profile}
              act={(type, visit) => setAction({ type, visit })}
            />
          ))}
        </div>
      )}
      {query.data && <Pagination page={page} total={query.data.total} onPage={setPage} />}
      {action && (
        <ActionDialog action={action.type} visit={action.visit} close={() => setAction(null)} />
      )}
    </>
  );
}
