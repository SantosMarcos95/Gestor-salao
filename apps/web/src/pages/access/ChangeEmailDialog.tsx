import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import type { Member } from './types';

export function ChangeEmailDialog({
  member,
  self,
  close,
  saved,
}: {
  member: Member;
  self: boolean;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    const email = String(data.get('email')).trim().toLowerCase();
    if (email !== String(data.get('confirmation')).trim().toLowerCase()) {
      setError('A confirmação deve ser igual ao novo e-mail.');
      return;
    }
    if (email === member.email) {
      setError('Informe um e-mail diferente do atual.');
      return;
    }
    setBusy(true);
    try {
      await api(`/access/users/${member.id}/email`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          currentPassword: data.get('currentPassword'),
          reason: data.get('reason'),
          revision: member.revision,
        }),
      });
      if (self) {
        window.location.assign('/?email=alterado');
        return;
      }
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Alterar e-mail de ${member.name}`} busy={busy} close={close}>
      <p>
        E-mail atual: <strong>{member.email}</strong>
      </p>
      <p className="muted">
        As sessões deste usuário serão encerradas. O próximo acesso será com o novo e-mail e a mesma
        senha. Informe o novo endereço ao usuário.
      </p>
      {self && (
        <p className="muted">
          Você está alterando seu próprio acesso e precisará entrar novamente.
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset className="access-fields" disabled={busy}>
          <label>
            Novo e-mail de login
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              autoFocus
            />
          </label>
          <label>
            Confirmar novo e-mail
            <input name="confirmation" type="email" required maxLength={254} autoComplete="off" />
          </label>
          <label>
            Sua senha atual
            <input
              name="currentPassword"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
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
            <button className="button primary">{busy ? 'Alterando…' : 'Salvar e-mail'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
