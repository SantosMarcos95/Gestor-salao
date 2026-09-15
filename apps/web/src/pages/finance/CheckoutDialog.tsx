import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { useCommand } from '../orders/useCommand';
import { formatPrice } from '../services/types';
import { methods, money, parseMoney, type Settlement } from './types';
type Line = { key: string; method: string; amount: string; tendered: string; reference: string };
export function CheckoutDialog({ data, close }: { data: Settlement; close: () => void }) {
  const due = data.sale?.due ?? data.order.total;
  const [lines, setLines] = useState<Line[]>(
    due === '0.00'
      ? []
      : [
          {
            key: crypto.randomUUID(),
            method: 'CASH',
            amount: due.replace('.', ','),
            tendered: '',
            reference: '',
          },
        ],
  );
  const command = useCommand();
  const update = (key: string, patch: Partial<Line>) =>
    setLines((items) => items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const amounts = lines.map((i) => parseMoney(i.amount)),
    valid = amounts.every((v) => v !== null && v > 0n),
    sum = amounts.reduce<bigint>((n, v) => n + (v ?? 0n), 0n);
  const changes = lines.map((i) =>
    i.method === 'CASH'
      ? (parseMoney(i.tendered || i.amount) ?? 0n) - (parseMoney(i.amount) ?? 0n)
      : 0n,
  );
  const canSend =
    valid &&
    sum === parseMoney(due) &&
    changes.every((v) => v >= 0n) &&
    lines.every((i) => !i.tendered || parseMoney(i.tendered) !== null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend) return;
    const form = new FormData(e.currentTarget);
    const result = await command.send(`/payments/${data.order.id}/checkout`, {
      version: data.order.version,
      payments: lines.map((i) => ({
        method: i.method,
        amount: money(parseMoney(i.amount)!),
        ...(i.method === 'CASH' && i.tendered ? { tendered: money(parseMoney(i.tendered)!) } : {}),
        reference: i.reference || null,
      })),
      confirmed: form.get('confirmed') === 'on',
      reason: form.get('reason'),
    });
    if (result) close();
  }
  return (
    <Dialog title="Receber pagamento" busy={command.busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={command.busy}>
          <p>
            {data.order.clientName} · Saldo a receber: <strong>{formatPrice(due)}</strong>
          </p>
          <p className="muted">
            Registre apenas pagamentos já confirmados. Esta tela não faz cobrança no banco ou na
            maquininha.
          </p>
          {lines.map((line, index) => (
            <div key={line.key} className="inventory-package">
              <label>
                Forma de pagamento {index + 1}
                <select
                  aria-label={`Forma de pagamento ${index + 1}`}
                  value={line.method}
                  onChange={(e) => update(line.key, { method: e.target.value, tendered: '' })}
                >
                  {Object.entries(methods).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor aplicado {index + 1} (R$)
                <input
                  inputMode="decimal"
                  required
                  maxLength={15}
                  value={line.amount}
                  onChange={(e) => update(line.key, { amount: e.target.value })}
                />
              </label>
              {line.method === 'CASH' && (
                <>
                  <label>
                    Dinheiro entregue {index + 1} (R$)
                    <input
                      inputMode="decimal"
                      maxLength={15}
                      value={line.tendered}
                      placeholder={line.amount}
                      onChange={(e) => update(line.key, { tendered: e.target.value })}
                    />
                  </label>
                  <p>
                    Troco:{' '}
                    {changes[index] >= 0n
                      ? formatPrice(money(changes[index]))
                      : 'Confira o dinheiro entregue'}
                  </p>
                </>
              )}
              <label>
                Referência {index + 1} (opcional)
                <input
                  maxLength={150}
                  value={line.reference}
                  onChange={(e) => update(line.key, { reference: e.target.value })}
                  placeholder="Identificação do comprovante"
                />
              </label>
              <button
                type="button"
                className="button"
                onClick={() => setLines(lines.filter((i) => i.key !== line.key))}
              >
                Remover pagamento {index + 1}
              </button>
            </div>
          ))}
          {due !== '0.00' && lines.length < 20 && (
            <button
              type="button"
              className="button"
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    key: crypto.randomUUID(),
                    method: 'PIX',
                    amount: '',
                    tendered: '',
                    reference: '',
                  },
                ])
              }
            >
              Adicionar forma de pagamento
            </button>
          )}
          <p>
            Total aplicado: <strong>{formatPrice(money(sum))}</strong>
          </p>
          {!canSend && (
            <p className="muted">
              A soma deve ser igual ao saldo. Confira os valores e o dinheiro entregue.
            </p>
          )}
          {due === '0.00' && (
            <p>Comanda sem valor a receber. O fechamento será registrado sem criar pagamento.</p>
          )}
          <label className="check-label">
            <input name="confirmed" type="checkbox" required />
            Confirmo os dados e o recebimento dos valores informados.
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
            <button className="button primary" disabled={!canSend}>
              {command.busy ? 'Registrando…' : 'Confirmar recebimento'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
