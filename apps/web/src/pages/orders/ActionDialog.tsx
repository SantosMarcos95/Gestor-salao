import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { OptionPicker } from '../appointments/OptionPicker';
import { formatPrice } from '../services/types';
import { useCommand } from './useCommand';
import { decimal, type Order, type Visit, type Option } from './types';
export type Action =
  | 'start'
  | 'complete'
  | 'consume'
  | 'cancelVisit'
  | 'prices'
  | 'discount'
  | 'ready'
  | 'cancelOrder';
const titles: Record<Action, string> = {
  start: 'Iniciar atendimento',
  complete: 'Concluir atendimento',
  consume: 'Confirmar consumo',
  cancelVisit: 'Cancelar atendimento',
  prices: 'Editar valores',
  discount: 'Aplicar desconto',
  ready: 'Finalizar serviços da comanda',
  cancelOrder: 'Cancelar comanda',
};
export function ActionDialog({
  action,
  order,
  visit,
  close,
}: {
  action: Action;
  order?: Order;
  visit?: Visit;
  close: () => void;
}) {
  const command = useCommand();
  const [product, setProduct] = useState<(Option & { baseUnit: string }) | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    let path = '',
      extra: object = {};
    if (action === 'prices') {
      path = `/orders/${order!.id}/visits/${visit!.id}/prices`;
      extra = { prices: visit!.items.map((i) => ({ id: i.id, price: decimal(form.get(i.id)) })) };
    } else if (action === 'discount') {
      path = `/orders/${order!.id}/discount`;
      extra = { discount: decimal(form.get('discount')) };
    } else if (action === 'ready' || action === 'cancelOrder')
      path = `/orders/${order!.id}/${action === 'ready' ? 'ready' : 'cancel'}`;
    else {
      path = `/visits/${visit!.id}/${action === 'consume' ? 'consumptions' : action === 'cancelVisit' ? 'cancel' : action}`;
      if (action === 'consume')
        extra = {
          productId: product?.id,
          quantity: decimal(form.get('quantity')),
          confirmed: form.get('confirmed') === 'on',
        };
    }
    const version = ['prices', 'discount', 'ready', 'cancelOrder'].includes(action)
      ? order!.version
      : visit!.version;
    const result = await command.send(path, { ...extra, version, reason: form.get('reason') });
    if (result) close();
  }
  return (
    <Dialog title={titles[action]} busy={command.busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={command.busy}>
          <p>
            {visit ? `${visit.order.clientName} · ${visit.professionalName}` : order?.clientName}
          </p>
          {action === 'prices' && (
            <>
              <p className="muted">
                Os valores são exclusivos deste atendimento. O catálogo permanece igual.
              </p>
              {visit!.items.map((i) => (
                <label key={i.id}>
                  Valor de {i.name} (R$)
                  <input
                    name={i.id}
                    inputMode="decimal"
                    required
                    maxLength={15}
                    defaultValue={i.price.replace('.', ',')}
                  />
                </label>
              ))}
            </>
          )}
          {action === 'discount' && (
            <>
              <p>Serviços: {formatPrice(order!.subtotal)}</p>
              <label>
                Desconto em reais
                <input
                  name="discount"
                  inputMode="decimal"
                  required
                  maxLength={15}
                  defaultValue={order!.discount.replace('.', ',')}
                />
              </label>
            </>
          )}
          {action === 'consume' && (
            <>
              <OptionPicker<Option & { baseUnit: string }>
                label="Buscar produto consumido"
                endpoint={`/visits/${visit!.id}/products`}
                selected={product?.id}
                choose={setProduct}
              />
              {product && (
                <p>
                  Produto: <strong>{product.name}</strong> · medida: {product.baseUnit}
                </p>
              )}
              <label>
                Quantidade consumida {product ? `(${product.baseUnit})` : ''}
                <input name="quantity" inputMode="decimal" maxLength={19} required />
              </label>
              <label className="check-label">
                <input name="confirmed" type="checkbox" required />
                Confirmo que o produto foi utilizado e pode ser baixado do estoque.
              </label>
              <p className="muted">
                Informe a quantidade na unidade-base. Cancelar o atendimento depois não devolve
                produto consumido ao estoque.
              </p>
            </>
          )}
          {action === 'complete' && (
            <p>
              Confira os serviços e registre todo o consumo antes de concluir. Depois, os valores e
              consumos ficam preservados. Para lançar no financeiro, finalize os serviços da comanda
              e confirme a forma de pagamento na seção Pagamentos.
            </p>
          )}
          {action === 'ready' && (
            <p>
              Os serviços e o desconto serão preservados. Depois, registre o recebimento na seção
              Pagamentos.
            </p>
          )}
          {(action === 'cancelOrder' || action === 'cancelVisit') && (
            <p>O histórico será mantido. Produtos já consumidos não voltarão ao estoque.</p>
          )}
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
            <button className="button" type="button" onClick={close}>
              Voltar
            </button>
            <button className="button primary" disabled={action === 'consume' && !product}>
              {command.busy ? 'Salvando…' : titles[action]}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
