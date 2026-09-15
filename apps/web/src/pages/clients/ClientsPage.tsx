import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { api, type Client, type Page } from '../../lib/api';
import { ClientDialog } from './ClientDialog';
import { ArchiveDialog } from './ArchiveDialog';

export function ClientsPage({ permissions }: { permissions: string[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Client | null>(null);
  const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['clients', search, page],
    queryFn: () => api<Page<Client>>(`/clients?search=${encodeURIComponent(search)}&page=${page}`),
  });
  async function saved(message: string) {
    setEditing(null);
    setArchiving(null);
    setNotice(message);
    await cache.invalidateQueries({ queryKey: ['clients'] });
    await cache.invalidateQueries({ queryKey: ['audit'] });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RELACIONAMENTOS</span>
          <h1>Clientes</h1>
          <p className="muted">Cada pessoa, uma história. Cuide de todas elas.</p>
        </div>
        {permissions.includes('clientes.criar') && (
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            Novo cliente
          </button>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Seu livro de clientes</h2>
            <p className="muted">
              {list.data ? `${list.data.total} cadastro(s) encontrado(s)` : 'Cadastros do salão'}
            </p>
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar cliente por nome, telefone ou e-mail"
              placeholder="Buscar cliente…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {list.isPending ? (
          <p className="empty">Carregando clientes…</p>
        ) : list.isError ? (
          <div className="empty">
            <p role="alert">{list.error.message}</p>
            <button className="button" onClick={() => list.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <Users size={28} />
            </span>
            <h3>{search ? 'Nenhum cliente encontrado' : 'Seu próximo encontro começa aqui'}</h3>
            <p>
              {search
                ? 'Experimente buscar por outro nome ou contato.'
                : 'Cadastre o primeiro cliente e tenha os contatos sempre à mão.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>CONTATO</th>
                  <th>CADASTRADO EM</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div className="client-name">
                        <span className="avatar pale">{client.name.slice(0, 1)}</span>
                        <strong>{client.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span>{client.phone || client.whatsapp || 'Não informado'}</span>
                      <small>{client.email}</small>
                    </td>
                    <td>{new Date(client.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div className="row-actions">
                        {permissions.some((p) =>
                          ['comandas.visualizar_todas', 'comandas.visualizar_proprias'].includes(p),
                        ) && (
                          <Link
                            className="button"
                            to={`/comandas?clientId=${client.id}`}
                            aria-label={`Comandas de ${client.name}`}
                          >
                            Comandas
                          </Link>
                        )}
                        {permissions.includes('clientes.editar') && (
                          <button
                            className="icon-button"
                            aria-label={`Editar ${client.name}`}
                            onClick={() => setEditing(client)}
                          >
                            <Pencil size={17} />
                          </button>
                        )}
                        {permissions.includes('clientes.excluir') && (
                          <button
                            className="icon-button danger"
                            aria-label={`Arquivar ${client.name}`}
                            onClick={() => setArchiving(client)}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      {editing && (
        <ClientDialog
          client={editing === 'new' ? null : editing}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}{' '}
      {archiving && (
        <ArchiveDialog client={archiving} close={() => setArchiving(null)} saved={saved} />
      )}
    </>
  );
}
