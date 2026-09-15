import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

export async function testRecoveryBrowser({ root, env, baseline }) {
  const web = spawn(
    'node',
    [
      join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5178',
      '--strictPort',
    ],
    {
      cwd: join(root, 'apps/web'),
      env: { ...env, API_PROXY_TARGET: 'http://127.0.0.1:3011' },
      stdio: 'ignore',
    },
  );
  let browser, spawnError;
  web.on('error', (error) => {
    spawnError = error;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      assert.equal(web.exitCode, null, 'Interface recuperada encerrou antes de iniciar');
      try {
        ready = (await fetch(env.WEB_ORIGIN, { signal: AbortSignal.timeout(1000) })).ok;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Interface recuperada não iniciou');
    const localLibs = join(root, '.local/browser-libs/extracted/usr/lib/x86_64-linux-gnu');
    browser = await chromium.launch({
      headless: true,
      ...(existsSync(localLibs) ? { env: { ...process.env, LD_LIBRARY_PATH: localLibs } } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(env.WEB_ORIGIN);
    await page.getByLabel('E-mail', { exact: true }).fill(env.ADMIN_EMAIL);
    await page.getByLabel('Senha', { exact: true }).fill(env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar no salão' }).click();
    await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();
    await page.getByRole('link', { name: 'Clientes', exact: true }).click();
    // Este cliente existe apenas na cópia: comprova também o destino do proxy da interface.
    const search = page.getByLabel('Buscar cliente por nome, telefone ou e-mail');
    await search.fill('Cliente exclusivo do ensaio de recuperação');
    await expect(
      page.getByRole('button', {
        name: 'Editar Cliente exclusivo do ensaio de recuperação',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Novo cliente' }).click();
    await page.getByLabel('Nome completo').fill('Cliente recuperado pelo navegador');
    await page.getByRole('button', { name: 'Salvar cliente' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await search.fill('Cliente recuperado pelo navegador');
    await expect(
      page.getByRole('button', { name: 'Editar Cliente recuperado pelo navegador', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByLabel('Buscar cliente por nome, telefone ou e-mail')
      .fill('Cliente recuperado pelo navegador');
    await expect(
      page.getByRole('button', { name: 'Editar Cliente recuperado pelo navegador', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Relatórios', exact: true }).click();
    await page.getByLabel('Tipo de relatório').selectOption('receipts');
    await page.getByLabel('De', { exact: true }).fill('2025-06-01');
    await page.getByLabel('Até', { exact: true }).fill('2025-06-01');
    await page.getByLabel('Buscar cliente').fill('RecebimentoRelatorio');
    const money = (value) => `R$ ${value.replace('.', ',')}`;
    assert.ok(baseline[4].total > 0);
    for (const [label, key] of [
      ['Total recebido', 'received'],
      ['Total estornado', 'refunded'],
      ['Total líquido', 'net'],
    ]) {
      await expect(page.locator('.finance-card').filter({ hasText: label })).toContainText(
        money(baseline[4].summary[key]),
      );
    }
    await expect(page.getByRole('table', { name: 'Lançamentos detalhados' })).toBeVisible();
    await mkdir(join(root, '.local/screenshots'), { recursive: true });
    await page.screenshot({
      path: join(root, '.local/screenshots/recovery-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({
      path: join(root, '.local/screenshots/recovery-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Entrar no salão' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrar no salão' })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      '✓ Navegador recuperado: login, destino isolado, cadastro persistente, recebimentos conciliados, desktop/celular e logout sem erros de JavaScript',
    );
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      if (web.pid && web.exitCode === null) {
        const exited = once(web, 'exit');
        web.kill('SIGTERM');
        const timer = setTimeout(() => web.kill('SIGKILL'), 5000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }
}
