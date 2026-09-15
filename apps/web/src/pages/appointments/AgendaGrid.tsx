import {
  addDays,
  dateLabel,
  localDateTime,
  statusNames,
  time,
  type Agenda,
  type Appointment,
} from './types';
function minute(value: string, day: string, zone: string) {
  const local = localDateTime(value, zone);
  if (local.slice(0, 10) < day) return 0;
  if (local.slice(0, 10) > day) return 1440;
  return +local.slice(11, 13) * 60 + +local.slice(14, 16);
}
function intersects(a: { startsAt: string; endsAt: string }, day: string, zone: string) {
  return (
    localDateTime(a.startsAt, zone).slice(0, 10) <= day &&
    localDateTime(a.endsAt, zone) > `${day}T00:00`
  );
}
export function AgendaGrid({ data, open }: { data: Agenda; open: (id: string) => void }) {
  const label = (a: Appointment) =>
    `${time(a.startsAt, data.timezone)} · ${a.client.name} · ${a.professional.name} · ${statusNames[a.status]}`;
  const card = (a: Appointment) => (
    <button
      key={a.id}
      className={`agenda-card status-${a.status}`}
      onClick={() => open(a.id)}
      aria-label={label(a)}
    >
      <strong>
        {time(a.startsAt, data.timezone)}–{time(a.endsAt, data.timezone)} · {a.client.name}
      </strong>
      <span>{a.professional.name}</span>
      <span>{a.services.map((s) => s.name).join(', ')}</span>
      <small>{statusNames[a.status]}</small>
    </button>
  );
  if (data.days === 7)
    return (
      <div className="agenda-scroll" tabIndex={0} aria-label="Grade semanal">
        <div className="agenda-week">
          {Array.from({ length: 7 }, (_, i) => addDays(data.date, i)).map((day) => (
            <section className="agenda-week-day" key={day}>
              <h3>{dateLabel(day)}</h3>
              {data.items.filter((a) => intersects(a, day, data.timezone)).map(card)}
              {data.blocks
                .filter((b) => intersects(b, day, data.timezone))
                .map((b) => (
                  <p className="agenda-block-note" key={b.id}>
                    Indisponível · {data.professionals.find((p) => p.id === b.professionalId)?.name}
                    <br />
                    {time(b.startsAt, data.timezone)}–{time(b.endsAt, data.timezone)}
                  </p>
                ))}
              {!data.items.some((a) => intersects(a, day, data.timezone)) && (
                <p className="muted">Sem agendamentos</p>
              )}
            </section>
          ))}
        </div>
      </div>
    );
  const reserved = data.items.filter((a) => !['CANCELLED', 'NO_SHOW'].includes(a.status));
  const intervals = [...reserved, ...data.blocks];
  const startHour = Math.floor(
    Math.min(480, ...intervals.map((a) => minute(a.startsAt, data.date, data.timezone))) / 60,
  );
  const endHour = Math.ceil(
    Math.max(1140, ...intervals.map((a) => minute(a.endsAt, data.date, data.timezone))) / 60,
  );
  const scale = 1.2,
    height = (endHour - startHour) * 60 * scale;
  const position = (a: { startsAt: string; endsAt: string }) => ({
    top: (minute(a.startsAt, data.date, data.timezone) - startHour * 60) * scale,
    height: Math.max(
      2,
      (minute(a.endsAt, data.date, data.timezone) - minute(a.startsAt, data.date, data.timezone)) *
        scale,
    ),
  });
  const weekday = new Date(`${data.date}T12:00Z`).getUTCDay();
  return (
    <>
      <p className="agenda-legend muted">
        Fundo claro: jornada · Listrado: bloqueio · Clique em um agendamento para abrir os detalhes.
      </p>
      <div
        className="agenda-scroll agenda-day-scroll"
        tabIndex={0}
        aria-label="Grade diária por profissional"
      >
        <div
          className="agenda-day"
          style={{
            gridTemplateColumns: `64px repeat(${data.professionals.length}, minmax(210px, 1fr))`,
          }}
        >
          <div className="agenda-axis">
            <div className="agenda-column-title">Hora</div>
            <div style={{ height, position: 'relative' }}>
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <span key={i} style={{ top: i * 72 }}>
                  {String(startHour + i).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>
          {data.professionals.map((p) => (
            <section className="agenda-column" key={p.id}>
              <h3 className="agenda-column-title">
                {p.name}
                {!p.active && ' (inativo)'}
              </h3>
              <div className="agenda-timeline" style={{ height }}>
                {p.workPeriods
                  ?.filter((w) => w.weekday === weekday)
                  .map((w, i) => {
                    const start = Math.max(startHour * 60, w.startMinute),
                      end = Math.min(endHour * 60, w.endMinute);
                    return (
                      end > start && (
                        <div
                          aria-hidden="true"
                          className="agenda-work"
                          key={i}
                          style={{
                            top: (start - startHour * 60) * scale,
                            height: (end - start) * scale,
                          }}
                        />
                      )
                    );
                  })}
                {data.blocks
                  .filter((b) => b.professionalId === p.id)
                  .map((b) => (
                    <div
                      title="Horário bloqueado"
                      aria-label={`Horário bloqueado de ${time(b.startsAt, data.timezone)} a ${time(b.endsAt, data.timezone)}`}
                      className="agenda-block"
                      key={b.id}
                      style={position(b)}
                    />
                  ))}
                {reserved
                  .filter((a) => a.professionalId === p.id)
                  .map((a) => (
                    <button
                      key={a.id}
                      className={`agenda-event status-${a.status}`}
                      style={position(a)}
                      onClick={() => open(a.id)}
                      aria-label={label(a)}
                      title={label(a)}
                    >
                      <strong>
                        {time(a.startsAt, data.timezone)} · {a.client.name}
                      </strong>
                      <span>{a.services.map((s) => s.name).join(', ')}</span>
                      <small>{statusNames[a.status]}</small>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {data.items.some((a) => ['CANCELLED', 'NO_SHOW'].includes(a.status)) && (
        <details>
          <summary>Cancelamentos e faltas</summary>
          <div className="agenda-closed">
            {data.items.filter((a) => ['CANCELLED', 'NO_SHOW'].includes(a.status)).map(card)}
          </div>
        </details>
      )}
    </>
  );
}
