import { useState } from 'react';
import { CalendarDays, ReceiptText, Package, Users, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Profile } from '../../lib/api';
import { statusNames, type Status } from '../appointments/types';
import { formatPrice } from '../services/types';

type Summary = {
  clients: number | null;
  stock: number | null;
  agenda: { status: Status; count: number }[] | null;
  orders: { status: string; count: number }[] | null;
};
type Finance = {
  received: string;
  refunded: string;
  netReceived: string;
  outstanding: string;
  outstandingCount: number;
};
export function DashboardPage({ profile }: { profile: Profile }) {
  const context = useQuery({
    queryKey: ['dashboard-context'],
    queryFn: () => api<{ today: string; timezone: string }>('/dashboard/context'),
  });
  return (
    <>
      <div className="page-heading dashboard-intro">
        <div>
          <span className="eyebrow">VISÃO GERAL</span>
          <h1>
            Olá, {profile.name.split(' ')[0]}
            <span className="heading-dot">.</span>
          </h1>
          <p className="muted">Acompanhe a agenda e as pendências do salão.</p>
        </div>
        {context.data && (
          <div className="dashboard-date">
            <span>HOJE NO SALÃO</span>
            <time dateTime={context.data.today}>
              {new Intl.DateTimeFormat('pt-BR', {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }).format(new Date(`${context.data.today}T12:00:00Z`))}
            </time>
          </div>
        )}
      </div>
      {context.isPending ? (
        <p>Carregando visão geral…</p>
      ) : context.isError ? (
        <div role="alert">
          <p className="error">{context.error.message}</p>
          <button className="button" onClick={() => context.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <DashboardContent profile={profile} {...context.data} />
      )}
    </>
  );
}
function DashboardContent({
  profile,
  today,
  timezone,
}: {
  profile: Profile;
  today: string;
  timezone: string;
}) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const valid = !!from && !!to && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const can = (p: string) => profile.permissions.includes(p);
  const summary = useQuery({
    queryKey: ['dashboard', from, to],
    queryFn: () => api<Summary>(`/dashboard?from=${from}&to=${to}`),
    enabled: valid,
  });
  const finance = useQuery({
    queryKey: ['finance-summary', from, to],
    queryFn: () => api<Finance>(`/finance/summary?from=${from}&to=${to}`),
    enabled: valid && can('financeiro.visualizar'),
  });
  const orders: Record<string, string> = {
    OPEN: 'Em atendimento',
    READY: 'Aguardando pagamento',
    DUE: 'Com saldo pendente',
  };
  return (
    <>
      <div className="panel order-filters">
        <label>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          className="button"
          onClick={() => {
            setFrom(today);
            setTo(today);
          }}
        >
          Hoje
        </button>
        <button
          className="button"
          onClick={() => {
            setFrom(today.slice(0, 8) + '01');
            setTo(today);
          }}
        >
          Este mês
        </button>
        <button
          className="button"
          disabled={!valid}
          onClick={() => {
            summary.refetch();
            if (can('financeiro.visualizar')) finance.refetch();
          }}
        >
          Atualizar
        </button>
      </div>
      <p className="muted">
        Datas no fuso {timezone}. Agenda pela data de início; valores pela data do registro.
      </p>
      {!valid ? (
        <p className="error" role="alert">
          Selecione um período em ordem crescente, com diferença de até 366 dias.
        </p>
      ) : (
        <>
          {summary.isPending ? (
            <p>Carregando indicadores…</p>
          ) : summary.isError ? (
            <p className="error" role="alert">
              {summary.error.message} Use Atualizar para tentar novamente.
            </p>
          ) : (
            <>
              <div className="dashboard-grid">
                {summary.data.agenda !== null && (
                  <section className="panel">
                    <div className="section-title">
                      <div className="dashboard-card-heading">
                        <CalendarDays aria-hidden="true" />
                        <h2>Agenda no período</h2>
                      </div>
                      <Link to="/agenda">Ver agenda</Link>
                    </div>
                    <p className="muted">
                      {can('agenda.visualizar_todas')
                        ? 'Todos os profissionais.'
                        : 'Somente sua agenda.'}
                    </p>
                    {summary.data.agenda.length === 0 ? (
                      <p className="empty">Nenhum agendamento no período.</p>
                    ) : (
                      summary.data.agenda.map((r) => (
                        <div className="metric-row" key={r.status}>
                          <span>{statusNames[r.status]}</span>
                          <strong className="push">{r.count}</strong>
                        </div>
                      ))
                    )}
                  </section>
                )}
                {summary.data.orders !== null && (
                  <section className="panel">
                    <div className="section-title">
                      <div className="dashboard-card-heading">
                        <ReceiptText aria-hidden="true" />
                        <h2>Comandas pendentes agora</h2>
                      </div>
                      <Link to="/comandas">Ver comandas</Link>
                    </div>
                    <p className="muted">
                      Todos os períodos.{' '}
                      {can('comandas.visualizar_todas')
                        ? 'Todas as comandas.'
                        : 'Somente as abertas por você.'}
                    </p>
                    {summary.data.orders.length === 0 ? (
                      <p className="empty">Nenhuma comanda pendente.</p>
                    ) : (
                      summary.data.orders.map((r) => (
                        <div className="metric-row" key={r.status}>
                          <span>{orders[r.status]}</span>
                          <strong className="push">{r.count}</strong>
                        </div>
                      ))
                    )}
                  </section>
                )}
                {summary.data.stock !== null && (
                  <section className="panel">
                    <div className="dashboard-card-heading">
                      <Package aria-hidden="true" />
                      <h2>Reposição de estoque</h2>
                    </div>
                    <p className="dashboard-stat">
                      <strong>{summary.data.stock}</strong> produtos ativos no mínimo ou abaixo
                      dele.
                    </p>
                    <p className="muted">Saldo atual, independente do período.</p>
                    <Link to="/produtos">Ver produtos e estoque</Link>
                  </section>
                )}
                {summary.data.clients !== null && (
                  <section className="panel">
                    <div className="dashboard-card-heading">
                      <Users aria-hidden="true" />
                      <h2>Clientes cadastrados</h2>
                    </div>
                    <p className="dashboard-stat">
                      <strong>{summary.data.clients}</strong> clientes não arquivados.
                    </p>
                    <p className="muted">Cadastro atual, independente do período.</p>
                    <Link to="/clientes">Ver clientes</Link>
                  </section>
                )}
              </div>
              {summary.data.agenda === null &&
                summary.data.orders === null &&
                summary.data.stock === null &&
                summary.data.clients === null &&
                !can('financeiro.visualizar') && (
                  <p className="panel">
                    Seu acesso está configurado conforme sua função. Use o menu para acessar os
                    módulos disponíveis.
                  </p>
                )}
            </>
          )}
          {can('financeiro.visualizar') && (
            <section className="panel">
              <div className="section-title">
                <div className="dashboard-card-heading">
                  <Wallet aria-hidden="true" />
                  <h2>Financeiro no período</h2>
                </div>
                <Link to="/financeiro">Ver financeiro</Link>
              </div>
              {finance.isPending ? (
                <p>Calculando valores…</p>
              ) : finance.isError ? (
                <p className="error" role="alert">
                  {finance.error.message} Use Atualizar para tentar novamente.
                </p>
              ) : (
                <>
                  <div className="finance-cards">
                    <div className="finance-card finance-card-primary">
                      <span>Total líquido do período</span>
                      <strong>{formatPrice(finance.data.netReceived)}</strong>
                      <small>Já descontados os estornos do período.</small>
                    </div>
                    <div className="finance-card">
                      <span>Total recebido no período</span>
                      <strong>{formatPrice(finance.data.received)}</strong>
                      <small>Antes de descontar os estornos.</small>
                    </div>
                  </div>
                  <p>
                    Pendente agora: <strong>{formatPrice(finance.data.outstanding)}</strong> em{' '}
                    {finance.data.outstandingCount} comandas, considerando todos os períodos.
                  </p>
                  <p className="muted">
                    Estornos no período: {formatPrice(finance.data.refunded)}. Total líquido = total
                    recebido − estornos, cada um na sua data. Os valores não representam lucro nem
                    saldo do caixa.
                  </p>
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
