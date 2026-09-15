import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { testRecoveryBrowser } from './recovery-browser.mjs';

export const recoveryPaths = [
  '/clients',
  '/orders',
  '/products',
  '/finance/summary?from=2025-06-01&to=2025-06-01',
  '/reports/receipts?from=2025-06-01&to=2025-06-01&search=RecebimentoRelatorio',
  '/reports/stock?from=2025-07-01&to=2025-07-01&search=EstoqueRelatorio',
];

export async function testRecoveredApi({ root, env, restoredUrl, baseline, revokedCookie }) {
  env = { ...env, WEB_ORIGIN: 'http://localhost:5178' };
  const url = new URL(restoredUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '15439');
  assert.equal(url.pathname, '/salao_restore_ensaio');
  const server = spawn('node', ['apps/api/dist/main.js'], {
    cwd: root,
    env: { ...env, DATABASE_URL: restoredUrl, PORT: '3011' },
    stdio: 'ignore',
  });
  let spawnError;
  server.on('error', (error) => {
    spawnError = error;
  });
  async function request(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(`http://127.0.0.1:3011/api${path}`, {
      method,
      headers: {
        Origin: env.WEB_ORIGIN,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      assert.equal(server.exitCode, null, 'API restaurada encerrou antes de iniciar');
      try {
        ready = (await request('/health')).status === 200;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'API restaurada não iniciou');
    assert.equal((await request('/clients')).status, 401);
    assert.equal((await request('/auth/me', { cookie: revokedCookie })).status, 401);
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    assert.equal(login.status, 201);
    assert.ok(login.cookie);
    const cookie = login.cookie;
    for (const [index, path] of recoveryPaths.entries()) {
      const result = await request(path, { cookie });
      assert.equal(result.status, 200, path);
      assert.deepEqual(result.data, baseline[index], `Consulta recuperada divergente: ${path}`);
    }
    const created = await request('/clients', {
      method: 'POST',
      cookie,
      body: { name: 'Cliente exclusivo do ensaio de recuperação' },
    });
    assert.equal(created.status, 201);
    const clients = await request('/clients?search=Cliente%20exclusivo%20do%20ensaio', { cookie });
    assert.equal(clients.data.total, 1);
    assert.equal(clients.data.items[0].id, created.data.id);
    const audit = await request(`/audit?entityId=${created.data.id}`, { cookie });
    assert.equal(audit.status, 200);
    assert.ok(
      audit.data.items.some(
        (row) => row.entityId === created.data.id && row.action === 'CLIENTE_CRIADO',
      ),
    );
    assert.equal((await request('/auth/logout', { method: 'POST', cookie })).status, 201);
    assert.equal((await request('/auth/me', { cookie })).status, 401);
    console.log(
      '✓ API recuperada: login, sessão revogada, consultas equivalentes, cadastro auditado e logout; somente banco restaurado',
    );
    if (process.env.RECOVERY_BROWSER_TEST === '1')
      await testRecoveryBrowser({ root, env, baseline });
  } finally {
    if (server.pid && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
