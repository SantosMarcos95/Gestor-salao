import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import { decimalValue, quantity, type Product, type Packaging } from './types';

export function ProductDialog({
  product,
  close,
  saved,
}: {
  product: Product | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState(product?.baseUnit ?? 'ml');
  const [packages, setPackages] = useState<Packaging[]>(product?.packages ?? []);
  const change = (index: number, data: Partial<Packaging>) =>
    setPackages((all) => all.map((p, i) => (i === index ? { ...p, ...data } : p)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      await api(`/products${product ? '/' + product.id : ''}`, {
        method: product ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          description: data.get('description'),
          baseUnit: unit,
          minimum: decimalValue(data.get('minimum')),
          salePrice: data.get('salePrice') ? decimalValue(data.get('salePrice')) : null,
          saleQuantity: decimalValue(data.get('saleQuantity')),
          packages: packages.map((p) => ({ ...p, quantity: decimalValue(p.quantity) })),
          reason: data.get('reason'),
          ...(product ? { version: product.version } : {}),
        }),
      });
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={product ? 'Editar produto' : 'Novo produto'} busy={busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Nome do produto
            <input
              name="name"
              defaultValue={product?.name}
              required
              minLength={2}
              maxLength={150}
              autoFocus
            />
          </label>
          <label>
            Descrição
            <textarea
              name="description"
              defaultValue={product?.description ?? ''}
              maxLength={2000}
              rows={2}
            />
          </label>
          <div className="form-grid">
            <label>
              Unidade-base
              <select
                value={unit}
                disabled={!!product}
                onChange={(e) => {
                  setUnit(e.target.value as Product['baseUnit']);
                  setPackages([]);
                }}
              >
                <option value="ml">Mililitro (ml)</option>
                <option value="g">Grama (g)</option>
                <option value="un">Unidade (un)</option>
              </select>
            </label>
            <label>
              Estoque mínimo
              <input
                name="minimum"
                inputMode="decimal"
                defaultValue={product?.minimum.replace('.', ',') ?? '0'}
                required
                maxLength={19}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Quantidade em cada unidade vendida ({unit})
              <input
                name="saleQuantity"
                inputMode="decimal"
                defaultValue={product ? quantity(product.saleQuantity) : '1'}
                required
              />
            </label>
            <label>
              Preço de venda por unidade (R$)
              <input
                name="salePrice"
                inputMode="decimal"
                defaultValue={product?.salePrice?.replace('.', ',') ?? ''}
                placeholder="Deixe vazio se não estiver à venda"
              />
            </label>
          </div>
          <p className="muted">
            Ex.: um frasco de 500 ml vendido por R$ 30: quantidade 500 ml e preço 30. Deixe o preço
            vazio para impedir a venda.
          </p>
          <p className="muted">
            A unidade-base é fixa após o cadastro. Quantidades aceitam até seis casas decimais, sem
            separador de milhar.
          </p>
          <strong>Embalagens</strong>
          {packages.map((p, i) => (
            <div className="inventory-package" key={i}>
              <label>
                Nome da embalagem {i + 1}
                <input
                  value={p.name}
                  onChange={(e) => change(i, { name: e.target.value })}
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <div className="form-grid">
                <label>
                  Conteúdo {i + 1}
                  <input
                    inputMode="decimal"
                    value={p.quantity}
                    onChange={(e) => change(i, { quantity: e.target.value })}
                    required
                    maxLength={19}
                  />
                </label>
                <label>
                  Unidade do conteúdo {i + 1}
                  <select
                    value={p.unit}
                    onChange={(e) => change(i, { unit: e.target.value as Packaging['unit'] })}
                  >
                    <option value={unit}>{unit}</option>
                    {unit === 'ml' && <option value="l">Litro (l)</option>}
                    {unit === 'g' && <option value="kg">Quilograma (kg)</option>}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => setPackages((all) => all.filter((_, n) => n !== i))}
              >
                Remover embalagem {i + 1}
              </button>
            </div>
          ))}
          {packages.length < 20 && (
            <button
              type="button"
              className="button"
              onClick={() => setPackages((all) => [...all, { name: '', quantity: '', unit }])}
            >
              Adicionar embalagem
            </button>
          )}
          <label>
            Motivo da alteração
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Cancelar
            </button>
            <button className="button primary">{busy ? 'Salvando…' : 'Salvar produto'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
