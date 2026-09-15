import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../../components/Dialog';
import { Pagination } from '../../components/Pagination';
import { api, type Page } from '../../lib/api';
import type { Professional, UserOption } from './types';

export function ProfessionalDialog({
  professional,
  close,
  saved,
}: {
  professional: Professional | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<UserOption | null>(professional?.membership ?? null);
  const users = useQuery({
    queryKey: ['professional-users', search, page],
    queryFn: () =>
      api<Page<UserOption>>(
        `/professionals/users?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api(`/professionals${professional ? '/' + professional.id : ''}`, {
        method: professional ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          phone: data.get('phone'),
          email: data.get('email'),
          specialty: data.get('specialty'),
          notes: data.get('notes'),
          membershipId: selected?.id ?? null,
          reason: data.get('reason'),
          ...(professional ? { version: professional.version } : {}),
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
    <Dialog
      title={professional ? 'Editar profissional' : 'Novo profissional'}
      busy={busy}
      close={close}
    >
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Nome do profissional
            <input
              name="name"
              required
              minLength={2}
              maxLength={150}
              defaultValue={professional?.name}
              autoFocus
            />
          </label>
          <div className="form-grid">
            <label>
              Telefone
              <input
                name="phone"
                type="tel"
                maxLength={30}
                defaultValue={professional?.phone ?? ''}
              />
            </label>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                maxLength={254}
                defaultValue={professional?.email ?? ''}
              />
            </label>
          </div>
          <label>
            Especialidade
            <input
              name="specialty"
              maxLength={150}
              defaultValue={professional?.specialty ?? ''}
              placeholder="Ex.: cortes e coloração"
            />
          </label>
          <label>
            Observações
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              defaultValue={professional?.notes ?? ''}
            />
          </label>
          <details>
            <summary>Usuário vinculado: {selected ? selected.user.name : 'nenhum'}</summary>
            <p className="muted">
              O vínculo é opcional e não cria uma conta nem concede permissões. Cada usuário pode
              ser vinculado a um profissional.
            </p>
            <p>
              {selected
                ? `${selected.user.name} · ${selected.user.email}`
                : 'Sem usuário vinculado.'}
            </p>
            {selected && (
              <button type="button" className="button" onClick={() => setSelected(null)}>
                Remover vínculo
              </button>
            )}
            <label>
              Buscar usuário disponível
              <input
                value={search}
                maxLength={150}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {users.isPending ? (
              <p>Carregando usuários…</p>
            ) : users.isError ? (
              <p className="error" role="alert">
                {users.error.message}
                <button type="button" onClick={() => users.refetch()}>
                  Tentar novamente
                </button>
              </p>
            ) : !users.data.items.length ? (
              <p className="muted">Nenhum usuário disponível neste filtro.</p>
            ) : (
              <div className="user-options">
                {users.data.items.map((u) => (
                  <button
                    type="button"
                    className="button"
                    key={u.id}
                    aria-pressed={selected?.id === u.id}
                    onClick={() => setSelected(u)}
                  >
                    {u.user.name} · {u.user.email}
                  </button>
                ))}
              </div>
            )}
            {users.data && <Pagination page={page} total={users.data.total} onPage={setPage} />}
          </details>
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
            <button type="button" className="button" onClick={close}>
              Cancelar
            </button>
            <button className="button primary">{busy ? 'Salvando…' : 'Salvar profissional'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
