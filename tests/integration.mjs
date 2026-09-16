import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import EmbeddedPostgres from 'embedded-postgres';
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { testExports, testExportBrowser } from './exports.mjs';
import { testBackup } from './backup.mjs';
import { recoveryPaths, testRecoveredApi } from './recovery.mjs';
import { testReceiptsReport, testReceiptsReportBrowser } from './receipts-report.mjs';
import { testAuditFilters, testAuditFiltersBrowser } from './audit-filters.mjs';
import { testStockReport, testStockReportBrowser } from './stock-report.mjs';
import { testOccupancy } from './occupancy.mjs';
import { testReports, testReportsBrowser } from './reports.mjs';
import { testDashboard } from './dashboard.mjs';
import { testAppointments, testAppointmentsBrowser } from './appointments.mjs';
import { testFinance, testFinanceBrowser } from './finance.mjs';
import { testOrders, testOrdersBrowser } from './orders.mjs';
import { testInventory, testInventoryBrowser } from './inventory.mjs';
import { testPasswords } from './passwords.mjs';
import { testAvailability, testAvailabilityBrowser } from './availability.mjs';
import { testCatalog, testCatalogBrowser } from './catalog.mjs';
import { testCommissionsCash } from './commissions-cash.mjs';
import { testCommissionsCashBrowser } from './commissions-cash-browser.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'salao-test-'));
let databaseLog = '';
let databaseStarted = false;
const db = new EmbeddedPostgres({
  databaseDir: join(directory, 'pg'),
  port: 15439,
  user: 'test_user',
  password: 'isolated_test_only',
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1', '-k', directory],
  onLog: (message) => {
    databaseLog = (databaseLog + message).slice(-8000);
  },
  onError: () => {},
});
const databaseUrl = 'postgresql://test_user:isolated_test_only@127.0.0.1:15439/salao_test';
const origin = 'http://localhost:5179';
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  WEB_ORIGIN: origin,
  PORT: '3009',
  NODE_ENV: 'test',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'Test-admin-password-123',
  ADMIN_NAME: 'Administradora Teste',
  SALON_NAME: 'Salão de Teste',
};
let prisma, server, web, browser;
let exitStatus = 0;
let serverLog = '';
const check = (name) => console.log(`✓ ${name}`);
function command(bin, args, extra = {}) {
  return execFileSync(bin, args, {
    cwd: root,
    env: { ...env, ...extra },
    stdio: 'pipe',
  }).toString();
}
async function request(path, { method = 'GET', body, cookie, requestOrigin = origin } = {}) {
  const result = await fetch(`http://127.0.0.1:3009/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: result.status,
    data: await result.json(),
    cookie: result.headers.get('set-cookie')?.split(';')[0],
  };
}
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    if (server?.exitCode !== null && server?.exitCode !== undefined)
      throw new Error(`API stopped: ${serverLog}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Service did not start: ${serverLog}`);
}
async function stop(child) {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
}
try {
  await db.initialise();
  await db.start();
  databaseStarted = true;
  await db.createDatabase('salao_test');
  command('node_modules/.bin/prisma', ['migrate', 'deploy']);
  command('node_modules/.bin/tsx', ['database/seed.ts']);
  command('node_modules/.bin/tsx', ['database/seed.ts']);
  command('node_modules/.bin/tsx', ['scripts/create-admin.ts']);
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const count = await prisma.permission.count();
  assert.ok(count > 40);
  assert.equal(await prisma.client.count(), 0);
  assert.throws(() => command('node_modules/.bin/tsx', ['scripts/create-admin.ts']));
  assert.equal(await prisma.salon.count(), 1);
  check(
    'Migrations do zero, seed idempotente, bootstrap protegido e ausência de clientes fictícios',
  );

  server = spawn('node', ['apps/api/dist/main.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (b) => {
    serverLog += b.toString();
  });
  server.stderr.on('data', (b) => {
    serverLog += b.toString();
  });
  await waitFor('http://127.0.0.1:3009/api/health');
  assert.equal((await request('/clients')).status, 401);
  assert.equal(
    (
      await request('/auth/login', {
        method: 'POST',
        requestOrigin: 'https://untrusted.test',
        body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/auth/login', {
        method: 'POST',
        body: { email: env.ADMIN_EMAIL, password: 'wrong' },
      })
    ).status,
    401,
  );
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  assert.equal(login.status, 201);
  assert.ok(login.cookie);
  const cookie = login.cookie;
  assert.ok((await request('/auth/me', { cookie })).data.permissions.includes('clientes.excluir'));
  check('Autenticação, sessão por cookie e bloqueio de origem externa');

  const member = await prisma.salonUser.findFirstOrThrow();
  const salonId = member.salonId;
  const otherSalon = await prisma.salon.create({ data: { name: 'Outro salão' } });
  const otherUser = await prisma.user.create({
    data: {
      name: 'Outro administrador',
      email: 'other@example.test',
      passwordHash: await hash('Other-test-password'),
    },
  });
  const otherMember = await prisma.salonUser.create({
    data: { salonId: otherSalon.id, userId: otherUser.id },
  });
  const otherClient = await prisma.client.create({
    data: {
      name: 'Cliente de outro salão',
      salonId: otherSalon.id,
      createdBy: otherMember.id,
      updatedBy: otherMember.id,
    },
  });
  assert.equal((await request('/clients', { cookie })).data.total, 0);
  assert.equal(
    (
      await request(`/clients/${otherClient.id}`, {
        method: 'PATCH',
        cookie,
        body: { name: 'Acesso indevido', version: 1 },
      })
    ).status,
    404,
  );
  const adminRole = await prisma.role.findFirstOrThrow({ where: { salonId, code: 'ROLE_ADMIN' } });
  await assert.rejects(
    prisma.userRole.create({
      data: { salonId, membershipId: otherMember.id, roleId: adminRole.id },
    }),
  );
  await assert.rejects(
    prisma.client.create({
      data: {
        name: 'Ator inválido',
        salonId,
        createdBy: otherMember.id,
        updatedBy: otherMember.id,
      },
    }),
  );
  check('Isolamento entre salões na API e nas chaves estrangeiras');

  assert.equal(
    (
      await request('/clients', {
        method: 'POST',
        cookie,
        body: { name: 'Ana Teste', salonId: otherSalon.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/clients', {
        method: 'POST',
        cookie,
        body: { name: 'Ana Teste', birthDate: '2025-02-30' },
      })
    ).status,
    400,
  );
  const created = await request('/clients', {
    method: 'POST',
    cookie,
    body: {
      name: 'Ana Teste',
      phone: '(11) 99999-1234',
      email: 'ANA@EXAMPLE.TEST',
      birthDate: '1990-01-10',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.email, 'ana@example.test');
  const id = created.data.id;
  const concurrent = await Promise.all(
    ['Ana Editada A', 'Ana Editada B'].map((name) =>
      request(`/clients/${id}`, { method: 'PATCH', cookie, body: { name, version: 1 } }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    await prisma.auditLog.count({ where: { entityId: id, action: 'CLIENTE_ALTERADO' } }),
    1,
  );
  check('Validações e conflito de edição concorrente sem sobrescrever dados');

  const editPermission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'clientes.editar' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: member.id, permissionId: editPermission.id, effect: 'DENY' },
  });
  assert.equal(
    (
      await request(`/clients/${id}`, {
        method: 'PATCH',
        cookie,
        body: { name: 'Negado', version: 2 },
      })
    ).status,
    403,
  );
  await prisma.userPermissionOverride.delete({
    where: {
      membershipId_permissionId: { membershipId: member.id, permissionId: editPermission.id },
    },
  });
  const pro = await prisma.user.create({
    data: {
      name: 'Profissional Teste',
      email: 'pro@example.test',
      passwordHash: await hash('Professional-test-password'),
    },
  });
  const proMember = await prisma.salonUser.create({ data: { salonId, userId: pro.id } });
  const proRole = await prisma.role.findFirstOrThrow({
    where: { salonId, code: 'ROLE_PROFISSIONAL' },
  });
  await prisma.userRole.create({
    data: { salonId, membershipId: proMember.id, roleId: proRole.id },
  });
  const proLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: pro.email, password: 'Professional-test-password' },
  });
  assert.equal((await request('/clients', { cookie: proLogin.cookie })).status, 403);
  assert.equal((await request('/audit', { cookie: proLogin.cookie })).status, 403);
  check('Revogação imediata de permissão e bloqueio do profissional em dados gerais');

  assert.equal(
    (
      await request(`/clients/${id}`, {
        method: 'DELETE',
        cookie,
        body: { version: 2, reason: 'Cadastro duplicado' },
      })
    ).status,
    200,
  );
  assert.equal((await request('/clients', { cookie })).data.total, 0);
  const archived = await prisma.client.findUniqueOrThrow({ where: { id } });
  assert.ok(archived.deletedAt);
  assert.equal(archived.deletedBy, member.id);
  const logs = (await request('/audit', { cookie })).data.items;
  assert.ok(
    logs.some(
      (log) =>
        log.action === 'CLIENTE_EXCLUIDO' &&
        log.reason === 'Cadastro duplicado' &&
        log.before &&
        log.after,
    ),
  );
  await assert.rejects(
    prisma.$executeRaw`UPDATE audit_logs SET action = 'ALTERADO' WHERE entity_id = ${id}::uuid`,
  );
  await assert.rejects(prisma.$executeRaw`DELETE FROM audit_logs WHERE entity_id = ${id}::uuid`);
  await assert.rejects(prisma.$executeRaw`TRUNCATE audit_logs`);
  check('Soft delete com motivo, auditoria antes/depois e proteção contra adulteração');

  if (process.env.BROWSER_TEST === '1') {
    const { chromium, expect } = await import('@playwright/test');
    web = spawn(
      'node',
      [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179'],
      {
        cwd: join(root, 'apps/web'),
        env: { ...env, API_PROXY_TARGET: 'http://127.0.0.1:3009' },
        stdio: 'ignore',
      },
    );
    await waitFor('http://localhost:5179');
    const localLibs = join(root, '.local/browser-libs/extracted/usr/lib/x86_64-linux-gnu');
    browser = await chromium.launch({
      headless: true,
      ...(existsSync(localLibs) ? { env: { ...process.env, LD_LIBRARY_PATH: localLibs } } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:5179');
    await page.getByRole('heading', { name: 'Bom te ver por aqui.' }).waitFor();
    mkdirSync(join(root, '.local/screenshots'), { recursive: true });
    await page.screenshot({
      path: join(root, '.local/screenshots/login-desktop.png'),
      fullPage: true,
    });
    await page.getByLabel('E-mail', { exact: true }).fill(env.ADMIN_EMAIL);
    await page.getByLabel('Senha', { exact: true }).fill(env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar no salão' }).click();
    await page.getByRole('heading', { name: /Olá,/ }).waitFor();
    await page.getByRole('heading', { name: 'Agenda no período', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Financeiro no período', exact: true }).waitFor();
    await expect(page.getByText('Calculando valores…')).toHaveCount(0);
    await page.getByRole('button', { name: 'Este mês', exact: true }).click();
    await expect(page.getByLabel('De', { exact: true })).toHaveValue(/-01$/);
    await page.screenshot({
      path: join(root, '.local/screenshots/dashboard-desktop.png'),
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
    await expect(
      page.getByRole('heading', { name: 'Reposição de estoque', exact: true }),
    ).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({
      path: join(root, '.local/screenshots/dashboard-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Usuários e permissões', exact: true }).click();
    await page.getByRole('button', { name: 'Novo usuário', exact: true }).click();
    await page.getByLabel('Nome completo', { exact: true }).fill('Equipe do navegador');
    await page.getByLabel('E-mail', { exact: true }).fill('browser-team@example.test');
    await page.getByLabel('Senha inicial').fill('Browser-team-password-123');
    await page.getByLabel('Atendente', { exact: true }).check();
    await page.getByLabel('Motivo da alteração').fill('Cadastro pela interface');
    await page.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
    await page
      .getByRole('button', { name: 'Editar acesso de Equipe do navegador', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Editar acesso de Equipe do navegador', exact: true })
      .click();
    await page.getByLabel('Acesso ativo neste salão').uncheck();
    await page.getByLabel('Motivo da alteração').fill('Desativação pela interface');
    await page.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await expect(
      page.getByRole('row').filter({ hasText: 'browser-team@example.test' }),
    ).toContainText('Inativo');
    await page.screenshot({
      path: join(root, '.local/screenshots/users-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Perfis de acesso', exact: true }).click();
    await page.getByRole('button', { name: 'Novo perfil', exact: true }).click();
    await page.getByLabel('Nome do perfil').fill('Consulta do navegador');
    await page.getByLabel('clientes · visualizar todos', { exact: true }).check();
    await page.getByLabel('Motivo da alteração').fill('Perfil pela interface');
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await page.getByRole('button', { name: 'Editar Consulta do navegador', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Editar Consulta do navegador', exact: true }).click();
    await page.getByLabel('Nome do perfil').fill('Consulta móvel');
    await page.getByLabel('Motivo da alteração').fill('Edição pelo celular');
    await page.screenshot({
      path: join(root, '.local/screenshots/roles-mobile.png'),
      fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await page.getByRole('button', { name: 'Editar Consulta móvel', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Usuários', exact: true }).click();
    await page.screenshot({
      path: join(root, '.local/screenshots/users-mobile.png'),
      fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page
      .getByRole('button', { name: 'Editar acesso de Administradora Teste', exact: true })
      .click();
    await page.getByLabel('Acesso ativo neste salão').uncheck();
    await page.getByLabel('Motivo da alteração').fill('Verificar último administrador');
    await page.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Mantenha pelo menos um administrador' })
      .waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    check(
      'Navegador: cadastro e desativação de usuário, criação e edição de perfil, proteção do administrador e layout móvel',
    );
    await page.getByRole('link', { name: 'Clientes', exact: true }).click();
    await page.getByRole('button', { name: 'Novo cliente' }).click();
    await page.getByLabel('Nome completo').fill('Cliente do navegador');
    await page.getByLabel('Telefone', { exact: true }).fill('11999998888');
    await page.getByRole('button', { name: 'Salvar cliente' }).click();
    await page.getByRole('button', { name: 'Editar Cliente do navegador', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Editar Cliente do navegador' }).click();
    await page.getByLabel('Nome completo').fill('Cliente atualizado no navegador');
    await page.getByRole('button', { name: 'Salvar cliente' }).click();
    await page.getByRole('button', { name: 'Editar Cliente atualizado no navegador' }).waitFor();
    await page.screenshot({
      path: join(root, '.local/screenshots/clients-desktop.png'),
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(root, '.local/screenshots/clients-mobile.png'),
      fullPage: true,
    });
    const mobileWidth = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    assert.ok(
      mobileWidth.content <= mobileWidth.viewport,
      `Mobile overflow: ${JSON.stringify(mobileWidth)}`,
    );
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('link', { name: 'Auditoria', exact: true }).click();
    await page.getByRole('heading', { name: 'Histórico de atividades' }).waitFor();
    await testAuditFiltersBrowser({ page, expect, root, join });
    await page.screenshot({
      path: join(root, '.local/screenshots/audit-mobile.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await testInventoryBrowser({ page, expect, root, join });
    await testCatalogBrowser({ page, expect, root, join });
    await testAvailabilityBrowser({ page, expect, root, join });
    await testAppointmentsBrowser({ page, expect, root, join, prisma, salonId });
    await testOrdersBrowser({ page, expect, root, join, prisma, salonId });
    await testReportsBrowser({ page, expect, root, join });
    await testStockReportBrowser({ page, expect, root, join });
    await testFinanceBrowser({ page, expect, root, join, prisma, salonId });
    await testReceiptsReportBrowser({ page, expect, root, join });
    await testExportBrowser({ page, expect });
    const browserMember = (
      await request('/access/users?search=browser-team%40example.test', { cookie })
    ).data.items[0];
    assert.equal(
      (
        await request(`/access/users/${browserMember.id}`, {
          method: 'PATCH',
          cookie,
          body: {
            roleIds: browserMember.roleIds,
            overrides: browserMember.overrides,
            active: true,
            revision: browserMember.revision,
            reason: 'Reativar para testar recuperação',
          },
        })
      ).status,
      200,
    );
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await page.getByRole('link', { name: 'Usuários e permissões', exact: true }).click();
    await page.reload();
    await page
      .getByRole('button', { name: 'Redefinir senha de Equipe do navegador', exact: true })
      .click();
    await page.getByLabel('Sua senha atual', { exact: true }).fill(env.ADMIN_PASSWORD);
    await page
      .getByLabel('Senha provisória do usuário', { exact: true })
      .fill('Browser-temporary-password');
    await page
      .getByLabel('Confirmar senha provisória', { exact: true })
      .fill('Browser-temporary-password');
    await page.getByLabel('Motivo da redefinição').fill('Recuperação pelo navegador');
    const resetResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/access/users/${browserMember.id}/password`) &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
    const resetResult = await resetResponse;
    assert.equal(resetResult.status(), 201, await resetResult.text());
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).fill('browser-team@example.test');
    await page.getByLabel('Senha', { exact: true }).fill('Browser-temporary-password');
    await page.getByRole('button', { name: 'Entrar no salão' }).click();
    await page.getByRole('heading', { name: 'Defina sua nova senha', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Clientes', exact: true }).count(), 0);
    await page.getByLabel('Senha provisória', { exact: true }).fill('Browser-temporary-password');
    await page.getByLabel('Nova senha', { exact: true }).fill('Browser-personal-password');
    await page.getByLabel('Confirmar nova senha', { exact: true }).fill('Different-password');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByRole('alert').filter({ hasText: 'A confirmação deve ser igual' }).waitFor();
    await page
      .getByLabel('Confirmar nova senha', { exact: true })
      .fill('Browser-personal-password');
    await page.screenshot({
      path: join(root, '.local/screenshots/password-mobile.png'),
      fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByRole('status').filter({ hasText: 'Senha alterada' }).waitFor();
    await page.getByLabel('E-mail', { exact: true }).fill('browser-team@example.test');
    await page.getByLabel('Senha', { exact: true }).fill('Browser-personal-password');
    await page.getByRole('button', { name: 'Entrar no salão' }).click();
    await page.getByRole('heading', { name: /Olá,/ }).waitFor();
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await page.getByRole('link', { name: 'Minha conta', exact: true }).click();
    await page.getByRole('heading', { name: 'Minha conta', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    check(
      'Navegador: redefinição administrativa, troca obrigatória, confirmação da senha, novo login e Minha conta',
    );
    await browser.close();
    browser = null;
    check('Navegador: login, cadastro, edição, auditoria e layout móvel sem erro de JavaScript');
  }
  // Access administration uses only this disposable salon and its test accounts.
  assert.equal((await request('/access/users')).status, 401);
  assert.equal((await request('/access/users', { cookie: proLogin.cookie })).status, 403);
  assert.equal((await request('/access/roles', { cookie: proLogin.cookie })).status, 403);
  const accessRoles = (await request('/access/roles', { cookie })).data;
  const accessAdmin = accessRoles.find((r) => r.id === adminRole.id);
  const usersBefore = (await request('/access/users', { cookie })).data;
  assert.equal(usersBefore.total, process.env.BROWSER_TEST === '1' ? 3 : 2);
  assert.ok(!JSON.stringify(usersBefore).includes('password'));
  const primaryAdmin = usersBefore.items.find((u) => u.id === member.id);
  const change = (u, extra = {}) => ({
    roleIds: u.roleIds,
    active: u.active,
    overrides: u.overrides,
    revision: u.revision,
    reason: 'Teste de administração',
    ...extra,
  });
  const beforeBlockedAudit = await prisma.auditLog.count();
  for (const extra of [
    { active: false },
    { roleIds: [proRole.id] },
    { overrides: [{ code: 'usuarios.gerenciar', effect: 'DENY' }] },
  ]) {
    assert.equal(
      (
        await request(`/access/users/${member.id}`, {
          method: 'PATCH',
          cookie,
          body: change(primaryAdmin, extra),
        })
      ).status,
      409,
    );
  }
  assert.equal(await prisma.auditLog.count(), beforeBlockedAudit);
  assert.equal(
    (
      await request(`/access/users/${otherMember.id}`, {
        method: 'PATCH',
        cookie,
        body: change(primaryAdmin),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/access/roles/${adminRole.id}`, {
        method: 'PATCH',
        cookie,
        body: {
          name: 'Tentativa',
          permissions: [],
          reason: 'Teste de proteção',
          revision: accessAdmin.revision,
        },
      })
    ).status,
    403,
  );
  check(
    'Último administrador protegido contra desativação, troca de perfil e negação individual, com rollback',
  );

  const roleCreated = await request('/access/roles', {
    method: 'POST',
    cookie,
    body: {
      name: 'Consulta de clientes',
      permissions: ['clientes.visualizar_todos'],
      reason: 'Criar perfil para consulta',
    },
  });
  assert.equal(roleCreated.status, 201);
  const newRole = roleCreated.data;
  const userBody = {
    name: 'Usuária de acesso',
    email: 'ACCESS@EXAMPLE.TEST',
    password: 'Access-test-password-123',
    active: true,
    roleIds: [newRole.id],
    overrides: [],
    reason: 'Contratação da equipe',
  };
  assert.equal(
    (
      await request('/access/users', {
        method: 'POST',
        cookie,
        body: { ...userBody, password: '123' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/access/users', {
        method: 'POST',
        cookie,
        body: { ...userBody, salonId: otherSalon.id },
      })
    ).status,
    400,
  );
  const foreignRole = await prisma.role.create({
    data: { salonId: otherSalon.id, code: 'OTHER', name: 'Outro perfil' },
  });
  assert.equal(
    (
      await request('/access/users', {
        method: 'POST',
        cookie,
        body: { ...userBody, roleIds: [foreignRole.id] },
      })
    ).status,
    404,
  );
  const accessCreated = await request('/access/users', { method: 'POST', cookie, body: userBody });
  assert.equal(accessCreated.status, 201);
  assert.equal(accessCreated.data.email, 'access@example.test');
  assert.ok(!JSON.stringify(accessCreated.data).includes('password'));
  assert.equal(
    (await request('/access/users', { method: 'POST', cookie, body: userBody })).status,
    409,
  );
  const accessLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: 'access@example.test', password: userBody.password },
  });
  assert.equal(accessLogin.status, 201);
  assert.equal((await request('/clients', { cookie: accessLogin.cookie })).status, 200);
  const roleEdit = {
    name: newRole.name,
    permissions: ['clientes.visualizar_todos', 'clientes.criar'],
    reason: 'Permitir novos cadastros',
    revision: newRole.revision,
  };
  const roleRace = await Promise.all(
    [roleEdit, { ...roleEdit, name: 'Consulta e cadastro' }].map((body) =>
      request(`/access/roles/${newRole.id}`, { method: 'PATCH', cookie, body }),
    ),
  );
  assert.deepEqual(roleRace.map((r) => r.status).sort(), [200, 409]);
  assert.ok(
    (await request('/auth/me', { cookie: accessLogin.cookie })).data.permissions.includes(
      'clientes.criar',
    ),
  );
  let target = (await request('/access/users?search=access%40example.test', { cookie })).data
    .items[0];
  assert.equal(
    (
      await request(`/access/users/${target.id}`, {
        method: 'PATCH',
        cookie,
        body: change(accessCreated.data),
      })
    ).status,
    409,
  );
  const accessRace = await Promise.all(
    ['Primeiro ajuste', 'Segundo ajuste'].map((reason) =>
      request(`/access/users/${target.id}`, {
        method: 'PATCH',
        cookie,
        body: change(target, { reason, overrides: [{ code: 'clientes.criar', effect: 'DENY' }] }),
      }),
    ),
  );
  assert.deepEqual(accessRace.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await request('/clients', {
        method: 'POST',
        cookie: accessLogin.cookie,
        body: { name: 'Cadastro negado' },
      })
    ).status,
    403,
  );
  target = accessRace.find((r) => r.status === 200).data;
  const inactive = await request(`/access/users/${target.id}`, {
    method: 'PATCH',
    cookie,
    body: change(target, { active: false }),
  });
  assert.equal(inactive.status, 200);
  assert.equal((await request('/auth/me', { cookie: accessLogin.cookie })).status, 401);
  assert.equal(
    (
      await request(`/access/users/${target.id}`, {
        method: 'PATCH',
        cookie,
        body: change(inactive.data, { active: true }),
      })
    ).status,
    200,
  );
  assert.equal((await request('/auth/me', { cookie: accessLogin.cookie })).status, 401);
  const accessLogs = await prisma.auditLog.findMany({ where: { entityId: target.id } });
  assert.equal(accessLogs.length, 4);
  assert.ok(accessLogs.every((log) => log.reason && log.after));
  assert.ok(!JSON.stringify(accessLogs).includes(userBody.password));
  assert.ok(!JSON.stringify(accessLogs).includes('passwordHash'));
  check(
    'Cadastro, perfis, concorrência, permissões imediatas, revogação de sessões e auditoria sem credenciais',
  );

  // A delegated manager cannot promote themselves or edit a stronger account.
  const delegatedRole = await request('/access/roles', {
    method: 'POST',
    cookie,
    body: {
      name: 'Gestor limitado',
      permissions: ['usuarios.gerenciar', 'roles.gerenciar'],
      reason: 'Delegação limitada para teste',
    },
  });
  const delegated = await request('/access/users', {
    method: 'POST',
    cookie,
    body: {
      ...userBody,
      name: 'Gestor limitado',
      email: 'limited@example.test',
      roleIds: [delegatedRole.data.id],
    },
  });
  assert.equal(delegated.status, 201);
  const delegatedLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: 'limited@example.test', password: userBody.password },
  });
  assert.equal(delegatedLogin.status, 201);
  assert.equal(
    (
      await request(`/access/users/${delegated.data.id}`, {
        method: 'PATCH',
        cookie: delegatedLogin.cookie,
        body: change(delegated.data, { roleIds: [adminRole.id] }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/access/users/${member.id}`, {
        method: 'PATCH',
        cookie: delegatedLogin.cookie,
        body: change(primaryAdmin, { active: false }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/access/roles', {
        method: 'POST',
        cookie: delegatedLogin.cookie,
        body: {
          name: 'Escalada indevida',
          permissions: ['financeiro.gerenciar'],
          reason: 'Tentativa de escalada',
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/access/roles/${foreignRole.id}`, { method: 'PATCH', cookie, body: roleEdit }))
      .status,
    404,
  );
  check(
    'Gestor limitado não pode ampliar o próprio acesso nem administrar contas mais privilegiadas',
  );

  const secondAdmin = await request('/access/users', {
    method: 'POST',
    cookie,
    body: {
      ...userBody,
      name: 'Segundo administrador',
      email: 'second-admin@example.test',
      roleIds: [adminRole.id],
    },
  });
  assert.equal(secondAdmin.status, 201);
  const adminRace = await Promise.all(
    [primaryAdmin, secondAdmin.data].map((u) =>
      request(`/access/users/${u.id}`, {
        method: 'PATCH',
        cookie,
        body: change(u, { active: false }),
      }),
    ),
  );
  assert.equal(adminRace.filter((r) => r.status === 200).length, 1);
  assert.ok(adminRace.some((r) => [401, 403, 409].includes(r.status)));
  const surviving = await prisma.salonUser.count({
    where: { salonId, active: true, roles: { some: { roleId: adminRole.id } } },
  });
  assert.equal(surviving, 1);
  // Restore the test actor for the pre-existing logout assertion.
  await prisma.salonUser.update({ where: { id: member.id }, data: { active: true } });
  await prisma.userSession.updateMany({
    where: { membershipId: member.id },
    data: { revokedAt: null },
  });
  check('Desativações simultâneas preservam um administrador ativo');

  await testPasswords({
    prisma,
    root,
    env,
    cookie,
    member,
    otherMember,
    delegatedCookie: delegatedLogin.cookie,
    target,
  });

  await testCatalog({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    salonId,
    otherMember,
    proMember,
  });

  await testAvailability({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    salonId,
    otherMember,
  });

  await testInventory({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    otherMember,
    salonId,
  });
  await testAppointments({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    salonId,
    otherMember,
    proMember,
  });

  await testOrders({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    otherMember,
    salonId,
  });
  await testFinance({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    otherMember,
    salonId,
  });
  await testOccupancy({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    salonId,
    otherMember,
  });
  await testReports({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    salonId,
    otherMember,
  });
  await testStockReport({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    salonId,
    otherMember,
  });
  await testReceiptsReport({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    salonId,
    otherMember,
  });
  await testDashboard({ request, prisma, cookie, proCookie: proLogin.cookie, salonId, proMember });
  await testAuditFilters({
    request,
    prisma,
    cookie,
    salonId,
    otherMember,
    proCookie: proLogin.cookie,
    proMember,
  });
  await testExports({ request, prisma, cookie, proCookie: proLogin.cookie, proMember, salonId });
  const recoveryBaseline = [];
  await testCommissionsCash({
    request,
    prisma,
    cookie,
    proCookie: proLogin.cookie,
    proMember,
    salonId,
    otherMember,
  });
  if (process.env.BROWSER_TEST === '1')
    await testCommissionsCashBrowser({ cookie, proCookie: proLogin.cookie, root });
  if (process.env.BACKUP_TEST === '1') {
    for (const path of recoveryPaths) {
      const response = await request(path, { cookie });
      assert.equal(response.status, 200, path);
      recoveryBaseline.push(response.data);
    }
  }
  assert.equal((await request('/auth/logout', { method: 'POST', cookie })).status, 201);
  assert.equal((await request('/auth/me', { cookie })).status, 401);
  check('Logout revoga sessão no servidor');
  if (process.env.BACKUP_TEST === '1')
    await testBackup(databaseUrl, directory, (restoredUrl) =>
      testRecoveredApi({
        root,
        env,
        restoredUrl,
        baseline: recoveryBaseline,
        revokedCookie: cookie,
      }),
    );
  console.log('Todos os testes de integração passaram em PostgreSQL real e isolado.');
} catch (error) {
  console.error(
    error instanceof Error
      ? error.stack
      : (error ?? `PostgreSQL de teste não iniciou: ${databaseLog}`),
  );
  process.exitCode = 1;
  if (error?.stderr) console.error(error.stderr.toString());
  exitStatus = 1;
} finally {
  if (browser) await browser.close();
  await stop(web);
  await stop(server);
  if (prisma) await prisma.$disconnect();
  try {
    if (databaseStarted) await db.stop();
  } catch {}
}

// embedded-postgres registers an exit hook: pass status explicitly so a failed test never exits successfully.
process.exit(exitStatus);
