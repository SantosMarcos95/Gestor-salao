import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { Dialog } from '../../components/Dialog';
import { formatPrice } from '../services/types';
type Session = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  opening: string;
  expected: string | null;
  counted: string | null;
  difference: string | null;
  closingReason: string | null;
  openedByName?: string;
  closedByName?: string;
};
type Movement = {
  id: string;
  createdAt: string;
  kind: string;
  amount: string;
  reason: string;
  actorName: string;
};
type Detail = Page<Movement> & {
  session: Session;
  expected: string;
  received: string;
  refunded: string;
  withdrawn: string;
};
const labels: Record<string, string> = {
  PAYMENT: 'Recebimento',
  REFUND: 'Estorno',
  WITHDRAWAL: 'Sangria',
};
export function CashPage() {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [movementPage, setMovementPage] = useState(1);
  const [action, setAction] = useState<{
    kind: 'open' | 'withdraw' | 'close';
    id?: string;
    expected?: string;
  } | null>(null);
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['cash', page],
    queryFn: () =>
      api<Page<Session> & { current: (Session & { expected: string }) | null }>(
        `/cash?page=${page}`,
      ),
  });
  const detail = useQuery({
    queryKey: ['cash-detail', selected, movementPage],
    enabled: !!selected,
    queryFn: () => api<Detail>(`/cash/${selected}?page=${movementPage}`),
  });
  async function saved(id: string) {
    setAction(null);
    setSelected(id);
    setMovementPage(1);
    await Promise.all(
      ['cash', 'cash-detail', 'finance-summary', 'audit'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTROLE DO DINHEIRO</span>
          <h1>Caixa</h1>
          <p className="muted">
            Um caixa aberto por salão. Apenas dinheiro movimenta o saldo; PIX e cartões ficam no
            Financeiro.
          </p>
        </div>
      </div>
      {list.isPending ? (
        <p>Carregando caixa…</p>
      ) : list.isError ? (
        <p role="alert">
          {list.error.message}
          <button className="button" onClick={() => list.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <>
          <section className="panel">
            {list.data.current ? (
              <>
                <h2>Caixa aberto</h2>
                <p>
                  Saldo esperado: <strong>{formatPrice(list.data.current.expected)}</strong>
                </p>
                <div className="dialog-actions">
                  <button
                    className="button"
                    onClick={() => setAction({ kind: 'withdraw', id: list.data.current!.id })}
                  >
                    Registrar sangria
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      setAction({
                        kind: 'close',
                        id: list.data.current!.id,
                        expected: list.data.current!.expected,
                      })
                    }
                  >
                    Fechar caixa
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Caixa fechado. A partir da primeira abertura, recebimentos e estornos em dinheiro
                  exigem um caixa aberto. Movimentos anteriores não serão importados.
                </p>
                <button className="button primary" onClick={() => setAction({ kind: 'open' })}>
                  Abrir caixa
                </button>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Histórico de caixas</h2>
            {!list.data.items.length ? (
              <p className="empty">Nenhum caixa registrado.</p>
            ) : (
              <div className="table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Abertura</th>
                      <th>Estado</th>
                      <th>Saldo inicial</th>
                      <th>Diferença</th>
                      <th>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((s) => (
                      <tr key={s.id}>
                        <td data-label="Abertura">
                          {new Date(s.openedAt).toLocaleString('pt-BR')}
                        </td>
                        <td data-label="Estado">{s.closedAt ? 'Fechado' : 'Aberto'}</td>
                        <td data-label="Inicial">{formatPrice(s.opening)}</td>
                        <td data-label="Diferença">
                          {s.difference === null ? '—' : formatPrice(s.difference)}
                        </td>
                        <td>
                          <button
                            className="button"
                            onClick={() => {
                              setSelected(s.id);
                              setMovementPage(1);
                            }}
                          >
                            Ver movimentos
                          </button>
                        </td>
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
      {selected && (
        <section className="panel">
          <h2>Movimentos do caixa</h2>
          {detail.isPending ? (
            <p>Carregando…</p>
          ) : detail.isError ? (
            <p role="alert">{detail.error.message}</p>
          ) : (
            <>
              <p>
                Aberto por {detail.data.session.openedByName}.{' '}
                {detail.data.session.closedAt && `Fechado por ${detail.data.session.closedByName}.`}
              </p>
              <p>
                Recebido: {formatPrice(detail.data.received)} · Estornado:{' '}
                {formatPrice(detail.data.refunded)} · Sangrias: {formatPrice(detail.data.withdrawn)}
              </p>
              <p>
                Esperado: {formatPrice(detail.data.expected)}
                {detail.data.session.counted !== null &&
                  ` · Contado: ${formatPrice(detail.data.session.counted)} · Diferença: ${formatPrice(detail.data.session.difference!)}`}
              </p>
              {detail.data.session.closingReason && (
                <p>Observação do fechamento: {detail.data.session.closingReason}</p>
              )}
              {!detail.data.items.length ? (
                <p className="empty">Nenhum movimento.</p>
              ) : (
                <div className="table-scroll">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Valor</th>
                        <th>Responsável / motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.items.map((m) => (
                        <tr key={m.id}>
                          <td data-label="Data">{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
                          <td data-label="Tipo">{labels[m.kind]}</td>
                          <td data-label="Valor">{formatPrice(m.amount)}</td>
                          <td data-label="Responsável">
                            {m.actorName}
                            <small>{m.reason}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={movementPage} total={detail.data.total} onPage={setMovementPage} />
            </>
          )}
        </section>
      )}
      {action && <CashDialog action={action} close={() => setAction(null)} saved={saved} />}
    </>
  );
}
function CashDialog({
  action,
  close,
  saved,
}: {
  action: { kind: 'open' | 'withdraw' | 'close'; id?: string; expected?: string };
  close: () => void;
  saved: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<{ fingerprint: string; key: string } | null>(null);
  const title =
    action.kind === 'open'
      ? 'Abrir caixa'
      : action.kind === 'withdraw'
        ? 'Registrar sangria'
        : 'Fechar caixa';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const field =
      action.kind === 'open' ? 'opening' : action.kind === 'withdraw' ? 'amount' : 'counted';
    const body = {
      [field]: String(data.get('amount')).replace(',', '.'),
      reason: String(data.get('reason')),
      confirmed: true,
      ...(action.kind === 'close' ? { expected: action.expected } : {}),
    };
    const fingerprint = JSON.stringify(body),
      key = pending?.fingerprint === fingerprint ? pending.key : crypto.randomUUID();
    setPending({ fingerprint, key });
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string }>(
        action.kind === 'open' ? '/cash/open' : `/cash/${action.id}/${action.kind}`,
        { method: 'POST', body: JSON.stringify({ ...body, requestKey: key }) },
      );
      await saved(result.id);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} busy={busy} close={close}>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          {action.kind === 'close' && (
            <p>
              Saldo esperado: {formatPrice(action.expected!)}. Confira o dinheiro da gaveta antes de
              confirmar.
            </p>
          )}
          <label>
            {action.kind === 'open'
              ? 'Saldo inicial em dinheiro'
              : action.kind === 'withdraw'
                ? 'Valor retirado'
                : 'Dinheiro contado'}
            <input
              name="amount"
              inputMode="decimal"
              type="number"
              min={action.kind === 'withdraw' ? '0.01' : '0'}
              step="0.01"
              required
              autoFocus
            />
          </label>
          <label>
            Motivo / observação
            <textarea
              name="reason"
              maxLength={500}
              minLength={action.kind === 'withdraw' ? 3 : undefined}
              required={action.kind === 'withdraw'}
            />
          </label>
          <p className="muted">
            Sangria exige motivo; diferença no fechamento também. A operação registra seu usuário no
            histórico.
          </p>
          <label>
            <input type="checkbox" required /> Confirmo o valor e a operação.
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
            <button className="button primary">{busy ? 'Salvando…' : 'Confirmar'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
