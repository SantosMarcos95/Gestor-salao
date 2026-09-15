import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../../components/Dialog';
import { Pagination } from '../../components/Pagination';
import { api, type Page } from '../../lib/api';
import { kinds, quantity, type Product, type Movement } from './types';
export function HistoryDialog({ product, close }: { product: Product; close: () => void }) {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['stock-history', product.id, page],
    queryFn: () => api<Page<Movement>>(`/products/${product.id}/movements?page=${page}`),
  });
  return (
    <Dialog title={`Histórico de ${product.name}`} close={close} busy={false}>
      {list.isPending ? (
        <p>Carregando movimentações…</p>
      ) : list.isError ? (
        <>
          <p className="error" role="alert">
            {list.error.message}
          </p>
          <button className="button" onClick={() => list.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : !list.data.items.length ? (
        <p>Nenhuma movimentação registrada.</p>
      ) : (
        <div className="inventory-history">
          {list.data.items.map((m) => (
            <article key={m.id} className="inventory-package">
              <strong>
                {m.consumption ? 'Consumo em atendimento' : kinds[m.kind]} · {quantity(m.delta)}{' '}
                {m.baseUnit}
              </strong>
              <p className="muted">{new Date(m.createdAt).toLocaleString('pt-BR')}</p>
              <p>
                Saldo: {quantity(m.balanceBefore)} → {quantity(m.balanceAfter)} {m.baseUnit}
              </p>
              {m.packageSnapshot && (
                <p>
                  {quantity(m.packageSnapshot.count)} × {m.packageSnapshot.name} (
                  {quantity(m.packageSnapshot.quantity)} {m.packageSnapshot.unit})
                </p>
              )}
              {m.supplierName && <p>Fornecedor: {m.supplierName}</p>}
              {m.unitCost != null && (
                <p>
                  Custo por {m.baseUnit}: R$ {quantity(m.unitCost)}
                </p>
              )}
              <p>{m.reason}</p>
            </article>
          ))}
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
      <div className="dialog-actions">
        <button className="button" onClick={close}>
          Fechar
        </button>
      </div>
    </Dialog>
  );
}
