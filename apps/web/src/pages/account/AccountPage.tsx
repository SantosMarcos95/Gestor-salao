import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';

export function AccountPage({ required = false }: { required?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    if (data.get('newPassword') !== data.get('confirmation')) {
      setError('A confirmação deve ser igual à nova senha.');
      return;
    }
    if (data.get('currentPassword') === data.get('newPassword')) {
      setError('Escolha uma senha diferente da atual.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
        }),
      });
      window.location.assign('/?senha=alterada');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU ACESSO</span>
          <h1>{required ? 'Defina sua nova senha' : 'Minha conta'}</h1>
          <p className="muted">
            {required
              ? 'Sua senha foi redefinida. Escolha uma senha pessoal para continuar.'
              : 'Cuide da segurança do seu acesso ao salão.'}
          </p>
        </div>
      </div>
      <section className="panel password-panel">
        <h2>Trocar senha</h2>
        <p className="muted">
          Ao salvar, todas as suas sessões serão encerradas. Entre novamente com a nova senha.
        </p>
        <form onSubmit={submit}>
          <fieldset className="access-fields" disabled={busy}>
            <label>
              {required ? 'Senha provisória' : 'Senha atual'}
              <input
                type="password"
                name="currentPassword"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                name="newPassword"
                aria-describedby="new-password-help"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p className="muted" id="new-password-help">
              De 8 a 128 caracteres.
            </p>
            <label>
              Confirmar nova senha
              <input
                type="password"
                name="confirmation"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              {required && (
                <button type="button" className="button" onClick={logout}>
                  Sair
                </button>
              )}
              <button className="button primary">{busy ? 'Aguarde…' : 'Salvar nova senha'}</button>
            </div>
          </fieldset>
        </form>
      </section>
    </>
  );
}
