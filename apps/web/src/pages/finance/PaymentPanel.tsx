import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatPrice } from '../services/types';
import { useCommand } from '../orders/useCommand';
import { CheckoutDialog } from './CheckoutDialog';
import { RefundDialog } from './RefundDialog';
import { methods, type Payment, type Settlement } from './types';
export function PaymentPanel({
  orderId,
  permissions,
  canFinalize = false,
}: {
  orderId: string;
  permissions: string[];
  canFinalize?: boolean;
}) {
  const command = useCommand();
  async function finalizeAndReceive() {
    if (!query.data) return;
    const result = await command.send(`/orders/${orderId}/ready`, {
      version: query.data.order.version,
      reason: null,
    });
    if (result) {
      const refreshed = await query.refetch();
      if (refreshed.data && !refreshed.isError) setCheckout(refreshed.data);
    }
  }
  const [checkout, setCheckout] = useState<Settlement | null>(null),
    [refund, setRefund] = useState<{ data: Settlement; payment?: Payment } | null>(null);
  const query = useQuery({
    queryKey: ['payments', orderId, permissions.join(',')],
    queryFn: () => api<Settlement>(`/payments/${orderId}`),
  });
  const can = (p: string) => permissions.includes(p),
    data = query.data;
  return (
    <section className="panel payment-panel">
      <h2>Pagamentos</h2>
      <p className="muted">
        Formas de pagamento: dinheiro, cartão de crédito, cartão de débito, PIX ou outro. A forma
        escolhida aparece também no Financeiro.
      </p>
      {query.isPending ? (
        <p>Carregando pagamentos…</p>
      ) : query.isError ? (
        <>
          <p className="error" role="alert">
            {query.error.message}
          </p>
          <button className="button" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : (
        data && (
          <>
            <p>
              <strong>{data.order.clientName}</strong>
            </p>
            {!data.sale ? (
              <p>
                {data.order.status === 'READY'
                  ? 'Itens finalizados. Escolha a forma de pagamento em Receber pagamento e confirme o recebimento para lançar no financeiro.'
                  : data.order.status === 'CANCELLED'
                    ? 'Comanda cancelada sem venda registrada.'
                    : canFinalize
                      ? 'Os itens estão prontos para finalizar e receber.'
                      : 'Finalize os itens antes de receber o pagamento.'}
              </p>
            ) : (
              <>
                <div className="order-summary">
                  <div>
                    <span>
                      {data.sale.void ? 'Venda cancelada — valor original' : 'Venda registrada'}
                    </span>
                    <strong>{formatPrice(data.sale.total)}</strong>
                  </div>
                  <div>
                    <span>Recebido após estornos</span>
                    <strong>{formatPrice(data.sale.netReceived)}</strong>
                  </div>
                  <div>
                    <span>Saldo pendente</span>
                    <strong>{formatPrice(data.sale.due)}</strong>
                  </div>
                </div>
                {data.sale.void && (
                  <p>
                    Venda cancelada em {new Date(data.sale.void.createdAt).toLocaleString('pt-BR')}.{' '}
                    O valor original e os pagamentos abaixo ficam preservados no histórico.
                  </p>
                )}
                <h3>Histórico de pagamentos</h3>
                {data.sale.payments.map((p) => (
                  <article className="inventory-package" key={p.id}>
                    <strong>
                      {methods[p.method]} · {formatPrice(p.amount)}
                    </strong>
                    <p>{new Date(p.createdAt).toLocaleString('pt-BR')}</p>
                    {p.method === 'CASH' && (
                      <p>
                        Entregue: {formatPrice(p.tendered)} · Troco: {formatPrice(p.change)}
                      </p>
                    )}
                    {p.reference && <p>Referência: {p.reference}</p>}
                    {p.refunds.map((r) => (
                      <p key={r.id}>
                        Estorno de {formatPrice(r.amount)} em{' '}
                        {new Date(r.createdAt).toLocaleString('pt-BR')}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </p>
                    ))}
                    {!data.sale!.void && p.remaining !== '0.00' && can('pagamentos.estornar') && (
                      <button className="button" onClick={() => setRefund({ data, payment: p })}>
                        Estornar {methods[p.method]}
                      </button>
                    )}
                  </article>
                ))}
              </>
            )}
            {data.order.status === 'OPEN' &&
              canFinalize &&
              can('pagamentos.registrar') &&
              can('comandas.fechar') && (
                <>
                  <button
                    className="button primary"
                    disabled={command.busy}
                    onClick={finalizeAndReceive}
                  >
                    {command.busy ? 'Finalizando…' : 'Finalizar e receber'}
                  </button>
                </>
              )}
            {command.error && (
              <p className="error" role="alert">
                {command.error}
              </p>
            )}
            {['READY', 'DUE'].includes(data.order.status) &&
              can('pagamentos.registrar') &&
              can('comandas.fechar') && (
                <button className="button primary" onClick={() => setCheckout(data)}>
                  Receber pagamento
                </button>
              )}
            {data.sale &&
              !data.sale.void &&
              ['comandas.cancelar', 'comandas.corrigir_fechada', 'pagamentos.estornar'].every(
                can,
              ) && (
                <button className="button" onClick={() => setRefund({ data })}>
                  Cancelar venda e estornar
                </button>
              )}
          </>
        )
      )}
      {checkout && <CheckoutDialog data={checkout} close={() => setCheckout(null)} />}
      {refund && (
        <RefundDialog data={refund.data} payment={refund.payment} close={() => setRefund(null)} />
      )}
    </section>
  );
}
