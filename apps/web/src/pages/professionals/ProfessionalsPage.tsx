import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { api, type Page } from '../../lib/api';
import { CatalogFilters } from '../../components/CatalogFilters';
import { CatalogStatusDialog } from '../../components/CatalogStatusDialog';
import { Pagination } from '../../components/Pagination';
import { ProfessionalDialog } from './ProfessionalDialog';
import type { Professional } from './types';

export function ProfessionalsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Professional | 'new' | null>(null);
  const [changing, setChanging] = useState<Professional | null>(null);
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['professionals', search, status, page],
    queryFn: () =>
      api<Page<Professional>>(
        `/professionals?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
      ),
  });
  async function saved() {
    setEditing(null);
    setChanging(null);
    setNotice('Profissional salvo. Alteração registrada na auditoria.');
    await Promise.all(
      ['professionals', 'professional-users', 'audit'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EQUIPE DO SALÃO</span>
          <h1>Profissionais</h1>
          <p className="muted">Mantenha os contatos e as especialidades da sua equipe.</p>
        </div>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={18} />
          Novo profissional
        </button>
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
          <p className="empty">Carregando profissionais…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.items.length ? (
          <p className="empty">Nenhum profissional encontrado neste filtro.</p>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>PROFISSIONAL</th>
                  <th>CONTATO</th>
                  <th>USUÁRIO VINCULADO</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Profissional">
                      <strong>{p.name}</strong>
                      <small>{p.specialty}</small>
                    </td>
                    <td data-label="Contato">
                      {p.phone || 'Não informado'}
                      <small>{p.email}</small>
                    </td>
                    <td data-label="Usuário vinculado">
                      {p.membership?.user.name ?? 'Sem vínculo'}
                      {p.membership &&
                        (!p.membership.active || p.membership.user.status !== 'ACTIVE') && (
                          <small>Acesso do usuário inativo</small>
                        )}
                    </td>
                    <td data-label="Status">{p.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Editar profissional ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`${p.active ? 'Desativar' : 'Ativar'} profissional ${p.name}`}
                        onClick={() => setChanging(p)}
                      >
                        <Power size={18} />
                      </button>
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
        <ProfessionalDialog
          professional={editing === 'new' ? null : editing}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}{' '}
      {changing && (
        <CatalogStatusDialog
          item={changing}
          endpoint="/professionals"
          close={() => setChanging(null)}
          saved={saved}
        />
      )}
    </>
  );
}
