import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import type { Service } from './types';

export function ServiceDialog({
  service,
  close,
  saved,
}: {
  service: Service | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const price = String(data.get('price')).trim().replace(',', '.');
    if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(price)) {
      setError(
        'Informe o preço sem separador de milhar e com até duas casas decimais, como 85,50.',
      );
      return;
    }
    setBusy(true);
    try {
      await api(`/services${service ? '/' + service.id : ''}`, {
        method: service ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          description: data.get('description'),
          durationMinutes: Number(data.get('durationMinutes')),
          price,
          reason: data.get('reason'),
          ...(service ? { version: service.version } : {}),
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
    <Dialog title={service ? 'Editar serviço' : 'Novo serviço'} busy={busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Nome do serviço
            <input
              name="name"
              defaultValue={service?.name}
              required
              minLength={2}
              maxLength={150}
              autoFocus
            />
          </label>
          <label>
            Descrição
            <textarea
              name="description"
              defaultValue={service?.description ?? ''}
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className="form-grid">
            <label>
              Duração em minutos
              <input
                name="durationMinutes"
                type="number"
                required
                min={1}
                max={1440}
                step={1}
                defaultValue={service?.durationMinutes ?? 30}
              />
            </label>
            <label>
              Preço em reais
              <input
                name="price"
                inputMode="decimal"
                required
                maxLength={15}
                placeholder="85,50"
                defaultValue={service?.price.replace('.', ',') ?? ''}
                aria-describedby="price-help"
              />
            </label>
          </div>
          <p id="price-help" className="muted">
            Informe o preço sem separador de milhar. Exemplo: 1250,00. A duração deve ser de 1 a
            1440 minutos.
          </p>
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
            <button className="button primary">{busy ? 'Salvando…' : 'Salvar serviço'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
