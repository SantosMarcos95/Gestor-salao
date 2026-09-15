import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Client } from '../../lib/api';

export function ArchiveDialog({
  client,
  close,
  saved,
}: {
  client: Client;
  close: () => void;
  saved: (message: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api(`/clients/${client.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: client.version, reason: data.get('reason') }),
      });
      await saved('Cliente arquivado. O histórico foi preservado.');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="archive-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <h2 id="archive-title">Arquivar {client.name}?</h2>
      <p className="muted">
        O cadastro sairá da lista. As informações e o histórico serão preservados.
      </p>
      <form onSubmit={submit}>
        <label>
          Motivo do arquivamento
          <textarea name="reason" minLength={5} maxLength={500} required autoFocus rows={3} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={close} disabled={busy}>
            Voltar
          </button>
          <button className="button destructive" disabled={busy}>
            {busy ? 'Arquivando…' : 'Arquivar cliente'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
