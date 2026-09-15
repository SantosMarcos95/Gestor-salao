import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { CalendarDays, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { api, type Profile } from '../lib/api';
import { Brand } from '../components/Brand';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { ClientsPage } from '../pages/clients/ClientsPage';
import { AccessPage } from '../pages/access/AccessPage';
import { AccountPage } from '../pages/account/AccountPage';
import { ProfessionalsPage } from '../pages/professionals/ProfessionalsPage';
import { ServicesPage } from '../pages/services/ServicesPage';
import { AvailabilityPage } from '../pages/availability/AvailabilityPage';
import { AppointmentsPage } from '../pages/appointments/AppointmentsPage';
import { ReportsPage } from '../pages/reports/ReportsPage';
import { FinancePage } from '../pages/finance/FinancePage';
import { OrdersPage } from '../pages/orders/OrdersPage';
import { OrderPage } from '../pages/orders/OrderPage';
import { VisitsPage } from '../pages/orders/VisitsPage';
import { ProductsPage } from '../pages/inventory/ProductsPage';
import { SuppliersPage } from '../pages/inventory/SuppliersPage';
import { AuditPage } from '../pages/audit/AuditPage';

export function SalonLayout({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const canOrders = profile.permissions.some((p) =>
    ['comandas.visualizar_todas', 'comandas.visualizar_proprias'].includes(p),
  );
  const canVisits =
    canOrders ||
    profile.permissions.some((p) =>
      [
        'atendimentos.iniciar_qualquer',
        'atendimentos.iniciar_proprio',
        'atendimentos.concluir_qualquer',
        'atendimentos.concluir_proprio',
        'atendimentos.registrar_consumo',
      ].includes(p),
    );
  const can = (permission: string) => profile.permissions.includes(permission);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      cache.clear();
      window.location.assign('/');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <div className="app-shell">
      {open && <button aria-label="Fechar menu" className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'opened' : ''}`}>
        <Brand />
        <button
          className="close-menu icon-button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <p className="nav-label">SEU SALÃO</p>
        <nav onClick={() => setOpen(false)}>
          <NavLink to="/" end>
            <LayoutDashboard size={19} />
            Visão geral
          </NavLink>
          {(can('agenda.visualizar_todas') || can('agenda.visualizar_propria')) && (
            <NavLink to="/agenda">
              <CalendarDays size={19} />
              Agenda
            </NavLink>
          )}
          {(can('relatorios.agenda') ||
            can('relatorios.estoque') ||
            can('relatorios.financeiro')) && (
            <NavLink to="/relatorios">
              <LayoutDashboard size={19} />
              Relatórios
            </NavLink>
          )}
          {can('financeiro.visualizar') && (
            <NavLink to="/financeiro">
              <LayoutDashboard size={19} />
              Financeiro
            </NavLink>
          )}
          {canOrders && (
            <NavLink to="/comandas">
              <LayoutDashboard size={19} />
              Comandas
            </NavLink>
          )}
          {canVisits && (
            <NavLink to="/atendimentos">
              <Users size={19} />
              Atendimentos
            </NavLink>
          )}
          {can('profissionais.gerenciar') && (
            <NavLink to="/profissionais">
              <Users size={19} />
              Profissionais
            </NavLink>
          )}
          {(can('agenda.gerenciar_disponibilidade') || can('profissionais.gerenciar')) && (
            <NavLink to="/disponibilidade">
              <CalendarDays size={19} />
              Disponibilidade
            </NavLink>
          )}
          {can('servicos.visualizar') && (
            <NavLink to="/servicos">
              <CalendarDays size={19} />
              Serviços
            </NavLink>
          )}
          {can('produtos.visualizar') && (
            <>
              <NavLink to="/produtos">
                <LayoutDashboard size={19} />
                Produtos e estoque
              </NavLink>
              <NavLink to="/fornecedores">
                <Users size={19} />
                Fornecedores
              </NavLink>
            </>
          )}
          {can('clientes.visualizar_todos') && (
            <NavLink to="/clientes">
              <Users size={19} />
              Clientes
            </NavLink>
          )}
          {(can('usuarios.gerenciar') || can('roles.gerenciar')) && (
            <NavLink to="/acessos">
              <ShieldCheck size={19} />
              Usuários e permissões
            </NavLink>
          )}
          {can('auditoria.visualizar') && (
            <NavLink to="/auditoria">
              <ShieldCheck size={19} />
              Auditoria
            </NavLink>
          )}
          <NavLink to="/minha-conta">
            <ShieldCheck size={19} />
            Minha conta
          </NavLink>
        </nav>
        <div className="sidebar-note">
          <CalendarDays size={23} />
          <strong>Um passo de cada vez</strong>
          <p>Da agenda ao atendimento, acompanhe os serviços e o cuidado com cada cliente.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{profile.name}</strong>
            <small>{profile.roles.join(', ') || 'Usuário'}</small>
          </div>
          <button title="Sair" aria-label="Sair da conta" className="icon-button" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Abrir menu"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <span>{profile.salonName}</span>
          <span className="topbar-right">
            <span className="status-dot" />
            Seu espaço de gestão
          </span>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <main className="content">
          <Routes>
            <Route
              path="/financeiro"
              element={
                can('financeiro.visualizar') ? (
                  <FinancePage
                    key={profile.permissions.join(',')}
                    permissions={profile.permissions}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/comandas"
              element={
                canOrders ? (
                  <OrdersPage permissions={profile.permissions} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/comandas/:id"
              element={
                canOrders ? (
                  <OrderPage key={profile.permissions.join(',')} profile={profile} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/atendimentos"
              element={
                canVisits ? (
                  <VisitsPage key={profile.permissions.join(',')} profile={profile} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/agenda"
              element={
                can('agenda.visualizar_todas') || can('agenda.visualizar_propria') ? (
                  <AppointmentsPage key={profile.permissions.join(',')} profile={profile} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/disponibilidade"
              element={
                can('agenda.gerenciar_disponibilidade') || can('profissionais.gerenciar') ? (
                  <AvailabilityPage
                    key={profile.permissions.join(',')}
                    permissions={profile.permissions}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/profissionais"
              element={
                can('profissionais.gerenciar') ? <ProfessionalsPage /> : <Navigate to="/" replace />
              }
            />
            <Route
              path="/servicos"
              element={
                can('servicos.visualizar') ? (
                  <ServicesPage permissions={profile.permissions} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/produtos"
              element={
                can('produtos.visualizar') ? (
                  <ProductsPage
                    key={profile.permissions.join(',')}
                    permissions={profile.permissions}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/fornecedores"
              element={
                can('produtos.visualizar') ? (
                  <SuppliersPage permissions={profile.permissions} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/relatorios"
              element={
                can('relatorios.agenda') ||
                can('relatorios.estoque') ||
                can('relatorios.financeiro') ? (
                  <ReportsPage
                    key={profile.permissions.join(',')}
                    permissions={profile.permissions}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/minha-conta" element={<AccountPage />} />
            <Route path="/" element={<DashboardPage profile={profile} />} />
            <Route
              path="/clientes"
              element={
                can('clientes.visualizar_todos') ? (
                  <ClientsPage permissions={profile.permissions} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/acessos"
              element={
                can('usuarios.gerenciar') || can('roles.gerenciar') ? (
                  <AccessPage
                    key={profile.permissions.join(',')}
                    permissions={profile.permissions}
                    membershipId={profile.membershipId}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/auditoria"
              element={can('auditoria.visualizar') ? <AuditPage /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          Ateliê <span>Mais organização. Mais cuidado.</span>
        </footer>
      </div>
    </div>
  );
}
