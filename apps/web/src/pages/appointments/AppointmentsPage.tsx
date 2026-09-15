import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Profile } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { OptionPicker } from './OptionPicker';
import { AppointmentDialog } from './AppointmentDialog';
import { AppointmentDetail } from './AppointmentDetail';
import { AgendaGrid } from './AgendaGrid';
import {
  addDays,
  dateLabel,
  statusNames,
  type Agenda,
  type Appointment,
  type Context,
  type Professional,
} from './types';
export function AppointmentsPage({ profile }: { profile: Profile }) {
  const [date, setDate] = useState('');
  const [days, setDays] = useState(1);
  const [page, setPage] = useState(1);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const context = useQuery({
    queryKey: ['agenda-context'],
    queryFn: () => api<Context>('/appointments/context'),
  });
  const currentDate = date || context.data?.today || '';
  const list = useQuery({
    queryKey: ['appointments', currentDate, days, professional?.id, page, status],
    queryFn: () =>
      api<Agenda>(
        `/appointments?date=${currentDate}&days=${days}&page=${page}&status=${status}${professional ? '&professionalId=' + professional.id : ''}`,
      ),
    enabled: !!currentDate,
  });
  const canCreate = ['agenda.criar_propria', 'agenda.criar_qualquer'].some((p) =>
    profile.permissions.includes(p),
  );
  async function saved() {
    setEditing(null);
    setSelected(null);
    setNotice('Agendamento salvo. Alteração registrada no histórico.');
    await Promise.all(
      ['appointments', 'appointment', 'audit'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ROTINA DO SALÃO</span>
          <h1>Agenda</h1>
          <p className="muted">Organize os horários e acompanhe a chegada dos clientes.</p>
        </div>
        {canCreate && (
          <button
            className="button primary"
            disabled={!context.data}
            onClick={() => setEditing('new')}
          >
            Novo agendamento
          </button>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {context.isError && (
        <div className="error" role="alert">
          {context.error.message}
          <button className="button" onClick={() => context.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      <section className="panel agenda-panel">
        <div className="agenda-toolbar">
          <label>
            Data da agenda
            <input
              type="date"
              min="1900-01-01"
              max="2100-12-24"
              value={currentDate}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
          <label>
            Visão
            <select aria-label="Visão" value={days} onChange={(e) => setDays(+e.target.value)}>
              <option value="1">Dia</option>
              <option value="7">Semana</option>
            </select>
          </label>
          <label>
            Status do agendamento
            <select
              aria-label="Status do agendamento"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Todos</option>
              {Object.entries(statusNames).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="availability-actions">
            <button
              className="button"
              disabled={!currentDate || addDays(currentDate, -days) < '1900-01-01'}
              onClick={() => setDate(addDays(currentDate, -days))}
            >
              Anterior
            </button>
            <button
              className="button"
              disabled={!context.data}
              onClick={() => setDate(context.data!.today)}
            >
              Hoje
            </button>
            <button
              className="button"
              disabled={!currentDate || addDays(currentDate, days) > '2100-12-24'}
              onClick={() => setDate(addDays(currentDate, days))}
            >
              Próximo
            </button>
            <button className="button" disabled={list.isFetching} onClick={() => list.refetch()}>
              Atualizar
            </button>
          </div>
        </div>
        <details className="agenda-filter">
          <summary>Profissional: {professional?.name ?? 'todos dentro do seu acesso'}</summary>
          {professional && (
            <button
              className="button"
              onClick={() => {
                setProfessional(null);
                setPage(1);
              }}
            >
              Mostrar todos
            </button>
          )}
          <OptionPicker<Professional>
            label="Filtrar profissional"
            endpoint="/appointments/context"
            selected={professional?.id}
            choose={(p) => {
              setProfessional(p);
              setPage(1);
            }}
          />
        </details>
        {context.data && (
          <p className="muted">
            {currentDate && dateLabel(currentDate)}
            {days === 7 && currentDate && ` até ${dateLabel(addDays(currentDate, 6))}`} ·{' '}
            {context.data.timezone}
          </p>
        )}
        {list.isPending ? (
          <p className="empty">Carregando agenda…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !list.data.professionals.length ? (
          <p className="empty">
            Nenhum profissional disponível no seu acesso. Confira o cadastro e o vínculo do usuário
            em Profissionais.
          </p>
        ) : (
          <>
            <p className="muted">
              {list.data.items.length} agendamento(s) para os profissionais desta página.
              {list.isFetching && ' Atualizando…'}
            </p>
            <AgendaGrid data={list.data} open={setSelected} />
            <Pagination page={page} total={list.data.total} onPage={setPage} />
          </>
        )}
      </section>
      {selected && !editing && (
        <AppointmentDetail
          id={selected}
          permissions={profile.permissions}
          membershipId={profile.membershipId}
          close={() => setSelected(null)}
          edit={setEditing}
          saved={saved}
        />
      )}
      {editing && context.data && (
        <AppointmentDialog
          permissions={profile.permissions}
          appointment={editing === 'new' ? null : editing}
          context={context.data}
          date={currentDate}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}
    </>
  );
}
