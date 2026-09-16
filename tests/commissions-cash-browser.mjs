import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
export async function testCommissionsCashBrowser({ cookie, proCookie, root }) {
  const localLibs = join(root, '.local/browser-libs/extracted/usr/lib/x86_64-linux-gnu');
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(localLibs) ? { env: { ...process.env, LD_LIBRARY_PATH: localLibs } } : {}),
  });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const addCookie = async (ctx, value) => {
      const i = value.indexOf('=');
      await ctx.addCookies([
        { name: value.slice(0, i), value: value.slice(i + 1), domain: 'localhost', path: '/api' },
      ]);
    };
    await addCookie(context, cookie);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:5179/meu-financeiro');
    await expect(page.getByRole('heading', { name: 'Comissões da equipe' })).toBeVisible();
    await expect(page.getByText('Carregando lançamentos…')).toHaveCount(0);
    await page.screenshot({
      path: join(root, '.local/screenshots/commissions-desktop.png'),
      fullPage: true,
    });
    await page.goto('http://localhost:5179/profissionais');
    await page
      .getByRole('button', { name: 'Editar profissional Outra Comissão', exact: true })
      .click();
    await page.getByLabel('Comissão (%)', { exact: true }).fill('55');
    await page.getByLabel('Motivo da alteração').fill('Percentual pelo navegador');
    await page.getByRole('button', { name: 'Salvar profissional', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('http://localhost:5179/caixa');
    await expect(page.getByRole('heading', { name: 'Caixa aberto', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Registrar sangria', exact: true }).click();
    await page.getByLabel('Valor retirado').fill('5');
    await page.getByLabel('Motivo / observação').fill('Retirada pelo navegador');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Retirada pelo navegador', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click();
    await page.getByLabel('Dinheiro contado').fill('15');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Abrir caixa', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir caixa', exact: true }).click();
    await page.getByLabel('Saldo inicial em dinheiro').fill('15');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Caixa aberto', exact: true })).toBeVisible();
    await page.screenshot({
      path: join(root, '.local/screenshots/cash-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelector('.sidebar').getBoundingClientRect().right <= 0,
    );
    await page.screenshot({
      path: join(root, '.local/screenshots/cash-mobile.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const own = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await addCookie(own, proCookie);
    const proPage = await own.newPage();
    proPage.on('pageerror', (e) => errors.push(e.message));
    await proPage.goto('http://localhost:5179/meu-financeiro');
    await expect(
      proPage.getByRole('heading', { name: 'Meu financeiro', exact: true }),
    ).toBeVisible();
    await expect(proPage.getByText('Carregando lançamentos…')).toHaveCount(0);
    await expect(proPage.getByRole('cell', { name: 'Outra Comissão' })).toHaveCount(0);
    await expect(proPage.getByRole('combobox')).toHaveCount(0);
    assert.equal(
      await proPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await proPage.screenshot({
      path: join(root, '.local/screenshots/commissions-mobile.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      '✓ Navegador: comissão no cadastro, financeiro próprio, sangria, fechamento, reabertura, recarga e layouts sem transbordamento',
    );
  } finally {
    await browser.close();
  }
}
