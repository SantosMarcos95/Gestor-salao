import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import { Pagination } from '../../components/Pagination';
import type { ProfessionalOption } from './AvailabilityPage';
type Option = { id: string; name: string; active: boolean };
type Selection = { version: number; services: Option[] };
export function ServicesDialog({
  professional,
  close,
}: {
  professional: ProfessionalOption;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['performed-services', professional.id],
    queryFn: () => api<Selection>(`/availability/${professional.id}/services`),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
  return (
    <Dialog title={`Serviços · ${professional.name}`} busy={busy} close={close}>
      {query.isPending || query.isFetching ? (
        <p>Carregando serviços…</p>
      ) : query.isError ? (
        <>
          <p role="alert" className="error">
            {query.error.message}
          </p>
          <button className="button" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : (
        <ServicesForm
          data={query.data}
          id={professional.id}
          busy={busy}
          setBusy={setBusy}
          close={close}
        />
      )}
    </Dialog>
  );
}
function ServicesForm({
  data,
  id,
  busy,
  setBusy,
  close,
}: {
  data: Selection;
  id: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  close: () => void;
}) {
  const [selected, setSelected] = useState(data.services);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const options = useQuery({
    queryKey: ['service-options', id, search, page],
    queryFn: () =>
      api<Page<Option>>(
        `/availability/${id}/service-options?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = new FormData(e.currentTarget).get('reason');
    setBusy(true);
    setError('');
    try {
      await api(`/availability/${id}/services`, {
        method: 'PUT',
        body: JSON.stringify({
          version: data.version,
          reason,
          serviceIds: selected.map((s) => s.id),
        }),
      });
      await Promise.all(
        ['performed-services', 'professionals', 'audit'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset className="access-fields" disabled={busy}>
        <p className="muted">
          Selecione os serviços realizados pelo profissional. Preço e duração seguem o catálogo.
          Serviços inativos permanecem identificados para revisão.
        </p>
        <h3>Selecionados ({selected.length})</h3>
        {!selected.length && <p className="muted">Nenhum serviço selecionado.</p>}
        <div className="user-options">
          {selected.map((s) => (
            <button
              type="button"
              className="button"
              key={s.id}
              onClick={() => setSelected(selected.filter((v) => v.id !== s.id))}
              aria-label={`Remover serviço ${s.name}`}
            >
              {s.name}
              {!s.active && ' (inativo)'} · Remover
            </button>
          ))}
        </div>
        <label>
          Buscar serviço
          <input
            maxLength={150}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {options.isPending ? (
          <p>Carregando catálogo…</p>
        ) : options.isError ? (
          <>
            <p className="error" role="alert">
              {options.error.message}
            </p>
            <button type="button" onClick={() => options.refetch()}>
              Tentar novamente
            </button>
          </>
        ) : !options.data.items.length ? (
          <p>Nenhum serviço ativo neste filtro.</p>
        ) : (
          <div className="user-options">
            {options.data.items.map((s) => (
              <label className="check-label" key={s.id}>
                <input
                  type="checkbox"
                  checked={selected.some((v) => v.id === s.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, s] : selected.filter((v) => v.id !== s.id),
                    )
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
        {options.data && <Pagination page={page} total={options.data.total} onPage={setPage} />}
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
          <button className="button primary">{busy ? 'Salvando…' : 'Salvar serviços'}</button>
        </div>
      </fieldset>
    </form>
  );
}
