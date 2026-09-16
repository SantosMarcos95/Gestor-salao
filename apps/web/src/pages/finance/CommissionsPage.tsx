import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { formatPrice } from '../services/types';
type Context = {
  today: string;
  timezone: string;
  all: boolean;
  professionals: { id: string; name: string; commissionRate: string }[];
};
type Entry = {
  id: string;
  createdAt: string;
  professionalName: string;
  serviceName: string;
  rate: string;
  base: string;
  amount: string;
};
export function CommissionsPage() {
  const context = useQuery({
    queryKey: ['commission-context'],
    queryFn: () => api<Context>('/commissions/context'),
  });
  if (context.isPending) return <p>Carregando comissões…</p>;
  if (context.isError)
    return (
      <p role="alert">
        {context.error.message}{' '}
        <button className="button" onClick={() => context.refetch()}>
          Tentar novamente
        </button>
      </p>
    );
  return <Content context={context.data} />;
}
function Content({ context }: { context: Context }) {
  const [from, setFrom] = useState(context.today.slice(0, 8) + '01'),
    [to, setTo] = useState(context.today),
    [professional, setProfessional] = useState(''),
    [page, setPage] = useState(1);
  const valid = !!from && !!to && from <= to;
  const list = useQuery({
    queryKey: ['commissions', from, to, professional, page],
    enabled: valid,
    queryFn: () =>
      api<Page<Entry> & { base: string; commission: string; salon: string }>(
        `/commissions?from=${from}&to=${to}&page=${page}${professional ? '&professionalId=' + professional : ''}`,
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VENDAS E COMISSÕES</span>
          <h1>{context.all ? 'Comissões da equipe' : 'Meu financeiro'}</h1>
          <p className="muted">
            Serviços após descontos, reconhecidos no pagamento. Estornos reduzem a comissão.
            Horários em {context.timezone}.
          </p>
        </div>
      </div>
      <p className="muted">
        O percentual fica preservado na primeira venda. Vendas anteriores à implantação não têm
        comissão retroativa. Estes valores não confirmam repasse ao profissional.
      </p>
      {!context.all && !context.professionals.length && (
        <p className="empty">
          Peça ao administrador para vincular seu usuário ao cadastro do profissional.
        </p>
      )}
      {!context.all &&
        context.professionals.map((p) => (
          <p key={p.id}>
            Percentual atual de {p.name}: {p.commissionRate}%
          </p>
        ))}
      <section className="panel">
        <div className="form-grid">
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {context.all && (
            <label>
              Profissional
              <select
                value={professional}
                onChange={(e) => {
                  setProfessional(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Toda a equipe</option>
                {context.professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.commissionRate}%
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>
      {!valid ? (
        <p role="alert">Selecione um período válido.</p>
      ) : list.isPending ? (
        <p>Carregando lançamentos…</p>
      ) : list.isError ? (
        <p role="alert">
          {list.error.message}{' '}
          <button className="button" onClick={() => list.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <>
          <section className="panel">
            <p>
              Serviços recebidos, líquidos de estornos:{' '}
              <strong>{formatPrice(list.data.base)}</strong>
            </p>
            <p>
              Comissões líquidas: <strong>{formatPrice(list.data.commission)}</strong>
            </p>
            {context.all && (
              <p>
                Parte do salão: <strong>{formatPrice(list.data.salon)}</strong>
              </p>
            )}
          </section>
          <section className="panel table-panel">
            {!list.data.items.length ? (
              <p className="empty">Nenhum lançamento no período.</p>
            ) : (
              <div className="table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Profissional / serviço</th>
                      <th>Valor após desconto</th>
                      <th>Percentual</th>
                      <th>Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((e) => (
                      <tr key={e.id}>
                        <td data-label="Data">
                          {new Date(e.createdAt).toLocaleString('pt-BR', {
                            timeZone: context.timezone,
                          })}
                        </td>
                        <td data-label="Serviço">
                          {e.professionalName}
                          <small>{e.serviceName}</small>
                        </td>
                        <td data-label="Valor">{formatPrice(e.base)}</td>
                        <td data-label="Percentual">{e.rate}%</td>
                        <td data-label="Comissão">{formatPrice(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} total={list.data.total} onPage={setPage} />
          </section>
        </>
      )}
    </>
  );
}
