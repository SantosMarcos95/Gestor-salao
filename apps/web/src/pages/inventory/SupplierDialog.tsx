import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import type { Supplier } from './types';
export function SupplierDialog({
  supplier,
  close,
  saved,
}: {
  supplier: Supplier | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      await api(`/suppliers${supplier ? '/' + supplier.id : ''}`, {
        method: supplier ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          phone: data.get('phone'),
          email: data.get('email'),
          notes: data.get('notes'),
          reason: data.get('reason'),
          ...(supplier ? { version: supplier.version } : {}),
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
    <Dialog title={supplier ? 'Editar fornecedor' : 'Novo fornecedor'} close={close} busy={busy}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Nome do fornecedor
            <input
              name="name"
              defaultValue={supplier?.name}
              required
              minLength={2}
              maxLength={150}
              autoFocus
            />
          </label>
          <label>
            Telefone
            <input name="phone" type="tel" defaultValue={supplier?.phone ?? ''} maxLength={30} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" defaultValue={supplier?.email ?? ''} maxLength={254} />
          </label>
          <label>
            Observações
            <textarea name="notes" defaultValue={supplier?.notes ?? ''} maxLength={2000} rows={2} />
          </label>
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
            <button className="button primary">{busy ? 'Salvando…' : 'Salvar fornecedor'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
