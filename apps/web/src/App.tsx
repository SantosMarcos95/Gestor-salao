import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Profile } from './lib/api';
import { Brand } from './components/Brand';
import { LoginPage } from './pages/login/LoginPage';
import { AccountPage } from './pages/account/AccountPage';
import { SalonLayout } from './layouts/SalonLayout';

export function App() {
  const cache = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Profile>('/auth/me'), retry: false });
  useEffect(() => {
    const expired = () => {
      cache.clear();
      void me.refetch();
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [cache, me.refetch]);
  if (me.isPending)
    return (
      <main className="center-state">
        <Brand />
        <p>Preparando seu espaço…</p>
      </main>
    );
  if (!me.data) {
    if (me.error instanceof ApiError && me.error.status !== 401)
      return (
        <main className="center-state">
          <Brand />
          <h1>Não foi possível abrir seu espaço.</h1>
          <p role="alert">{me.error.message}</p>
          <button className="button primary" onClick={() => me.refetch()}>
            Tentar novamente
          </button>
        </main>
      );
    return (
      <LoginPage
        onSuccess={async () => {
          cache.clear();
          await me.refetch();
        }}
      />
    );
  }
  if (me.data.mustChangePassword)
    return (
      <main className="content">
        <Brand />
        <AccountPage required />
      </main>
    );
  return <SalonLayout profile={me.data} />;
}
