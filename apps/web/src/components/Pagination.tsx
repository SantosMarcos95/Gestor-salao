export function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (value: number) => void;
}) {
  if (total <= 20) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        className="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {Math.ceil(total / 20)}
      </span>
      <button
        type="button"
        className="button"
        disabled={page * 20 >= total}
        onClick={() => onPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
