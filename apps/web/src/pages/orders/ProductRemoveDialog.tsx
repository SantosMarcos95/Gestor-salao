import { Dialog } from '../../components/Dialog';
import { useCommand } from './useCommand';
import type { Order } from './types';

export function ProductRemoveDialog({
  order,
  item,
  close,
}: {
  order: Order;
  item: Order['productItems'][number];
  close: () => void;
}) {
  const command = useCommand();
  async function remove() {
    const result = await command.send(`/orders/${order.id}/products/${item.id}/remove`, {
      version: order.version,
      reason: 'Produto retirado antes do pagamento',
    });
    if (result) close();
  }
  return (
    <Dialog title="Remover produto" busy={command.busy} close={close}>
      <p>
        Remover {item.units} unidade(s) de {item.productName} desta comanda?
      </p>
      {command.error && (
        <p className="error" role="alert">
          {command.error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button" onClick={close}>
          Voltar
        </button>
        <button className="button primary" disabled={command.busy} onClick={remove}>
          Remover produto
        </button>
      </div>
    </Dialog>
  );
}
