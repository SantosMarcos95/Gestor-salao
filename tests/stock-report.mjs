import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
export async function testStockReport({
  request,
  prisma,
  cookie,
  proCookie,
  proMember,
  salonId,
  otherMember,
}) {
  const path = '/reports/stock?from=2025-07-01&to=2025-07-01&search=EstoqueRelatorio';
  const get = (suffix = '', auth = cookie) => request(path + suffix, { cookie: auth });
  assert.equal((await request(path)).status, 401);
  assert.equal((await get('', proCookie)).status, 403);
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const product = await prisma.product.create({
    data: {
      salonId,
      name: 'EstoqueRelatorio A',
      baseUnit: 'g',
      packages: [],
      minimum: '10',
      balance: '2.123456',
    },
  });
  await prisma.product.create({
    data: {
      salonId,
      name: 'EstoqueRelatorio B',
      baseUnit: 'ml',
      packages: [],
      minimum: '5',
      balance: '5',
    },
  });
  await prisma.product.create({
    data: {
      salonId,
      name: 'EstoqueRelatorio Inativo',
      baseUnit: 'un',
      packages: [],
      minimum: '5',
      balance: '0',
      active: false,
    },
  });
  for (let i = 0; i < 21; i++)
    await prisma.product.create({
      data: {
        salonId,
        name: `EstoqueRelatorio Sem movimento ${String(i).padStart(2, '0')}`,
        baseUnit: 'un',
        packages: [],
        minimum: '0',
        balance: '1',
      },
    });
  await prisma.product.create({
    data: {
      salonId: otherMember.salonId,
      name: 'EstoqueRelatorio estrangeiro',
      baseUnit: 'g',
      packages: [],
      minimum: '999',
    },
  });
  async function movement(kind, quantity, delta, time = '2025-07-01T12:00Z') {
    return prisma.stockMovement.create({
      data: {
        salonId,
        productId: product.id,
        actorId: admin.id,
        kind,
        quantity,
        delta,
        balanceBefore: '10',
        balanceAfter: new Prisma.Decimal('10').plus(delta).toFixed(6),
        productName: 'Nome antigo',
        baseUnit: 'g',
        unitCost: kind === 'ENTRY' ? '7.123456' : null,
        reason: 'Teste isolado',
        requestKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        createdAt: new Date(time),
      },
    });
  }
  const consumption = await movement('OUT', '0.000001', '-0.000001', '2025-07-01T03:00Z');
  const visit = await prisma.visit.findFirstOrThrow({ where: { salonId, status: 'CANCELLED' } });
  await prisma.visitConsumption.create({
    data: { salonId, visitId: visit.id, movementId: consumption.id, unitCost: '7.123456' },
  });
  await movement('OUT', '2', '-2');
  await movement('LOSS', '1', '-1');
  await movement('ENTRY', '3', '3');
  await movement('ADJUST', '8', '-2');
  await movement('ENTRY', '100', '100', '2025-07-02T03:00Z');
  const result = await get();
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(result.data.summary, { products: 23, replenish: 2, consumed: 1 });
  assert.equal(result.data.items.length, 20);
  const row = result.data.items.find((r) => r.id === product.id);
  assert.equal(row.consumed, '0.000001');
  assert.equal(row.manual, '2.000000');
  assert.equal(row.losses, '1.000000');
  assert.equal(row.entries, '3.000000');
  assert.equal(row.adjustments, '-2.000000');
  assert.equal(row.balance, '2.123456');
  assert.equal(row.needed, '7.876544');
  assert.equal('unitCost' in row, false);
  assert.equal((await get('&page=2')).data.items.length, 3);
  assert.deepEqual((await get('&page=2')).data.summary, result.data.summary);
  const replenishment = await get('&replenish=needed&status=all');
  assert.equal(replenishment.data.total, 2);
  assert.equal(
    replenishment.data.items.find((r) => r.name === 'EstoqueRelatorio B').needed,
    '0.000000',
  );
  assert.equal((await get('&status=all')).data.total, 24);
  const emptyPeriod = await request(
    '/reports/stock?from=2025-07-03&to=2025-07-03&search=EstoqueRelatorio',
    { cookie },
  );
  assert.equal(emptyPeriod.data.summary.consumed, 0);
  assert.equal(emptyPeriod.data.summary.replenish, 2);
  for (const q of [
    'from=2025-02-30&to=2025-03-01',
    'from=2025-07-02&to=2025-07-01',
    'from=2023-01-01&to=2025-01-01',
  ])
    assert.equal((await request('/reports/stock?' + q, { cookie })).status, 400);
  // Stock reports can be authorized independently of agenda and financial reports.
  for (const [code, effect] of [
    ['relatorios.estoque', 'ALLOW'],
    ['relatorios.agenda', 'DENY'],
  ]) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.userPermissionOverride.upsert({
      where: {
        membershipId_permissionId: { membershipId: proMember.id, permissionId: permission.id },
      },
      create: { membershipId: proMember.id, permissionId: permission.id, effect },
      update: { effect },
    });
  }
  assert.equal((await get('', proCookie)).status, 200);
  assert.equal((await request('/reports/stock/context', { cookie: proCookie })).status, 200);
  assert.equal((await request('/reports/context', { cookie: proCookie })).status, 403);
  console.log(
    '✓ Relatório de estoque: seis casas, consumo cancelado preservado, perdas/baixas/ajustes separados, saldo atual, igualdade ao mínimo, escopo, permissões, datas e paginação',
  );
}
export async function testStockReportBrowser({ page, expect, root, join }) {
  await page.getByLabel('Tipo de relatório').selectOption('stock');
  await expect(page.getByRole('heading', { name: 'Consumo e reposição de estoque' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('table').locator('summary').first().click();
  await expect(page.getByRole('table')).toContainText('Baixas manuais:');
  await page.screenshot({
    path: join(root, '.local/screenshots/stock-report-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: join(root, '.local/screenshots/stock-report-mobile.png'),
    fullPage: true,
  });
  await page.getByLabel('Buscar produto').fill('Sem produto de teste encontrado');
  await expect(page.getByText('Nenhum produto encontrado para estes filtros.')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
}
