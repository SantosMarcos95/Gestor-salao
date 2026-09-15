import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, type Profile } from '../../lib/api';
import { PaymentPanel } from '../finance/PaymentPanel';
import { formatPrice } from '../services/types';
import { ActionDialog, type Action } from './ActionDialog';
import { AddVisitDialog } from './AddVisitDialog';
import { VisitCard } from './VisitCard';
import { auditNames, orderStates, type Order, type Visit } from './types';
export function OrderPage({ profile }: { profile: Profile }) {
  const { id } = useParams();
  const [adding, setAdding] = useState<'new' | 'agenda' | null>(null),
    [action, setAction] = useState<{ type: Action; visit?: Visit } | null>(null);
  const query = useQuery({
    queryKey: ['order', id, profile.permissions.join(',')],
    queryFn: () => api<Order>(`/orders/${id}`),
  });
  const can = (p: string) => profile.permissions.includes(p),
    o = query.data;
  if (query.isPending) return <p>Carregando comanda…</p>;
  if (query.isError)
    return (
      <>
        <p className="error" role="alert">
          {query.error.message}
        </p>
        <button className="button" onClick={() => query.refetch()}>
          Tentar novamente
        </button>
        <Link to="/comandas">Voltar às comandas</Link>
      </>
    );
  if (!o) return null;
  return (
    <>
      <Link to="/comandas">← Comandas</Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{orderStates[o.status]}</span>
          <h1>Comanda de {o.clientName}</h1>
          <p className="muted">Aberta em {new Date(o.createdAt).toLocaleString('pt-BR')}</p>
        </div>
        <button className="button" onClick={() => query.refetch()}>
          Atualizar
        </button>
      </div>
      <section className="panel order-summary">
        <div>
          <span>Serviços</span>
          <strong>{formatPrice(o.subtotal)}</strong>
        </div>
        <div>
          <span>Desconto</span>
          <strong>{formatPrice(o.discount)}</strong>
        </div>
        <div>
          <span>Total da comanda</span>
          <strong>{formatPrice(o.total)}</strong>
        </div>
      </section>
      {o.notes && <p>{o.notes}</p>}
      {o.status === 'OPEN' && (
        <div className="visit-actions">
          {can('comandas.editar') && (
            <button className="button primary" onClick={() => setAdding('new')}>
              Adicionar atendimento
            </button>
          )}
          {can('comandas.editar') &&
            (can('agenda.visualizar_todas') || can('agenda.visualizar_propria')) && (
              <button className="button" onClick={() => setAdding('agenda')}>
                Trazer da agenda
              </button>
            )}
          {can('comandas.editar') && can('comandas.aplicar_desconto') && (
            <button className="button" onClick={() => setAction({ type: 'discount' })}>
              Aplicar desconto
            </button>
          )}
          {can('comandas.fechar') && (
            <button className="button" onClick={() => setAction({ type: 'ready' })}>
              Finalizar serviços
            </button>
          )}
        </div>
      )}
      {o.status === 'READY' && (
        <p className="success" role="status">
          Serviços finalizados. Confira os pagamentos abaixo para receber e quitar a comanda.
        </p>
      )}
      {['OPEN', 'READY'].includes(o.status) && can('comandas.cancelar') && (
        <p>
          <button className="button" onClick={() => setAction({ type: 'cancelOrder' })}>
            Cancelar comanda
          </button>
        </p>
      )}
      {o.status === 'CANCELLED' && (
        <p className="muted">
          Comanda cancelada. Valores e produtos consumidos permanecem no histórico.
        </p>
      )}
      <PaymentPanel
        orderId={o.id}
        permissions={profile.permissions}
        canFinalize={
          o.visits.some((v) => v.status === 'COMPLETED') &&
          o.visits.every((v) => ['COMPLETED', 'CANCELLED'].includes(v.status))
        }
      />
      <div className="visits-grid">
        {!o.visits.length ? (
          <p className="empty panel">
            Adicione um atendimento ou traga os serviços de um agendamento.
          </p>
        ) : (
          o.visits.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              profile={profile}
              canEditOrder
              act={(type, visit) => setAction({ type, visit })}
            />
          ))
        )}
      </div>
      <details className="panel order-history">
        <summary>Histórico da comanda (últimas 50 alterações)</summary>
        {o.history?.map((h) => (
          <p key={h.id}>
            <strong>{auditNames[h.action] ?? h.action}</strong> ·{' '}
            {new Date(h.createdAt).toLocaleString('pt-BR')} · {h.actor.user.name}
            {h.reason ? ` · ${h.reason}` : ''}
          </p>
        ))}
      </details>
      {adding && (
        <AddVisitDialog order={o} fromAgenda={adding === 'agenda'} close={() => setAdding(null)} />
      )}
      {action && (
        <ActionDialog
          action={action.type}
          order={o}
          visit={action.visit}
          close={() => setAction(null)}
        />
      )}
    </>
  );
}
