import { useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import { formatPrice } from '../services/types';
import { OptionPicker } from './OptionPicker';
import {
  localDateTime,
  type Appointment,
  type Context,
  type Option,
  type Professional,
  type ServiceOption,
} from './types';
export function AppointmentDialog({
  appointment,
  permissions,
  context,
  date,
  close,
  saved,
}: {
  appointment: Appointment | null;
  permissions: string[];
  context: Context;
  date: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [professional, setProfessional] = useState<Professional | null>(
    appointment?.professional ?? null,
  );
  const [client, setClient] = useState<Option | null>(appointment?.client ?? null);
  const [services, setServices] = useState<ServiceOption[]>(
    appointment?.services.map((s) => ({ ...s, id: s.serviceId })) ?? [],
  );
  const [prices, setPrices] = useState<Record<string, string>>({});
  const canPrice = permissions.includes('comandas.alterar_preco');
  const normalizedPrice = (s: ServiceOption) => {
    const value = (prices[s.id] ?? s.price).trim().replace(',', '.');
    if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  };
  const invalidPrice = services.some((s) => normalizedPrice(s) === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef({ body: '', key: crypto.randomUUID() });
  const action = appointment ? 'editar' : 'criar';
  const duration = services.reduce((n, s) => n + s.durationMinutes, 0);
  const cents = services.reduce(
    (n, s) => n + BigInt((normalizedPrice(s) ?? '0.00').replace('.', '')),
    0n,
  );
  const total = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!professional || !client || !services.length) {
      setError('Selecione profissional, cliente e pelo menos um serviço.');
      return;
    }
    if (invalidPrice) {
      setError('Informe valores válidos, sem separador de milhar e com até duas casas decimais.');
      return;
    }
    const form = new FormData(e.currentTarget);
    const data = {
      professionalId: professional.id,
      clientId: client.id,
      locationId: form.get('location'),
      startLocal: form.get('start'),
      serviceIds: services.map((s) => s.id),
      ...(canPrice
        ? {
            servicePrices: services
              .filter((s) => prices[s.id] !== undefined && normalizedPrice(s) !== s.price)
              .map((s) => ({ serviceId: s.id, price: normalizedPrice(s)! })),
          }
        : {}),
      notes: form.get('notes'),
      reason: form.get('reason'),
    };
    const serialized = JSON.stringify(data);
    if (request.current.body !== serialized)
      request.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(true);
    try {
      await api(`/appointments${appointment ? '/' + appointment.id : ''}`, {
        method: appointment ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...data,
          ...(appointment ? { version: appointment.version } : { requestKey: request.current.key }),
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
      title={appointment ? 'Remarcar agendamento' : 'Novo agendamento'}
      busy={busy}
      close={close}
    >
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <p className="muted">
            Horários em {context.timezone}. O término é calculado pela duração dos serviços.
          </p>
          <details open={!professional}>
            <summary>Profissional: {professional?.name ?? 'selecionar'}</summary>
            <OptionPicker<Professional>
              label="Buscar profissional"
              endpoint={`/appointments/context?action=${action}`}
              selected={professional?.id}
              disabled={busy}
              choose={(p) => {
                if (p.id !== professional?.id) {
                  setServices([]);
                  setPrices({});
                }
                setProfessional(p);
              }}
            />
          </details>
          <details open={!client}>
            <summary>Cliente: {client?.name ?? 'selecionar'}</summary>
            <OptionPicker<Option>
              label="Buscar cliente para agendamento"
              endpoint={`/appointments/clients?action=${action}`}
              selected={client?.id}
              disabled={busy}
              choose={setClient}
            />
          </details>
          <label>
            Unidade
            <select
              name="location"
              required
              defaultValue={appointment?.locationId ?? context.locations[0]?.id ?? ''}
            >
              <option value="">Selecione</option>
              {context.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início do agendamento
            <input
              name="start"
              type="datetime-local"
              required
              min="1900-01-01T00:00"
              max="2100-12-24T23:59"
              defaultValue={
                appointment
                  ? localDateTime(appointment.startsAt, context.timezone)
                  : `${date}T09:00`
              }
            />
          </label>
          <h3>Serviços ({services.length}/20)</h3>
          {!services.length && (
            <p className="muted">Selecione os serviços na ordem em que serão realizados.</p>
          )}
          {canPrice && (
            <p className="muted">
              Edite o valor para este agendamento. O preço no cadastro do serviço permanece o mesmo.
            </p>
          )}
          <div className="user-options">
            {services.map((s) => (
              <div className="agenda-service" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>
                    {s.durationMinutes} min · Valor original: {formatPrice(s.price)}
                  </p>
                </div>
                {canPrice && (
                  <label>
                    Valor de {s.name} (R$)
                    <input
                      inputMode="decimal"
                      required
                      maxLength={15}
                      value={prices[s.id] ?? s.price.replace('.', ',')}
                      onChange={(e) => setPrices({ ...prices, [s.id]: e.target.value })}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="button"
                  aria-label={`Remover ${s.name}`}
                  onClick={() => setServices(services.filter((v) => v.id !== s.id))}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          {professional && (
            <details>
              <summary>Adicionar serviços</summary>
              <p className="muted">
                Aqui aparecem os serviços ativos vinculados a {professional.name}. Configure os
                serviços realizados em Disponibilidade → Serviços do profissional.
              </p>
              <OptionPicker<ServiceOption>
                key={professional.id}
                label="Buscar serviço para agendamento"
                emptyMessage={`Nenhum serviço encontrado para ${professional.name} nesta busca. Confira o nome e se o serviço está ativo e selecionado em Disponibilidade → Serviços do profissional.`}
                endpoint={`/appointments/services?professionalId=${professional.id}&action=${action}`}
                disabled={busy || services.length >= 20}
                choose={(s) => {
                  if (!services.some((v) => v.id === s.id)) {
                    const original = appointment?.services.find((v) => v.serviceId === s.id);
                    setServices([
                      ...services,
                      original ? { ...original, id: original.serviceId } : s,
                    ]);
                  }
                }}
              />
            </details>
          )}
          <p>
            <strong>
              {duration} minutos ·{' '}
              {invalidPrice ? 'Revise os valores dos serviços' : formatPrice(total)}
            </strong>
          </p>
          {appointment && (
            <p className="muted">
              Os valores são mantidos ao remarcar, a menos que você os edite. A duração permanece a
              mesma.
            </p>
          )}
          <label>
            Observações do agendamento
            <textarea
              name="notes"
              maxLength={2000}
              rows={2}
              defaultValue={appointment?.notes ?? ''}
            />
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
          <div className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Cancelar
            </button>
            <button className="button primary" disabled={duration > 1440 || invalidPrice}>
              {busy ? 'Salvando…' : 'Salvar agendamento'}
            </button>
          </div>
          {duration > 1440 && (
            <p className="error" role="alert">
              A duração total não pode exceder 24 horas.
            </p>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
