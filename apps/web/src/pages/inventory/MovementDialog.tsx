import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import { OptionPicker } from '../appointments/OptionPicker';
import { capabilities, decimalValue, kinds, quantity, type Product } from './types';

export function MovementDialog({
  product,
  permissions,
  close,
  saved,
}: {
  product: Product;
  permissions: string[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const allowed = Object.keys(kinds).filter((k) => permissions.includes(capabilities[k]));
  const [kind, setKind] = useState(allowed[0]);
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Keep the exact payload/key after an uncertain network response; retries cannot debit twice.
  const [pending, setPending] = useState<object | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    const payload = pending ?? {
      kind,
      quantity: decimalValue(data.get('quantity')),
      packageName: kind === 'ADJUST' ? null : data.get('packageName') || null,
      supplierId: kind === 'ENTRY' ? (supplier?.id ?? null) : null,
      unitCost:
        kind === 'ENTRY' && data.get('unitCost') ? decimalValue(data.get('unitCost')) : null,
      version: product.version,
      reason: data.get('reason'),
      requestKey: crypto.randomUUID(),
    };
    setPending(payload);
    try {
      await api(`/products/${product.id}/movements`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await saved();
    } catch (e) {
      setError((e as Error).message);
      // Validation and concurrency failures did not commit. Network/5xx responses may have.
      const status = (e as { status?: number }).status;
      if (status && status < 500) setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Movimentar ${product.name}`} busy={busy} close={close}>
      <p>
        Saldo atual:{' '}
        <strong>
          {quantity(product.balance ?? '0')} {product.baseUnit}
        </strong>
      </p>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy || !!pending}>
          <label>
            Tipo de movimentação
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setSupplier(null);
              }}
            >
              {allowed.map((k) => (
                <option value={k} key={k}>
                  {kinds[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {kind === 'ADJUST' ? `Saldo contado em ${product.baseUnit}` : 'Quantidade'}
            <input name="quantity" inputMode="decimal" required maxLength={19} autoFocus />
          </label>
          {kind !== 'ADJUST' && (
            <label>
              Medida
              <select name="packageName" aria-label="Medida">
                <option value="">Unidade-base ({product.baseUnit})</option>
                {product.packages.map((p) => (
                  <option value={p.name} key={p.name}>
                    {p.name} · {quantity(p.quantity)} {p.unit}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'ADJUST' && (
            <p className="muted">
              Informe o saldo físico contado. A diferença será registrada no histórico.
            </p>
          )}
          {kind === 'ENTRY' && (
            <>
              <OptionPicker
                label="Fornecedor"
                endpoint="/suppliers"
                selected={supplier?.id}
                choose={setSupplier}
              />
              {supplier && (
                <button type="button" className="button" onClick={() => setSupplier(null)}>
                  Remover fornecedor
                </button>
              )}
              <label>
                Custo por {product.baseUnit} em reais (opcional)
                <input name="unitCost" inputMode="decimal" maxLength={19} />
              </label>
              <p className="muted">
                Informe o custo por unidade-base, mesmo quando a entrada usar uma embalagem.
              </p>
            </>
          )}
          <label>
            Motivo da movimentação
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} />
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {pending && !busy && (
          <p className="muted">
            Confira o mesmo envio com “Tentar novamente” antes de fazer outro lançamento.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={close}>
            Fechar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Registrando…' : pending ? 'Tentar novamente' : 'Registrar movimentação'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
