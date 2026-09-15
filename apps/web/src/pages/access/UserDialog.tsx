import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import type { Member, Role, Permission, Override } from './types';

export function UserDialog({
  member,
  roles,
  catalog,
  own,
  close,
  saved,
}: {
  member: Member | null;
  roles: Role[];
  catalog: Permission[];
  own: string[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(member?.roleIds ?? []);
  const [overrides, setOverrides] = useState<Override[]>(member?.overrides ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inherited = new Set(
    roles.filter((r) => selected.includes(r.id)).flatMap((r) => r.permissions),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!selected.length) {
      setError('Selecione pelo menos um perfil de acesso.');
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/access/users${member ? '/' + member.id : ''}`, {
        method: member ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(member
            ? { revision: member.revision }
            : { name: data.get('name'), email: data.get('email'), password: data.get('password') }),
          active: data.get('active') === 'on',
          roleIds: selected,
          overrides,
          reason: data.get('reason'),
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
    <Dialog title={member ? `Acesso de ${member.name}` : 'Novo usuário'} busy={busy} close={close}>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="access-fields">
          {member ? (
            <p className="muted">{member.email}</p>
          ) : (
            <>
              <label>
                Nome completo
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={150}
                  autoFocus
                  autoComplete="off"
                />
              </label>
              <label>
                E-mail
                <input name="email" type="email" required maxLength={254} autoComplete="off" />
              </label>
              <label>
                Senha inicial
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <span className="muted">De 8 a 128 caracteres.</span>
              </label>
            </>
          )}
          <label className="access-check">
            <input name="active" type="checkbox" defaultChecked={member?.active ?? true} />
            Acesso ativo neste salão
          </label>
          <fieldset className="access-options">
            <legend>Perfis de acesso</legend>
            {roles.map((r) => (
              <label className="access-check" key={r.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  disabled={r.permissions.some((p) => !own.includes(p))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, r.id] : selected.filter((id) => id !== r.id),
                    )
                  }
                />
                {r.name}
              </label>
            ))}
          </fieldset>
          <details>
            <summary>Permissões individuais ({overrides.length} ajustes)</summary>
            <p className="muted">
              Herdar segue os perfis selecionados. Negar bloqueia a permissão mesmo quando um perfil
              a permite. Módulos futuros ainda não estão disponíveis.
            </p>
            <div className="permission-list">
              {catalog.map((p) => (
                <label className="permission-row" key={p.code}>
                  <span>
                    {p.description}
                    <small>Perfil: {inherited.has(p.code) ? 'permitido' : 'não permitido'}</small>
                  </span>
                  <select
                    aria-label={p.description}
                    disabled={!own.includes(p.code)}
                    value={overrides.find((o) => o.code === p.code)?.effect ?? ''}
                    onChange={(e) =>
                      setOverrides([
                        ...overrides.filter((o) => o.code !== p.code),
                        ...(e.target.value
                          ? [{ code: p.code, effect: e.target.value as Override['effect'] }]
                          : []),
                      ])
                    }
                  >
                    <option value="">Herdar</option>
                    <option value="ALLOW">Permitir</option>
                    <option value="DENY">Negar</option>
                  </select>
                </label>
              ))}
            </div>
          </details>
          <label>
            Motivo da alteração
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} />
          </label>
          {member && (
            <p className="muted">
              Desativar encerra as sessões deste salão. O histórico é preservado.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Cancelar
            </button>
            <button className="button primary">{busy ? 'Salvando…' : 'Salvar usuário'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
