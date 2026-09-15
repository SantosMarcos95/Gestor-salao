import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import type { Role, Permission } from './types';

export function RoleDialog({
  role,
  catalog,
  own,
  close,
  saved,
}: {
  role: Role | null;
  catalog: Permission[];
  own: string[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(role?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api(`/access/roles${role ? '/' + role.id : ''}`, {
        method: role ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          permissions: selected,
          reason: data.get('reason'),
          ...(role ? { revision: role.revision } : {}),
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
    <Dialog title={role ? role.name : 'Novo perfil'} busy={busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy || role?.protected}>
          <label>
            Nome do perfil
            <input
              name="name"
              defaultValue={role?.name}
              minLength={2}
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <p className="muted">
            Selecione as ações permitidas. As permissões de módulos futuros terão efeito quando eles
            estiverem disponíveis.
          </p>
          <fieldset className="access-options permission-list">
            <legend>Permissões do perfil</legend>
            {catalog.map((p) => (
              <label className="access-check" key={p.code}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.code)}
                  disabled={!own.includes(p.code)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, p.code]
                        : selected.filter((code) => code !== p.code),
                    )
                  }
                />
                {p.description}
              </label>
            ))}
          </fieldset>
          {!role?.protected && (
            <>
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
                <button className="button" type="button" onClick={close}>
                  Cancelar
                </button>
                <button className="button primary">{busy ? 'Salvando…' : 'Salvar perfil'}</button>
              </div>
            </>
          )}
        </fieldset>
        {role?.protected && (
          <button className="button" type="button" onClick={close}>
            Fechar
          </button>
        )}
      </form>
    </Dialog>
  );
}
