import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { api, type Page } from '../../lib/api';
import type { Member, Role, Permission } from './types';
import { ChangeEmailDialog } from './ChangeEmailDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { UserDialog } from './UserDialog';
import { RoleDialog } from './RoleDialog';

export function AccessPage({
  permissions,
  membershipId,
}: {
  permissions: string[];
  membershipId: string;
}) {
  const canUsers = permissions.includes('usuarios.gerenciar');
  const canRoles = permissions.includes('roles.gerenciar');
  const [tab, setTab] = useState<'users' | 'roles'>(canUsers ? 'users' : 'roles');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [user, setUser] = useState<Member | 'new' | null>(null);
  const [role, setRole] = useState<Role | 'new' | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [changingEmail, setChangingEmail] = useState<Member | null>(null);
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const users = useQuery({
    queryKey: ['access-users', search, page],
    queryFn: () =>
      api<Page<Member> & { canChangeEmail: boolean }>(
        `/access/users?search=${encodeURIComponent(search)}&page=${page}`,
      ),
    enabled: canUsers,
  });
  const roles = useQuery({
    queryKey: ['access-roles'],
    queryFn: () => api<Role[]>('/access/roles'),
    enabled: canRoles,
  });
  const catalog = useQuery({
    queryKey: ['access-permissions'],
    queryFn: () => api<Permission[]>('/access/permissions'),
    enabled: canRoles,
  });
  const ready = !!roles.data && !!catalog.data && !roles.isError && !catalog.isError;
  async function saved() {
    setChangingEmail(null);
    setResetting(null);
    setUser(null);
    setRole(null);
    setNotice('Alteração salva e registrada na auditoria.');
    await Promise.all(
      ['access-users', 'access-roles', 'audit', 'me'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EQUIPE E ACESSO</span>
          <h1>Usuários e permissões</h1>
          <p className="muted">Defina quem pode acessar cada parte do salão.</p>
        </div>
      </div>
      <div className="access-tabs" aria-label="Seções de acesso">
        {canUsers && (
          <button
            className={`button ${tab === 'users' ? 'primary' : ''}`}
            aria-pressed={tab === 'users'}
            onClick={() => setTab('users')}
          >
            Usuários
          </button>
        )}
        {canRoles && (
          <button
            className={`button ${tab === 'roles' ? 'primary' : ''}`}
            aria-pressed={tab === 'roles'}
            onClick={() => setTab('roles')}
          >
            Perfis de acesso
          </button>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {canRoles && (roles.isError || catalog.isError) && (
        <p className="error" role="alert">
          {roles.error?.message || catalog.error?.message}{' '}
          <button
            onClick={() => {
              void roles.refetch();
              void catalog.refetch();
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {tab === 'users' ? (
        <section className="panel table-panel">
          <div className="table-toolbar">
            <label className="access-search">
              Buscar usuário
              <input
                value={search}
                maxLength={150}
                placeholder="Nome ou e-mail"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {canRoles && (
              <button className="button primary" disabled={!ready} onClick={() => setUser('new')}>
                <Plus size={18} />
                Novo usuário
              </button>
            )}
          </div>
          {!canRoles && (
            <p className="muted access-hint">
              Para alterar acessos, também é necessária a permissão de gerenciar perfis.
            </p>
          )}
          {users.isPending ? (
            <p className="empty">Carregando usuários…</p>
          ) : users.isError ? (
            <div className="empty">
              <p role="alert">{users.error.message}</p>
              <button className="button" onClick={() => users.refetch()}>
                Tentar novamente
              </button>
            </div>
          ) : !users.data.items.length ? (
            <p className="empty">Nenhum usuário encontrado.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>USUÁRIO</th>
                    <th>PERFIS</th>
                    <th>ACESSO</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                        <small>{m.email}</small>
                      </td>
                      <td>{m.roles.join(', ') || 'Sem perfil'}</td>
                      <td>{m.active && m.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</td>
                      <td>
                        {canRoles && (
                          <button
                            className="icon-button"
                            disabled={!ready}
                            aria-label={`Editar acesso de ${m.name}`}
                            onClick={() => setUser(m)}
                          >
                            <Pencil size={18} />
                          </button>
                        )}
                        {users.data.canChangeEmail && (
                          <button
                            className="button"
                            aria-label={`Alterar e-mail de ${m.name}`}
                            onClick={() => setChangingEmail(m)}
                          >
                            Alterar e-mail
                          </button>
                        )}
                        {canRoles && m.id !== membershipId && (
                          <button
                            className="icon-button"
                            aria-label={`Redefinir senha de ${m.name}`}
                            onClick={() => setResetting(m)}
                          >
                            <KeyRound size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {users.data && users.data.total > 20 && (
            <div className="pagination">
              <button className="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>
                Página {page} de {Math.ceil(users.data.total / 20)}
              </span>
              <button
                className="button"
                disabled={page * 20 >= users.data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="section-title">
            <h2>Perfis de acesso</h2>
            <button className="button primary" disabled={!ready} onClick={() => setRole('new')}>
              <Plus size={18} />
              Novo perfil
            </button>
          </div>
          <p className="muted">
            As mudanças em um perfil valem para todos os usuários vinculados. O perfil Administrador
            é protegido.
          </p>
          {roles.isPending ? (
            <p>Carregando perfis…</p>
          ) : (
            roles.data?.map((r) => (
              <div className="access-role" key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.permissions.length} permissões{r.protected ? ' · Protegido' : ''}
                  </small>
                </div>
                <button className="button" disabled={!ready} onClick={() => setRole(r)}>
                  {r.protected ? 'Ver permissões' : `Editar ${r.name}`}
                </button>
              </div>
            ))
          )}
        </section>
      )}
      {changingEmail && (
        <ChangeEmailDialog
          member={changingEmail}
          self={changingEmail.id === membershipId}
          close={() => setChangingEmail(null)}
          saved={saved}
        />
      )}
      {resetting && (
        <ResetPasswordDialog member={resetting} close={() => setResetting(null)} saved={saved} />
      )}
      {user && ready && (
        <UserDialog
          member={user === 'new' ? null : user}
          roles={roles.data!}
          catalog={catalog.data!}
          own={permissions}
          close={() => setUser(null)}
          saved={saved}
        />
      )}
      {role && ready && (
        <RoleDialog
          role={role === 'new' ? null : role}
          catalog={catalog.data!}
          own={permissions}
          close={() => setRole(null)}
          saved={saved}
        />
      )}
    </>
  );
}
