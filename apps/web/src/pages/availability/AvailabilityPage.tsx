import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { CatalogFilters } from '../../components/CatalogFilters';
import { Pagination } from '../../components/Pagination';
import { WorkDialog } from './WorkDialog';
import { ServicesDialog } from './ServicesDialog';
import { BlocksDialog } from './BlocksDialog';
export type ProfessionalOption = { id: string; name: string; active: boolean };
export function AvailabilityPage({ permissions }: { permissions: string[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{
    professional: ProfessionalOption;
    kind: 'work' | 'blocks' | 'services';
  } | null>(null);
  const canWork = permissions.includes('agenda.gerenciar_disponibilidade');
  const canServices = permissions.includes('profissionais.gerenciar');
  const list = useQuery({
    queryKey: ['availability-professionals', search, status, page],
    queryFn: () =>
      api<Page<ProfessionalOption>>(
        `/availability/professionals?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PREPARAÇÃO DA AGENDA</span>
          <h1>Disponibilidade e serviços</h1>
          <p className="muted">
            Configure os períodos de trabalho e os serviços realizados pela equipe.
          </p>
        </div>
      </div>
      <section className="panel table-panel">
        <CatalogFilters
          search={search}
          status={status}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onStatus={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        {list.isPending ? (
          <p className="empty">Carregando profissionais…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.items.length ? (
          <p className="empty">
            Nenhum profissional encontrado. Cadastre a equipe em Profissionais.
          </p>
        ) : (
          <div className="availability-list">
            {list.data.items.map((p) => (
              <article className="availability-person" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <p className="muted">{p.active ? 'Ativo' : 'Inativo'}</p>
                </div>
                <div className="availability-actions">
                  {canWork && (
                    <>
                      <button
                        className="button"
                        aria-label={`Jornada de ${p.name}`}
                        onClick={() => setEditing({ professional: p, kind: 'work' })}
                      >
                        Jornada semanal
                      </button>
                      <button
                        className="button"
                        aria-label={`Bloqueios de ${p.name}`}
                        onClick={() => setEditing({ professional: p, kind: 'blocks' })}
                      >
                        Bloqueios
                      </button>
                    </>
                  )}
                  {canServices && (
                    <button
                      className="button"
                      aria-label={`Serviços de ${p.name}`}
                      onClick={() => setEditing({ professional: p, kind: 'services' })}
                    >
                      Serviços realizados
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
      </section>
      {editing?.kind === 'work' && (
        <WorkDialog professional={editing.professional} close={() => setEditing(null)} />
      )}
      {editing?.kind === 'services' && (
        <ServicesDialog professional={editing.professional} close={() => setEditing(null)} />
      )}
      {editing?.kind === 'blocks' && (
        <BlocksDialog professional={editing.professional} close={() => setEditing(null)} />
      )}
    </>
  );
}
