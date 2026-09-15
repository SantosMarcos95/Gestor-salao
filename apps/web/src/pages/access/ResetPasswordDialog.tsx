import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import type { Member } from './types';

export function ResetPasswordDialog({
  member,
  close,
  saved,
}: {
  member: Member;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    if (data.get('newPassword') !== data.get('confirmation')) {
      setError('A confirmação deve ser igual à senha provisória.');
      return;
    }
    setBusy(true);
    try {
      await api(`/access/users/${member.id}/password`, {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
          reason: data.get('reason'),
          revision: member.revision,
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
    <Dialog title={`Redefinir senha de ${member.name}`} busy={busy} close={close}>
      <p className="muted">{member.email}</p>
      <p className="muted">
        As sessões desse usuário serão encerradas. Entregue a senha provisória diretamente a ele; o
        sistema exigirá a troca no próximo acesso.
      </p>
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Sua senha atual
            <input
              name="currentPassword"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <label>
            Senha provisória do usuário
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmar senha provisória
            <input
              name="confirmation"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label>
            Motivo da redefinição
            <textarea name="reason" minLength={5} maxLength={500} required rows={2} />
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
            <button className="button primary">{busy ? 'Redefinindo…' : 'Redefinir senha'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
