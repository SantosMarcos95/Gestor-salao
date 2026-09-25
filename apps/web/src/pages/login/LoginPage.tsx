import { useState, type FormEvent } from 'react';
import { ArrowRight, Flower2, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { Brand } from '../../components/Brand';

export function LoginPage({ onSuccess }: { onSuccess: () => Promise<unknown> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      await onSuccess();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <div className="story-frame" aria-hidden="true" />
        <div className="story-copy">
          <span className="eyebrow light">MAIS TEMPO PARA O QUE IMPORTA</span>
          <h1>
            Seu talento cuida.
            <br />
            <em>A gente organiza.</em>
          </h1>
          <p>Um espaço para cuidar da rotina do seu salão, das pessoas e de cada novo começo.</p>
          <div className="story-line" />
          <span className="story-sign">Organização que deixa a beleza acontecer.</span>
        </div>
        <div className="botanical" aria-hidden="true">
          <Flower2 strokeWidth={0.55} />
        </div>
        <span className="login-foot">Feito para a rotina do seu salão.</span>
      </section>
      <section className="login-form">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="form-wrap">
          <span className="eyebrow">BEM-VINDO AO SEU ESPAÇO</span>
          <h2>Bom te ver por aqui.</h2>
          <p className="muted">Entre com sua conta para começar.</p>
          {new URLSearchParams(window.location.search).get('senha') === 'alterada' && (
            <p className="success" role="status">
              Senha alterada. Entre com a nova senha.
            </p>
          )}
          {new URLSearchParams(window.location.search).get('email') === 'alterado' && (
            <p className="success" role="status">
              E-mail alterado. Entre com o novo e-mail e sua senha.
            </p>
          )}
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="voce@seusalao.com.br"
                required
                maxLength={254}
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary wide" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar no salão'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="access-note">
            <ShieldCheck size={17} /> Seu acesso respeita as permissões da sua conta.
          </p>
          <p className="help">Precisa de acesso? Fale com o administrador do salão.</p>
        </div>
        <p className="form-footer">Ateliê · Gestão com cuidado</p>
      </section>
    </main>
  );
}
