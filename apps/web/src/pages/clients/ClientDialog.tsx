import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Client } from '../../lib/api';
import { X } from 'lucide-react';

export function ClientDialog({
  client,
  close,
  saved,
}: {
  client: Client | null;
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
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/clients${client ? '/' + client.id : ''}`, {
        method: client ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...data,
          birthDate: data.birthDate || null,
          ...(client ? { version: client.version } : {}),
        }),
      });
      await saved(client ? 'Cadastro atualizado.' : 'Cliente cadastrado.');
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
      aria-labelledby="client-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">CADASTRO</span>
          <h2 id="client-title">{client ? 'Editar cliente' : 'Uma nova história'}</h2>
        </div>
        <button className="icon-button" aria-label="Fechar" onClick={close} disabled={busy}>
          <X />
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Nome completo *
          <input
            name="name"
            defaultValue={client?.name}
            minLength={2}
            maxLength={150}
            required
            autoFocus
            autoComplete="name"
          />
        </label>
        <div className="form-grid">
          <label>
            Telefone
            <input
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={client?.phone ?? ''}
              autoComplete="tel"
            />
          </label>
          <label>
            WhatsApp
            <input
              name="whatsapp"
              type="tel"
              maxLength={30}
              defaultValue={client?.whatsapp ?? ''}
            />
          </label>
        </div>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            maxLength={254}
            defaultValue={client?.email ?? ''}
            autoComplete="email"
          />
        </label>
        <label>
          Data de nascimento
          <input
            name="birthDate"
            type="date"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={client?.birthDate?.slice(0, 10) ?? ''}
          />
        </label>
        <label>
          Observações
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={client?.notes ?? ''}
            placeholder="Preferências e informações úteis para o atendimento"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar cliente'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
