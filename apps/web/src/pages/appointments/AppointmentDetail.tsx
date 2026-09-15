import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import { formatPrice } from '../services/types';
import { canFor, statusNames, type Detail, type Status } from './types';
const next: Record<Status, Status[]> = {
  SCHEDULED: ['CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['SCHEDULED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
  ARRIVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};
export function AppointmentDetail({
  id,
  permissions,
  membershipId,
  close,
  edit,
  saved,
}: {
  id: string;
  permissions: string[];
  membershipId: string;
  close: () => void;
  edit: (a: Detail) => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const detail = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api<Detail>(`/appointments/${id}`),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const a = detail.data;
  const available =
    a && !a.visit
      ? next[a.status].filter((s) =>
          canFor(
            permissions,
            membershipId,
            a.professional,
            s === 'CANCELLED' ? 'excluir' : 'editar',
          ),
        )
      : [];
  const date = (v: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: a!.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(v));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!a) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: a.version,
          status: data.get('status'),
          reason: data.get('reason'),
        }),
      });
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Detalhes do agendamento" busy={busy} close={close}>
      {detail.isPending || detail.isFetching ? (
        <p>Carregando agendamento…</p>
      ) : detail.isError ? (
        <>
          <p className="error" role="alert">
            {detail.error.message}
          </p>
          <button className="button" onClick={() => detail.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : (
        a && (
          <>
            <h3>{a.client.name}</h3>
            <p>
              {a.professional.name} · {a.location.name}
            </p>
            <p>
              {date(a.startsAt)} até {date(a.endsAt)}
            </p>
            <p className="muted">{a.timezone}</p>
            <span className={`appointment-status status-${a.status}`}>{statusNames[a.status]}</span>
            <ul className="appointment-services">
              {a.services.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.durationMinutes} min · {formatPrice(s.price)}
                </li>
              ))}
            </ul>
            <p>
              <strong>Total previsto: {formatPrice(a.total)}</strong>
            </p>
            {a.notes && <p className="appointment-notes">{a.notes}</p>}
            {!a.visit && !['CANCELLED', 'NO_SHOW'].includes(a.status) && (
              <div className="panel">
                <p>
                  Concluir na agenda registra o serviço realizado. Para lançar o valor no
                  financeiro, abra uma comanda, use “Trazer da agenda” e confirme o pagamento em
                  dinheiro, crédito, débito ou PIX.
                </p>
                {permissions.some((p) =>
                  ['comandas.visualizar_todas', 'comandas.visualizar_proprias'].includes(p),
                ) && (
                  <Link
                    className="button primary"
                    to={`/comandas?clientId=${a.clientId}`}
                    onClick={close}
                  >
                    Ir para as comandas do cliente
                  </Link>
                )}
              </div>
            )}

            {a.visit && (
              <p className="muted">
                Este agendamento está vinculado a uma comanda. Acompanhe os serviços na tela
                Atendimentos.
              </p>
            )}
            {!a.visit &&
              canFor(permissions, membershipId, a.professional, 'editar') &&
              ['SCHEDULED', 'CONFIRMED'].includes(a.status) && (
                <button disabled={busy} className="button" onClick={() => edit(a)}>
                  Remarcar ou editar
                </button>
              )}
            {available.length > 0 && (
              <form onSubmit={submit}>
                <fieldset className="access-fields" disabled={busy}>
                  <label>
                    Novo status
                    <select name="status" required defaultValue="">
                      <option value="">Selecione</option>
                      {available.map((s) => (
                        <option key={s} value={s}>
                          {statusNames[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Motivo da alteração (opcional)
                    <textarea name="reason" maxLength={500} rows={2} />
                  </label>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="button primary">
                    {busy ? 'Salvando…' : 'Atualizar status'}
                  </button>
                </fieldset>
              </form>
            )}
            <details>
              <summary>Histórico do agendamento (últimas 50 alterações)</summary>
              <ol className="appointment-history">
                {a.history.map((h) => (
                  <li key={h.id}>
                    <strong>
                      {date(h.createdAt)} · {h.actor.user.name}
                    </strong>
                    <p>
                      {h.action === 'AGENDAMENTO_CRIADO'
                        ? 'Criação'
                        : h.action === 'AGENDAMENTO_ALTERADO'
                          ? 'Edição'
                          : h.action === 'AGENDAMENTO_CANCELADO'
                            ? 'Cancelamento'
                            : 'Mudança de status'}{' '}
                      {h.reason ? `· ${h.reason}` : ''}
                    </p>
                    {h.toStatus && h.fromStatus !== h.toStatus && (
                      <p className="muted">
                        {h.fromStatus ? statusNames[h.fromStatus] + ' → ' : ''}
                        {statusNames[h.toStatus]}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </>
        )
      )}
    </Dialog>
  );
}
