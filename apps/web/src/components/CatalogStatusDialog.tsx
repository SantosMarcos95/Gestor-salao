import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Dialog } from './Dialog';

export function CatalogStatusDialog({
  item,
  endpoint,
  close,
  saved,
}: {
  item: { id: string; name: string; active: boolean; version: number };
  endpoint: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const action = item.active ? 'Desativar' : 'Ativar';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api(`${endpoint}/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          active: !item.active,
          version: item.version,
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
    <Dialog title={`${action} ${item.name}?`} busy={busy} close={close}>
      <p className="muted">
        O cadastro e o histórico serão preservados. Você pode alterar o status novamente depois.
      </p>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Motivo da alteração
            <textarea name="reason" required minLength={5} maxLength={500} rows={3} autoFocus />
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
            <button className={`button ${item.active ? 'destructive' : 'primary'}`}>
              {busy ? 'Salvando…' : action}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
