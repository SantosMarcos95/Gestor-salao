import { formatPrice } from '../services/types';
import { quantity } from '../inventory/types';
import type { Profile } from '../../lib/api';
import { visitStates, type Visit } from './types';
import type { Action } from './ActionDialog';
export function VisitCard({
  visit: v,
  profile,
  canEditOrder = false,
  act,
}: {
  visit: Visit;
  profile: Profile;
  canEditOrder?: boolean;
  act: (action: Action, visit: Visit) => void;
}) {
  const can = (p: string) => profile.permissions.includes(p),
    own = v.professional.membershipId === profile.membershipId,
    open = v.order.status === 'OPEN';
  const start =
    can('atendimentos.iniciar_qualquer') || (own && can('atendimentos.iniciar_proprio'));
  const complete =
    can('atendimentos.concluir_qualquer') || (own && can('atendimentos.concluir_proprio'));
  const consume =
    can('atendimentos.registrar_consumo') &&
    (own || can('atendimentos.iniciar_qualquer') || can('atendimentos.concluir_qualquer'));
  return (
    <article className="panel visit-card">
      <div>
        <span className="eyebrow">{visitStates[v.status]}</span>
        <h3>{v.professionalName}</h3>
        <p>
          {v.order.clientName}
          {v.appointmentId ? ' · Veio da agenda' : ''}
        </p>
      </div>
      <ul className="appointment-services">
        {v.items.map((i) => (
          <li key={i.id}>
            {i.name} · {i.durationMinutes} min · {formatPrice(i.price)}
          </li>
        ))}
      </ul>
      <p>
        <strong>Serviços: {formatPrice(v.total)}</strong>
      </p>
      {v.consumptions.length > 0 && (
        <details>
          <summary>Consumos registrados ({v.consumptions.length})</summary>
          {v.consumptions.map((c) => (
            <p key={c.id}>
              {c.productName}: {quantity(c.quantity)} {c.baseUnit}
              {c.unitCost != null
                ? ` · Custo de referência: R$ ${quantity(c.unitCost)}/${c.baseUnit}`
                : ''}
            </p>
          ))}
        </details>
      )}
      {open && (
        <div className="visit-actions">
          {v.status === 'WAITING' && start && (
            <button className="button primary" onClick={() => act('start', v)}>
              Iniciar atendimento
            </button>
          )}
          {v.status === 'IN_PROGRESS' && consume && (
            <button className="button" onClick={() => act('consume', v)}>
              Registrar consumo
            </button>
          )}
          {v.status === 'IN_PROGRESS' && complete && (
            <button className="button primary" onClick={() => act('complete', v)}>
              Concluir atendimento
            </button>
          )}
          {canEditOrder &&
            can('comandas.editar') &&
            can('comandas.alterar_preco') &&
            ['WAITING', 'IN_PROGRESS'].includes(v.status) && (
              <button className="button" onClick={() => act('prices', v)}>
                Editar valores
              </button>
            )}
          {canEditOrder && can('comandas.cancelar') && v.status !== 'CANCELLED' && (
            <button className="button" onClick={() => act('cancelVisit', v)}>
              Cancelar atendimento
            </button>
          )}
        </div>
      )}
    </article>
  );
}
