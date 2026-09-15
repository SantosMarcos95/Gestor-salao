export function CatalogFilters({
  search,
  status,
  onSearch,
  onStatus,
}: {
  search: string;
  status: string;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
}) {
  return (
    <div className="table-toolbar catalog-filters">
      <label>
        Buscar por nome
        <input
          value={search}
          maxLength={150}
          placeholder="Digite um nome…"
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <label>
        Status
        <select aria-label="Status" value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>
      </label>
    </div>
  );
}
