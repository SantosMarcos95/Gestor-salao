import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { OptionPicker } from '../appointments/OptionPicker';
import { useCommand } from './useCommand';
import type { Option, Order } from './types';
export function OrderCreateDialog({
  close,
  created,
}: {
  close: () => void;
  created: (id: string) => void;
}) {
  const [client, setClient] = useState<Option | null>(null);
  const command = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    const form = new FormData(e.currentTarget);
    const result = await command.send<Order>('/orders', {
      clientId: client.id,
      notes: form.get('notes'),
      reason: form.get('reason'),
    });
    if (result) created(result.id);
  }
  return (
    <Dialog title="Abrir comanda" busy={command.busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={command.busy}>
          <OptionPicker
            label="Buscar cliente da comanda"
            endpoint="/orders/options/clients"
            selected={client?.id}
            choose={setClient}
          />
          {client && (
            <p>
              Cliente selecionado: <strong>{client.name}</strong>
            </p>
          )}
          <label>
            Observações
            <textarea name="notes" rows={2} maxLength={2000} />
          </label>
          <label>
            Motivo (opcional)
            <textarea name="reason" rows={2} maxLength={500} />
          </label>
          {command.error && (
            <p className="error" role="alert">
              {command.error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Cancelar
            </button>
            <button className="button primary" disabled={!client}>
              {command.busy ? 'Abrindo…' : 'Abrir comanda'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
