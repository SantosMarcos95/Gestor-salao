import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import type { ProfessionalOption } from './AvailabilityPage';
type Period = { weekday: number; startMinute: number; endMinute: number };
type Work = { version: number; timezone: string; periods: Period[] };
const days = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const clock = (minute: number) =>
  !Number.isFinite(minute)
    ? ''
    : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minute = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
export function WorkDialog({
  professional,
  close,
}: {
  professional: ProfessionalOption;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['work', professional.id],
    queryFn: () => api<Work>(`/availability/${professional.id}/work`),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
  return (
    <Dialog title={`Jornada · ${professional.name}`} busy={busy} close={close}>
      {query.isPending || query.isFetching ? (
        <p>Carregando jornada…</p>
      ) : query.isError ? (
        <>
          <p role="alert" className="error">
            {query.error.message}
          </p>
          <button className="button" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : (
        <WorkForm
          data={query.data}
          id={professional.id}
          busy={busy}
          setBusy={setBusy}
          close={close}
        />
      )}
    </Dialog>
  );
}
function WorkForm({
  data,
  id,
  busy,
  setBusy,
  close,
}: {
  data: Work;
  id: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  close: () => void;
}) {
  const [periods, setPeriods] = useState(data.periods);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  function update(index: number, key: 'startMinute' | 'endMinute', value: number) {
    setPeriods(periods.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const sorted = [...periods].sort(
      (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
    );
    if (
      sorted.some(
        (p, i) =>
          !Number.isFinite(p.startMinute) ||
          !Number.isFinite(p.endMinute) ||
          p.startMinute >= p.endMinute ||
          (i > 0 && sorted[i - 1].weekday === p.weekday && sorted[i - 1].endMinute > p.startMinute),
      )
    ) {
      setError(
        'Confira os períodos: o início deve ser anterior ao fim e não pode haver sobreposição.',
      );
      return;
    }
    const reason = new FormData(e.currentTarget).get('reason');
    setBusy(true);
    try {
      await api(`/availability/${id}/work`, {
        method: 'PUT',
        body: JSON.stringify({ periods, version: data.version, reason }),
      });
      await Promise.all(
        ['work', 'professionals', 'audit'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="muted">
        Horários em {data.timezone}. Dias sem períodos são folgas. Para trabalhar durante a
        madrugada, divida o período entre os dois dias.
      </p>
      <fieldset className="access-fields" disabled={busy}>
        {days.map((day, weekday) => (
          <section className="work-day" key={day}>
            <h3>{day}</h3>
            {!periods.some((p) => p.weekday === weekday) && <p className="muted">Folga</p>}
            {periods.map((p, index) =>
              p.weekday !== weekday ? null : (
                <div className="work-period" key={index}>
                  <label>
                    Início
                    <input
                      aria-label={`Início ${day} ${index + 1}`}
                      type="time"
                      required
                      value={clock(p.startMinute)}
                      onChange={(e) => update(index, 'startMinute', minute(e.target.value))}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      aria-label={`Fim ${day} ${index + 1}`}
                      type="time"
                      required
                      disabled={p.endMinute === 1440}
                      value={clock(p.endMinute === 1440 ? 0 : p.endMinute)}
                      onChange={(e) => update(index, 'endMinute', minute(e.target.value))}
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={p.endMinute === 1440}
                      onChange={(e) => update(index, 'endMinute', e.target.checked ? 1440 : 1080)}
                    />
                    Até meia-noite
                  </label>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Remover período ${day} ${index + 1}`}
                    onClick={() => setPeriods(periods.filter((_, i) => i !== index))}
                  >
                    Remover
                  </button>
                </div>
              ),
            )}
            <button
              type="button"
              className="button"
              disabled={periods.length >= 42}
              onClick={() =>
                setPeriods([...periods, { weekday, startMinute: 540, endMinute: 1080 }])
              }
            >
              Adicionar período — {day}
            </button>
          </section>
        ))}
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
          <button className="button primary">{busy ? 'Salvando…' : 'Salvar jornada'}</button>
        </div>
      </fieldset>
    </form>
  );
}
