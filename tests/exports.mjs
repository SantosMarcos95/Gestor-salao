import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export async function testExports({ request, prisma, cookie, proCookie, proMember, salonId }) {
  const paths = [
    '/reports/production/export?from=2025-07-01&to=2025-07-01&group=services',
    '/reports/occupancy/export?from=2025-07-01&to=2025-07-01&status=all',
    '/reports/stock/export?from=2025-07-01&to=2025-07-01&search=EstoqueRelatorio',
    '/reports/receipts/export?from=2025-06-01&to=2025-06-01&search=RecebimentoRelatorio',
  ];
  for (const path of paths) assert.equal((await request(path)).status, 401);
  const before = await prisma.auditLog.count({ where: { salonId, action: 'RELATORIO_EXPORTADO' } });
  const results = [];
  for (const path of paths) {
    const result = await request(path + '&page=2', { cookie });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.ok(result.data.filename.endsWith('.csv'));
    assert.ok(result.data.content.startsWith('\uFEFF'));
    assert.ok(result.data.content.includes('America/Sao_Paulo'));
    results.push(result.data.content);
  }
  assert.ok(results[0].includes('Corte relatório'));
  assert.ok(results[2].includes('EstoqueRelatorio Sem movimento 20'));
  assert.ok(results[2].includes('0,000001'));
  assert.ok(!results[2].includes('estrangeiro'));
  assert.equal(
    results[3].split('\r\n').filter((l) => l.startsWith('"RecebimentoRelatorio";')).length,
    24,
  );
  assert.ok(!results[3].includes('7,123456'));
  assert.equal(
    await prisma.auditLog.count({ where: { salonId, action: 'RELATORIO_EXPORTADO' } }),
    before + 4,
  );
  const last = await prisma.auditLog.findFirstOrThrow({
    where: { salonId, action: 'RELATORIO_EXPORTADO' },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(last.after.rows, 24);
  // Formula-like product names are untrusted text in the spreadsheet.
  await prisma.product.create({
    data: { salonId, name: '=1+1', baseUnit: 'un', minimum: '0', packages: [] },
  });
  const formula = await request(
    '/reports/stock/export?from=2025-07-01&to=2025-07-01&search=%3D1%2B1',
    { cookie },
  );
  assert.ok(formula.data.content.includes('"\'=1+1"'));
  assert.equal(
    (await request('/reports/stock/export?from=2025-02-30&to=2025-03-01', { cookie })).status,
    400,
  );
  // Export obeys the same report permission and value redaction as the screen.
  assert.equal((await request(paths[0], { cookie: proCookie })).status, 403);
  for (const [code, effect] of [
    ['relatorios.agenda', 'ALLOW'],
    ['relatorios.financeiro', 'DENY'],
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
  const limited = await request(paths[0], { cookie: proCookie });
  assert.equal(limited.status, 200);
  assert.ok(!limited.data.content.includes('Valor antes do desconto'));
  assert.ok(!limited.data.content.includes('40,40'));
  assert.equal((await request(paths[3], { cookie: proCookie })).status, 403);
  console.log(
    '✓ Exportações: todos os resultados, filtros, auditoria, autenticação, permissões, valores ocultos, precisão e fórmulas neutralizadas',
  );
}
export async function testExportBrowser({ page, expect }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Relatórios', exact: true }).click();
  await page.getByLabel('Tipo de relatório').selectOption('receipts');
  await page.getByLabel('Buscar cliente').fill('');
  await page.getByLabel('Tipo de lançamento', { exact: true }).selectOption('all');
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('PIX');
  await expect(page.getByRole('table', { name: 'Lançamentos detalhados' })).toContainText(
    'R$ 25,00',
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const download = await pending;
  assert.match(download.suggestedFilename(), /^recebimentos-.*\.csv$/);
  const content = await readFile(await download.path(), 'utf8');
  assert.ok(content.includes('PIX'));
  assert.ok(content.includes('25,00'));
  assert.ok(!content.includes('"Dinheiro"'));
  await expect(page.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
}
