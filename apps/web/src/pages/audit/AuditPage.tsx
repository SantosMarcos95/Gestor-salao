import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OptionPicker } from '../appointments/OptionPicker';
import { auditNames } from '../orders/types';
import { ShieldCheck } from 'lucide-react';
import { api, type Audit, type Page } from '../../lib/api';
const actionNames: Record<string, string> = {
  ...auditNames,
  RELATORIO_EXPORTADO: 'Relatório exportado',
  PROFISSIONAL_CRIADO: 'Profissional cadastrado',
  PROFISSIONAL_ALTERADO: 'Profissional alterado',
  PROFISSIONAL_ATIVADO: 'Profissional ativado',
  PROFISSIONAL_DESATIVADO: 'Profissional desativado',
  SERVICO_CRIADO: 'Serviço cadastrado',
  SERVICO_ALTERADO: 'Serviço alterado',
  SERVICO_ATIVADO: 'Serviço ativado',
  SERVICO_DESATIVADO: 'Serviço desativado',
  SENHA_ALTERADA: 'Senha alterada pelo titular',
  SENHA_REDEFINIDA: 'Senha redefinida pelo administrador',
  USUARIO_CRIADO: 'Usuário cadastrado',
  EMAIL_LOGIN_ALTERADO: 'E-mail de login alterado',
  USUARIO_ALTERADO: 'Acesso do usuário alterado',
  PERFIL_CRIADO: 'Perfil criado',
  PERFIL_ALTERADO: 'Perfil alterado',
  SISTEMA_INICIALIZADO: 'Salão configurado',
  LOGIN: 'Entrada no sistema',
  LOGOUT: 'Saída do sistema',
  CLIENTE_CRIADO: 'Cliente cadastrado',
  CLIENTE_ALTERADO: 'Cliente alterado',
  CLIENTE_EXCLUIDO: 'Cliente arquivado',
};
const entityNames: Record<string, string> = {
  reports: 'Relatórios',
  clients: 'Clientes',
  professionals: 'Profissionais',
  services: 'Serviços',
  products: 'Produtos',
  stock_movements: 'Movimentos de estoque',
  suppliers: 'Fornecedores',
  appointments: 'Agenda',
  salon_orders: 'Comandas e pagamentos',
  visits: 'Atendimentos',
  salon_users: 'Usuários',
  roles: 'Perfis',
  users: 'Contas',
  salons: 'Salão',
  availability_blocks: 'Bloqueios',
  work_periods: 'Jornadas',
};
const actionLabel = (action: string) =>
  actionNames[action] ?? action.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
