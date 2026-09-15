import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import type { Option } from './types';
export function OptionPicker<T extends Option>({
  label,
  endpoint,
  selected,
  choose,
  disabled = false,
  emptyMessage = 'Nenhuma opção disponível neste filtro.',
}: {
  label: string;
  endpoint: string;
  selected?: string;
  choose: (option: T) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['agenda-options', endpoint, search, page],
    queryFn: () =>
      api<Page<T>>(
        `${endpoint}${endpoint.includes('?') ? '&' : '?'}search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  return (
    <div className="agenda-picker">
      <label>
        {label}
        <input
          disabled={disabled}
          maxLength={150}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {list.isPending ? (
        <p>Carregando opções…</p>
      ) : list.isError ? (
        <>
          <p className="error" role="alert">
            {list.error.message}
          </p>
          <button type="button" className="button" onClick={() => list.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : !list.data.items.length ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <div className="user-options">
          {list.data.items.map((p) => (
            <button
              disabled={disabled}
              type="button"
              className="button"
              key={p.id}
              aria-pressed={selected === p.id}
              onClick={() => choose(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
    </div>
  );
}
