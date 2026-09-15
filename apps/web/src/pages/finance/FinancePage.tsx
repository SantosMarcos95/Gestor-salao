import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { formatPrice } from '../services/types';
import { PaymentPanel } from './PaymentPanel';
import { methods } from './types';
type Summary = {
  sales: string;
  voided: string;
  netSales: string;
  received: string;
  refunded: string;
  netReceived: string;
  outstanding: string;
  outstandingCount: number;
  change: string;
  byMethod: { method: string; amount: string }[];
};
type Entry = {
  id: string;
  orderId: string;
  clientName: string;
  createdAt: string;
  amount: string;
  method?: string;
  paymentMethods?: string[];
};
export function FinancePage({ permissions }: { permissions: string[] }) {
  const context = useQuery({
    queryKey: ['finance-context'],
    queryFn: () => api<{ today: string; timezone: string }>('/finance/context'),
  });
  if (context.isPending) return <p>Carregando financeiro…</p>;
  if (context.isError)
    return (
      <>
        <p className="error" role="alert">
          {context.error.message}
        </p>
        <button className="button" onClick={() => context.refetch()}>
          Tentar novamente
        </button>
      </>
    );
  return (
    <FinanceContent
      today={context.data.today}
      timezone={context.data.timezone}
      permissions={permissions}
    />
  );
}
function FinanceContent({
  today,
  timezone,
  permissions,
}: {
  today: string;
  timezone: string;
  permissions: string[];
}) {
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [kind, setKind] = useState('payments'),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null);
  const params = `from=${from}&to=${to}`,
    valid = !!from && !!to && from <= to;
  const summary = useQuery({
    queryKey: ['finance-summary', from, to],
    queryFn: () => api<Summary>(`/finance/summary?${params}`),
    enabled: valid,
  });
  const list = useQuery({
    queryKey: ['finance', from, to, kind, page],
    queryFn: () => api<Page<Entry>>(`/finance?${params}&kind=${kind}&page=${page}`),
    enabled: valid,
  });
  const cards = summary.data
    ? [
        ['Total recebido no período', summary.data.received],
        ...['PIX', 'CREDIT', 'DEBIT', 'CASH', 'OTHER'].map((method) => [
          method === 'OTHER' ? 'Outras formas' : methods[method],
          summary.data!.byMethod.find((m) => m.method === method)?.amount ?? '0.00',
        ]),
        ['Estornos no período', summary.data.refunded],
        ['Total líquido do período', summary.data.netReceived],
      ]
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTROLE FINANCEIRO</span>
          <h1>Financeiro</h1>
          <p className="muted">
            Veja quanto recebeu e como seus clientes pagaram no período selecionado. Horários em{' '}
            {timezone}.
          </p>
        </div>
      </div>
      <div className="panel order-filters">
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
        <button
          className="button"
          disabled={!valid}
          onClick={() => {
            summary.refetch();
            list.refetch();
          }}
        >
          Atualizar
        </button>
      </div>
      {!valid ? (
        <p className="error" role="alert">
          Selecione um período válido.
        </p>
      ) : summary.isError ? (
        <p className="error" role="alert">
          {summary.error.message}
        </p>
      ) : summary.isPending ? (
        <p>Calculando valores…</p>
      ) : (
        <>
          <h2>Resumo do período</h2>
          <p className="muted">
            O total recebido soma PIX, crédito, débito, dinheiro e outras formas. Os estornos
            aparecem separados. Total líquido = total recebido − estornos.
          </p>
          <div className="finance-cards">
            {cards.map(([label, value]) => (
              <section className="panel finance-card" key={label}>
                <span>{label}</span>
                <strong>{formatPrice(value)}</strong>
              </section>
            ))}
          </div>
          <p>
            Ainda a receber: <strong>{formatPrice(summary.data.outstanding)}</strong> em{' '}
            {summary.data.outstandingCount} comandas. Independente do período selecionado.
          </p>
          <p className="muted">
            Troco no período: {formatPrice(summary.data.change)}. O troco não é contado como
            receita. Os valores de cartão são os registrados pelo salão, sem conciliação de repasse
            ou taxas.
          </p>
        </>
      )}
      <section className="panel table-panel">
        <div className="order-filters">
          <label>
            Lançamentos
            <select
              aria-label="Lançamentos"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="payments">Pagamentos recebidos</option>
              <option value="sales">Histórico de vendas</option>
              <option value="refunds">Estornos</option>
              <option value="voids">Vendas canceladas</option>
              <option value="due">Pendências atuais</option>
            </select>
          </label>
        </div>
        {kind === 'due' && <p className="muted">Pendências atuais de todos os períodos.</p>}
        {['sales', 'due'].includes(kind) && (
          <p className="muted">
            As formas de pagamento mostram o histórico da venda, incluindo recebimentos estornados.
            Selecione Pagamentos recebidos para ver o valor e a data de cada pagamento.
          </p>
        )}
        {!valid ? null : list.isPending ? (
          <p className="empty">Carregando lançamentos…</p>
        ) : list.isError ? (
          <p className="error" role="alert">
            {list.error.message}
          </p>
        ) : !list.data.items.length ? (
          <p className="empty">Nenhum lançamento encontrado.</p>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>DATA</th>
                  <th>VALOR</th>
                  <th>FORMA DE PAGAMENTO</th>
                  <th>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Cliente">{i.clientName}</td>
                    <td data-label="Data">
                      {new Date(i.createdAt).toLocaleString('pt-BR', { timeZone: timezone })}
                    </td>
                    <td data-label="Valor">{formatPrice(i.amount)}</td>
                    <td data-label="Forma de pagamento">
                      {i.method
                        ? methods[i.method]
                        : i.paymentMethods?.length
                          ? i.paymentMethods.map((m) => methods[m]).join(' + ')
                          : 'Sem pagamento'}
                    </td>
                    <td className="row-actions">
                      <button className="button" onClick={() => setSelected(i.orderId)}>
                        Ver pagamentos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
      </section>
      {selected && (
        <>
          <div className="visit-actions">
            <button className="button" onClick={() => setSelected(null)}>
              Fechar pagamentos
            </button>
          </div>
          <PaymentPanel key={selected} orderId={selected} permissions={permissions} />
        </>
      )}
    </>
  );
}
