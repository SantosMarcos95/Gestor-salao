import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { OptionPicker } from '../appointments/OptionPicker';
import { formatPrice } from '../services/types';
import { useCommand } from './useCommand';
import type { Option, Order } from './types';
type Service = Option & { price: string; durationMinutes: number };
export function AddVisitDialog({
  order,
  fromAgenda,
  close,
}: {
  order: Order;
  fromAgenda: boolean;
  close: () => void;
}) {
  const [professional, setProfessional] = useState<Option | null>(null);
  const [appointment, setAppointment] = useState<(Option & { version: number }) | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const command = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = fromAgenda
      ? { appointmentId: appointment?.id, appointmentVersion: appointment?.version }
      : { professionalId: professional?.id, serviceIds: services.map((s) => s.id) };
    const result = await command.send(`/orders/${order.id}/${fromAgenda ? 'import' : 'visits'}`, {
      ...payload,
      version: order.version,
      reason: form.get('reason'),
    });
    if (result) close();
  }
  return (
    <Dialog
      title={fromAgenda ? 'Trazer serviços da agenda' : 'Adicionar atendimento'}
      busy={command.busy}
      close={close}
    >
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={command.busy}>
          <p>
            Comanda de <strong>{order.clientName}</strong>
          </p>
          {fromAgenda ? (
            <>
              <p className="muted">
                Escolha um agendamento deste cliente. Os valores combinados serão mantidos. Serviços
                já concluídos na agenda entram concluídos na comanda, prontos para finalizar e
                receber.
              </p>
              <OptionPicker<Option & { version: number }>
                label="Buscar agendamento do cliente"
                endpoint={`/orders/${order.id}/appointments`}
                selected={appointment?.id}
                choose={setAppointment}
              />
              {appointment && <p>Selecionado: {appointment.name}</p>}
            </>
          ) : (
            <>
              <OptionPicker
                label="Buscar profissional do atendimento"
                endpoint="/orders/options/professionals"
                selected={professional?.id}
                choose={(p) => {
                  if (professional?.id !== p.id) setServices([]);
                  setProfessional(p);
                }}
              />
              {professional && (
                <>
                  <p>
                    Profissional: <strong>{professional.name}</strong>
                  </p>
                  <OptionPicker<Service>
                    key={professional.id}
                    label="Buscar serviço do atendimento"
                    endpoint={`/orders/options/services?professionalId=${professional.id}`}
                    disabled={services.length >= 20}
                    choose={(s) => {
                      if (!services.some((i) => i.id === s.id)) setServices([...services, s]);
                    }}
                    emptyMessage="Nenhum serviço ativo vinculado a este profissional nesta busca. Configure os serviços em Disponibilidade."
                  />
                </>
              )}
              {services.map((s) => (
                <div key={s.id} className="agenda-service">
                  <div>
                    <strong>{s.name}</strong>
                    <p>
                      {formatPrice(s.price)} · {s.durationMinutes} min
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Remover ${s.name}`}
                    onClick={() => setServices(services.filter((i) => i.id !== s.id))}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </>
          )}
          <label>
            Motivo (opcional)
            <textarea name="reason" maxLength={500} rows={2} />
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
            <button
              className="button primary"
              disabled={fromAgenda ? !appointment : !professional || !services.length}
            >
              {command.busy ? 'Salvando…' : 'Adicionar atendimento'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
