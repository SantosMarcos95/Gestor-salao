import { type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { useCommand } from '../orders/useCommand';
import { decimal } from '../orders/types';
import { formatPrice } from '../services/types';
import { methods, type Payment, type Settlement } from './types';
export function RefundDialog({
  data,
  payment,
  close,
}: {
  data: Settlement;
  payment?: Payment;
  close: () => void;
}) {
  const command = useCommand(),
    cancel = !payment;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = await command.send(`/payments/${data.order.id}/${cancel ? 'void' : 'refund'}`, {
      version: data.order.version,
      confirmed: form.get('confirmed') === 'on',
      reason: form.get('reason'),
      ...(!cancel
        ? {
            paymentId: payment.id,
            amount: decimal(form.get('amount')),
            reference: form.get('reference') || null,
          }
        : {}),
    });
    if (result) close();
  }
  return (
    <Dialog
      title={cancel ? 'Cancelar venda e estornar' : 'Estornar recebimento'}
      busy={command.busy}
      close={close}
    >
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={command.busy}>
          <p>{data.order.clientName}</p>
          {payment ? (
            <>
              <p>
                {methods[payment.method]} · Disponível para estorno:{' '}
                <strong>{formatPrice(payment.remaining)}</strong>
              </p>
              <label>
                Valor do estorno (R$)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  maxLength={15}
                  defaultValue={payment.remaining.replace('.', ',')}
                />
              </label>
              <label>
                Referência do estorno (opcional)
                <input name="reference" maxLength={150} />
              </label>
              <p className="muted">
                O estorno desfaz o recebimento e deixa esse valor pendente na comanda. A venda é
                preservada.
              </p>
            </>
          ) : (
            <p>
              A venda será cancelada e todos os recebimentos ainda válidos serão estornados nos
              registros. Produtos consumidos não voltam ao estoque.
            </p>
          )}
          <p className="muted">
            Não há devolução automática no banco ou na maquininha. Confirme apenas após verificar a
            devolução ou a correção do lançamento.
          </p>
          <label className="check-label">
            <input name="confirmed" type="checkbox" required />
            Confirmo a devolução ou correção dos valores e os dados do estorno.
          </label>
          <label>
            Motivo (opcional)
            <textarea name="reason" rows={2} maxLength={500} />
          </label>
          {command.error && (
            <p className="error" role="alert">
              {command.error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Voltar
            </button>
            <button className="button primary">
              {command.busy
                ? 'Registrando…'
                : cancel
                  ? 'Confirmar cancelamento da venda'
                  : 'Confirmar estorno'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
