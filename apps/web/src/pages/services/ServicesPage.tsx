import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { api, type Page } from '../../lib/api';
import { CatalogFilters } from '../../components/CatalogFilters';
import { CatalogStatusDialog } from '../../components/CatalogStatusDialog';
import { Pagination } from '../../components/Pagination';
import { ServiceDialog } from './ServiceDialog';
import { formatPrice, type Service } from './types';

export function ServicesPage({ permissions }: { permissions: string[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [changing, setChanging] = useState<Service | null>(null);
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['services', search, status, page],
    queryFn: () =>
      api<Page<Service>>(
        `/services?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
      ),
  });
  async function saved() {
    setEditing(null);
    setChanging(null);
    setNotice('Serviço salvo. Alteração registrada na auditoria.');
    await Promise.all(
      ['services', 'audit'].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATÁLOGO DO SALÃO</span>
          <h1>Serviços</h1>
          <p className="muted">Organize os serviços, preços e tempo de atendimento.</p>
        </div>
        {permissions.includes('servicos.criar') && (
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            Novo serviço
          </button>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
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
          <p className="empty">Carregando serviços…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.items.length ? (
          <p className="empty">Nenhum serviço encontrado neste filtro.</p>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>SERVIÇO</th>
                  <th>DURAÇÃO</th>
                  <th>PREÇO</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Serviço">
                      <strong>{s.name}</strong>
                    </td>
                    <td data-label="Duração">{s.durationMinutes} min</td>
                    <td data-label="Preço">{formatPrice(s.price)}</td>
                    <td data-label="Status">{s.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="row-actions">
                      {permissions.includes('servicos.editar') && (
                        <button
                          className="icon-button"
                          aria-label={`Editar serviço ${s.name}`}
                          onClick={() => setEditing(s)}
                        >
                          <Pencil size={18} />
                        </button>
                      )}
                      {permissions.includes('servicos.desativar') && (
                        <button
                          className="icon-button"
                          aria-label={`${s.active ? 'Desativar' : 'Ativar'} serviço ${s.name}`}
                          onClick={() => setChanging(s)}
                        >
                          <Power size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
      </section>
      {editing && (
        <ServiceDialog
          service={editing === 'new' ? null : editing}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}{' '}
      {changing && (
        <CatalogStatusDialog
          item={changing}
          endpoint="/services"
          close={() => setChanging(null)}
          saved={saved}
        />
      )}
    </>
  );
}
