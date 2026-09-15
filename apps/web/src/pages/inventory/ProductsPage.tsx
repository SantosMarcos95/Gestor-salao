import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, History, ArrowDownUp } from 'lucide-react';
import { api, type Page } from '../../lib/api';
import { CatalogFilters } from '../../components/CatalogFilters';
import { CatalogStatusDialog } from '../../components/CatalogStatusDialog';
import { Pagination } from '../../components/Pagination';
import { ProductDialog } from './ProductDialog';
import { MovementDialog } from './MovementDialog';
import { HistoryDialog } from './HistoryDialog';
import { quantity, capabilities, type Product } from './types';

export function ProductsPage({ permissions }: { permissions: string[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [changing, setChanging] = useState<Product | null>(null);
  const [moving, setMoving] = useState<Product | null>(null);
  const [history, setHistory] = useState<Product | null>(null);
  const canStock = permissions.includes('estoque.visualizar');
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['products', search, status, page],
    queryFn: () =>
      api<Page<Product>>(
        `/products?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
      ),
  });
  async function saved() {
    setEditing(null);
    setChanging(null);
    setMoving(null);
    setNotice('Produto salvo. Alteração registrada na auditoria.');
    await Promise.all(
      ['products', 'stock-history', 'audit'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATÁLOGO DO SALÃO</span>
          <h1>Produtos e estoque</h1>
          <p className="muted">
            Acompanhe o estoque compartilhado do salão, embalagens e reposições.
          </p>
        </div>
        {permissions.includes('produtos.criar') && (
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            Novo produto
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
          <p className="empty">Carregando produtos…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.items.length ? (
          <p className="empty">Nenhum produto encontrado neste filtro.</p>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>PRODUTO</th>
                  <th>UNIDADE</th>
                  {canStock && <th>SALDO / MÍNIMO</th>}
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Produto">
                      <strong>{s.name}</strong>
                    </td>
                    <td data-label="Unidade">{s.baseUnit}</td>
                    {canStock && (
                      <td data-label="Saldo / mínimo">
                        {quantity(s.balance ?? '0')} / {quantity(s.minimum)} {s.baseUnit}
                        {s.belowMinimum && (
                          <small className="stock-warning">Reposição necessária</small>
                        )}
                      </td>
                    )}
                    <td data-label="Status">{s.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="row-actions">
                      {canStock && (
                        <button
                          className="icon-button"
                          aria-label={`Histórico de ${s.name}`}
                          onClick={() => setHistory(s)}
                        >
                          <History size={18} />
                        </button>
                      )}
                      {canStock &&
                        s.active &&
                        Object.values(capabilities).some((c) => permissions.includes(c)) && (
                          <button
                            className="icon-button"
                            aria-label={`Movimentar ${s.name}`}
                            onClick={() => setMoving(s)}
                          >
                            <ArrowDownUp size={18} />
                          </button>
                        )}
                      {permissions.includes('produtos.editar') && (
                        <button
                          className="icon-button"
                          aria-label={`Editar produto ${s.name}`}
                          onClick={() => setEditing(s)}
                        >
                          <Pencil size={18} />
                        </button>
                      )}
                      {permissions.includes('produtos.desativar') && (
                        <button
                          className="icon-button"
                          aria-label={`${s.active ? 'Desativar' : 'Ativar'} produto ${s.name}`}
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
      {moving && (
        <MovementDialog
          product={moving}
          permissions={permissions}
          close={() => setMoving(null)}
          saved={saved}
        />
      )}
      {history && <HistoryDialog product={history} close={() => setHistory(null)} />}
      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}{' '}
      {changing && (
        <CatalogStatusDialog
          item={changing}
          endpoint="/products"
          close={() => setChanging(null)}
          saved={saved}
        />
      )}
    </>
  );
}
