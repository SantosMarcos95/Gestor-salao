import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { api, type Page } from '../../lib/api';
import { CatalogFilters } from '../../components/CatalogFilters';
import { CatalogStatusDialog } from '../../components/CatalogStatusDialog';
import { Pagination } from '../../components/Pagination';
import { SupplierDialog } from './SupplierDialog';
import { type Supplier } from './types';

export function SuppliersPage({ permissions }: { permissions: string[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [changing, setChanging] = useState<Supplier | null>(null);
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['suppliers', search, status, page],
    queryFn: () =>
      api<Page<Supplier>>(
        `/suppliers?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
      ),
  });
  async function saved() {
    setEditing(null);
    setChanging(null);
    setNotice('Fornecedor salvo. Alteração registrada na auditoria.');
    await Promise.all(
      ['suppliers', 'agenda-options', 'audit'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATÁLOGO DO SALÃO</span>
          <h1>Fornecedores</h1>
          <p className="muted">Mantenha os contatos de quem abastece o salão.</p>
        </div>
        {permissions.includes('produtos.criar') && (
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            Novo fornecedor
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
          <p className="empty">Carregando fornecedores…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.items.length ? (
          <p className="empty">Nenhum fornecedor encontrado neste filtro.</p>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>FORNECEDOR</th>
                  <th>TELEFONE</th>
                  <th>E-MAIL</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Fornecedor">
                      <strong>{s.name}</strong>
                    </td>
                    <td data-label="Telefone">{s.phone || '—'}</td>
                    <td data-label="E-mail">{s.email || '—'}</td>
                    <td data-label="Status">{s.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="row-actions">
                      {permissions.includes('produtos.editar') && (
                        <button
                          className="icon-button"
                          aria-label={`Editar fornecedor ${s.name}`}
                          onClick={() => setEditing(s)}
                        >
                          <Pencil size={18} />
                        </button>
                      )}
                      {permissions.includes('produtos.desativar') && (
                        <button
                          className="icon-button"
                          aria-label={`${s.active ? 'Desativar' : 'Ativar'} fornecedor ${s.name}`}
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
        <SupplierDialog
          supplier={editing === 'new' ? null : editing}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}{' '}
      {changing && (
        <CatalogStatusDialog
          item={changing}
          endpoint="/suppliers"
          close={() => setChanging(null)}
          saved={saved}
        />
      )}
    </>
  );
}
