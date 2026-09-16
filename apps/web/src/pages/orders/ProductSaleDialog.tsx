import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { OptionPicker } from '../appointments/OptionPicker';
import { formatPrice } from '../services/types';
import { quantity } from '../inventory/types';
import { useCommand } from './useCommand';
import type { Order } from './types';

type SaleOption = {
  id: string;
  name: string;
  baseUnit: string;
  saleQuantity: string;
  salePrice: string;
  balance?: string;
};

export function ProductSaleDialog({ order, close }: { order: Order; close: () => void }) {
  const [product, setProduct] = useState<SaleOption | null>(null);
  const command = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product) return;
    const data = new FormData(e.currentTarget);
    const result = await command.send(`/orders/${order.id}/products`, {
      productId: product.id,
      units: Number(data.get('units')),
      version: order.version,
      reason: data.get('reason'),
    });
    if (result) close();
  }
  return (
    <Dialog title="Adicionar produto à comanda" busy={command.busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={command.busy}>
          <OptionPicker<SaleOption>
            label="Buscar produto à venda"
            endpoint="/orders/options/products"
            selected={product?.id}
            choose={setProduct}
            emptyMessage="Nenhum produto ativo com preço de venda. Configure o preço em Produtos."
          />
          {product && (
            <p>
              {formatPrice(product.salePrice)} por unidade de {quantity(product.saleQuantity)}{' '}
              {product.baseUnit}
              {product.balance && ` · estoque: ${quantity(product.balance)} ${product.baseUnit}`}
            </p>
          )}
          <label>
            Unidades vendidas
            <input
              name="units"
              type="number"
              min="1"
              max="10000"
              step="1"
              defaultValue="1"
              required
            />
          </label>
          <p className="muted">
            O estoque será conferido e baixado quando o pagamento for registrado.
          </p>
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
              Cancelar
            </button>
            <button className="button primary" disabled={!product}>
              Adicionar produto
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