type Context = { timezone: string; actions: string[]; entities: string[] };
const fieldNames: Record<string, string> = {
  active: 'Ativo',
  specialty: 'Especialidade',
  description: 'Descrição',
  durationMinutes: 'Duração (minutos)',
  price: 'Preço (R$)',
  membershipId: 'Identificador do usuário vinculado',
  roles: 'Perfis',
  permissions: 'Permissões efetivas',
  overrides: 'Ajustes individuais',
  name: 'Nome',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  birthDate: 'Nascimento',
  notes: 'Observações',
  deletedAt: 'Arquivado em',
  deletionReason: 'Motivo',
};
function Snapshot({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object')
    return <p className="muted">Sem informações anteriores.</p>;
  return (
    <dl className="snapshot">
      {Object.entries(value)
        .filter(([key]) => key in fieldNames)
        .map(([key, val]) => (
          <div key={key}>
            <dt>{fieldNames[key]}</dt>
            <dd>
              {val == null
                ? 'Não informado'
                : typeof val === 'boolean'
                  ? val
                    ? 'Sim'
                    : 'Não'
                  : Array.isArray(val)
                    ? val
                        .map((v) =>
                          typeof v === 'object'
                            ? `${v.code}: ${v.effect === 'DENY' ? 'Negar' : 'Permitir'}`
                            : String(v),
                        )
                        .join('\n') || 'Nenhum'
                    : String(val)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function AuditPage() {
  const context = useQuery({
    queryKey: ['audit-context'],
    queryFn: () => api<Context>('/audit/context'),
  });
  if (context.isPending) return <p>Carregando auditoria…</p>;
  if (context.isError)
    return (
      <div role="alert">
        <p className="error">{context.error.message}</p>
        <button className="button" onClick={() => context.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  return <AuditContent context={context.data} />;
}
function AuditContent({ context }: { context: Context }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState('');
  const [actor, setActor] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const list = useQuery({
    queryKey: ['audit', page, filters],
    queryFn: () => api<Page<Audit>>(`/audit?page=${page}${filters ? '&' + filters : ''}`),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const from = String(data.get('from') ?? ''),
      to = String(data.get('to') ?? '');
    if (
      (from || to) &&
      (!from || !to || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000)
    ) {
      setError('Informe as duas datas em ordem crescente, com diferença de até 366 dias.');
      return;
    }
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'action', 'entity', 'entityId', 'reason']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) params.set(key, value);
    }
    if (actor) params.set('actorId', actor.id);
    setError('');
    setPage(1);
    setFilters(params.toString());
    if (params.toString() === filters && page === 1) void list.refetch();
  }
  function clear() {
    setActor(null);
    setError('');
    setFilters('');
    setPage(1);
    setResetKey((v) => v + 1);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TRANSPARÊNCIA</span>
          <h1>Histórico de atividades</h1>
          <p className="muted">Quem fez, quando fez e o que mudou.</p>
        </div>
        <ShieldCheck size={28} />
      </div>
      <form key={resetKey} className="panel" onSubmit={submit}>
        <div className="order-filters">
          <label>
            De
            <input name="from" type="date" />
          </label>
          <label>
            Até
            <input name="to" type="date" />
          </label>
          <label>
            Ação
            <select name="action" aria-label="Ação">
              <option value="">Todas as ações</option>
              {context.actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Módulo
            <select name="entity" aria-label="Módulo">
              <option value="">Todos os módulos</option>
              {context.entities.map((v) => (
                <option key={v} value={v}>
                  {entityNames[v] ?? v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Texto do motivo
            <input name="reason" maxLength={150} />
          </label>
        </div>
        <details>
          <summary>Filtrar por usuário ou registro</summary>
          <OptionPicker
            label="Buscar usuário da alteração"
            endpoint="/audit/actors"
            selected={actor?.id}
            choose={setActor}
          />
          <p>
            Usuário: {actor?.name ?? 'Todos'}{' '}
            {actor && (
              <button type="button" className="button" onClick={() => setActor(null)}>
                Remover usuário do filtro
              </button>
            )}
          </p>
          <label>
            Identificador do registro
            <input
              name="entityId"
              maxLength={36}
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
              placeholder="Cole o identificador exibido na atividade"
            />
          </label>
        </details>
        <p className="muted">
          Sem datas, consulta todo o histórico. Datas e horários em {context.timezone}. Os filtros
          são combinados ao clicar em Aplicar filtros.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="visit-actions">
          <button className="button primary">Aplicar filtros</button>
          <button className="button" type="button" onClick={clear}>
            Limpar filtros
          </button>
        </div>
      </form>
      <section className="panel">
        <div className="section-title">
          <h2>Atividades do salão</h2>
          <span className="badge">Acesso restrito</span>
        </div>
        {list.data && (
          <p className="muted">
            {list.data.total} atividades encontradas com os filtros aplicados.
          </p>
        )}
        {list.isPending ? (
          <p>Carregando histórico…</p>
        ) : list.isError ? (
          <div>
            <p className="error" role="alert">
              {list.error.message}
            </p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : list.data.items.length === 0 ? (
          <p className="empty">Nenhuma atividade encontrada com os filtros aplicados.</p>
        ) : (
          <div className="audit-list">
            {list.data.items.map((item) => (
              <article key={item.id} className="audit-item">
                <span className="audit-dot" />
                <div className="audit-body">
                  <div className="audit-title">
                    <strong>{actionLabel(item.action)}</strong>
                    <time>
                      {new Date(item.createdAt).toLocaleString('pt-BR', {
                        timeZone: context.timezone,
                      })}
                    </time>
                  </div>
                  <p className="muted">
                    {item.actor.user.name} · {entityNames[item.entity] ?? item.entity}
                  </p>
                  <details>
                    <summary>Identificador do registro</summary>
                    <p style={{ overflowWrap: 'anywhere' }}>{item.entityId}</p>
                  </details>
                  {item.reason && <p>Motivo: {item.reason}</p>}
                  {item.before || item.after ? (
                    <details>
                      <summary>Ver informações da alteração</summary>
                      <div className="snapshot-grid">
                        <section>
                          <h3>Antes</h3>
                          <Snapshot value={item.before} />
                        </section>
                        <section>
                          <h3>Depois</h3>
                          <Snapshot value={item.after} />
                        </section>
                      </div>
                    </details>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
        {list.data && list.data.total > 20 && (
          <div className="pagination">
            <button className="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>
              Página {page} de {Math.ceil(list.data.total / 20)}
            </span>
            <button
              className="button"
              disabled={page * 20 >= list.data.total}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </section>
    </>
  );
}
