import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import { Pagination } from '../../components/Pagination';
import type { ProfessionalOption } from './AvailabilityPage';
type Block = {
  id: string;
  startsAt: string;
  endsAt: string;
  description: string;
  cancelledAt: string | null;
  version: number;
};
export function BlocksDialog({
  professional,
  close,
}: {
  professional: ProfessionalOption;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('active');
  const [cancelling, setCancelling] = useState<Block | null>(null);
  const cache = useQueryClient();
  const endpoint = `/availability/${professional.id}/blocks`;
  const list = useQuery({
    queryKey: ['blocks', professional.id, page, status],
    queryFn: () =>
      api<Page<Block> & { timezone: string }>(`${endpoint}?page=${page}&status=${status}`),
  });
  const date = (v: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: list.data!.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(v));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(cancelling ? `${endpoint}/${cancelling.id}/cancel` : endpoint, {
        method: cancelling ? 'PATCH' : 'POST',
        body: JSON.stringify(
          cancelling
            ? { version: cancelling.version, reason: data.get('reason') }
            : {
                startLocal: data.get('start'),
                endLocal: data.get('end'),
                description: data.get('description'),
                reason: data.get('reason'),
              },
        ),
      });
      setNotice(cancelling ? 'Bloqueio cancelado.' : 'Bloqueio criado.');
      setCancelling(null);
      form.reset();
      await Promise.all(
        ['blocks', 'audit'].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Bloqueios · ${professional.name}`} busy={busy} close={close}>
      {list.isPending ? (
        <p>Carregando bloqueios…</p>
      ) : list.isError ? (
        <>
          <p className="error" role="alert">
            {list.error.message}
          </p>
          <button className="button" onClick={() => list.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Horários em {list.data.timezone}. Use bloqueios para férias, ausências ou compromissos.
            Para corrigir um período, cancele e cadastre novamente.
          </p>
          <form key={cancelling?.id ?? 'new'} onSubmit={submit}>
            <fieldset className="access-fields" disabled={busy}>
              <h3>{cancelling ? `Cancelar: ${cancelling.description}` : 'Novo bloqueio'}</h3>
              {!cancelling && (
                <>
                  <label>
                    Descrição
                    <input name="description" required minLength={2} maxLength={200} />
                  </label>
                  <div className="form-grid">
                    <label>
                      Início do bloqueio
                      <input
                        type="datetime-local"
                        name="start"
                        min="1900-01-01T00:00"
                        max="2100-12-31T23:59"
                        required
                      />
                    </label>
                    <label>
                      Fim do bloqueio
                      <input
                        type="datetime-local"
                        name="end"
                        min="1900-01-01T00:00"
                        max="2100-12-31T23:59"
                        required
                      />
                    </label>
                  </div>
                </>
              )}
              <label>
                Motivo da alteração
                <textarea name="reason" required minLength={5} maxLength={500} rows={2} />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                {cancelling && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setCancelling(null);
                      setError('');
                    }}
                  >
                    Voltar
                  </button>
                )}
                <button className="button primary">
                  {busy ? 'Salvando…' : cancelling ? 'Confirmar cancelamento' : 'Criar bloqueio'}
                </button>
              </div>
            </fieldset>
          </form>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <label>
            Exibir bloqueios
            <select
              disabled={busy}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="active">Não cancelados</option>
              <option value="inactive">Cancelados</option>
              <option value="all">Todos</option>
            </select>
          </label>
          {!list.data.items.length && <p className="empty">Nenhum bloqueio neste filtro.</p>}
          <div className="availability-list">
            {list.data.items.map((b) => (
              <article className="availability-person" key={b.id}>
                <div>
                  <strong>{b.description}</strong>
                  <p>
                    {date(b.startsAt)} até {date(b.endsAt)}
                  </p>
                  {b.cancelledAt && <span className="muted">Cancelado</span>}
                </div>
                {!b.cancelledAt && (
                  <button
                    disabled={busy}
                    type="button"
                    className="button"
                    onClick={() => {
                      setCancelling(b);
                      setError('');
                      setNotice('');
                    }}
                    aria-label={`Cancelar bloqueio ${b.description}`}
                  >
                    Cancelar bloqueio
                  </button>
                )}
              </article>
            ))}
          </div>
          <Pagination page={page} total={list.data.total} onPage={setPage} />
        </>
      )}
    </Dialog>
  );
}
