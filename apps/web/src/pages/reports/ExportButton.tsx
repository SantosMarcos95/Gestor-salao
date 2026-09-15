import { useState } from 'react';
import { api } from '../../lib/api';
export function ExportButton({ path, disabled }: { path: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ filename: string; content: string }>(path);
      const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give the browser time to consume the download URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="visit-actions">
      <button type="button" className="button" disabled={disabled || busy} onClick={download}>
        {busy ? 'Preparando arquivo…' : 'Exportar CSV'}
      </button>
      <span className="muted">
        Todos os resultados dos filtros, até 10.000 linhas. Abre no Excel e LibreOffice.
      </span>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
