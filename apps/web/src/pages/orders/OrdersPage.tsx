import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { formatPrice } from '../services/types';
import { OrderCreateDialog } from './OrderCreateDialog';
import { orderStates, type Order } from './types';
export function OrdersPage({ permissions }: { permissions: string[] }) {
  const [params] = useSearchParams(),
    clientId = params.get('clientId');
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(clientId ? 'all' : 'OPEN'),
    [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ['orders', search, page, status, clientId, permissions.join(',')],
    queryFn: () =>
      api<Page<Order>>(
        `/orders?search=${encodeURIComponent(search)}&page=${page}&status=${status}${clientId ? '&clientId=' + encodeURIComponent(clientId) : ''}`,
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ATENDIMENTO DO SALÃO</span>
          <h1>{clientId ? 'Comandas do cliente' : 'Comandas'}</h1>
          <p className="muted">Reúna os serviços do cliente e acompanhe os valores.</p>
        </div>
        {permissions.includes('comandas.abrir') &&
          permissions.includes('clientes.visualizar_todos') && (
            <button className="button primary" onClick={() => setCreating(true)}>
              Abrir comanda
            </button>
          )}
      </div>
      {clientId && (
        <p>
          <Link to="/comandas">Ver todas as comandas</Link>
        </p>
      )}
      <section className="panel table-panel">
        <div className="order-filters">
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
            Status da comanda
            <select
              aria-label="Status da comanda"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todas</option>
              {Object.entries(orderStates).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" onClick={() => list.refetch()}>
            Atualizar
          </button>
        </div>
        {list.isPending ? (
          <p className="empty">Carregando comandas…</p>
        ) : list.isError ? (
          <div className="empty">
            <p className="error" role="alert">
              {list.error.message}
            </p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.items.length ? (
          <p className="empty">Nenhuma comanda encontrada.</p>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>ABERTURA</th>
                  <th>STATUS</th>
                  <th>TOTAL</th>
                  <th>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Cliente">
                      <strong>{o.clientName}</strong>
                    </td>
                    <td data-label="Abertura">{new Date(o.createdAt).toLocaleString('pt-BR')}</td>
                    <td data-label="Status">{orderStates[o.status]}</td>
                    <td data-label="Total">{formatPrice(o.total)}</td>
                    <td className="row-actions">
                      <Link className="button" to={`/comandas/${o.id}`}>
                        Ver comanda
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
      </section>
      {creating && (
        <OrderCreateDialog
          close={() => setCreating(false)}
          created={(id) => navigate(`/comandas/${id}`)}
        />
      )}
    </>
  );
}
