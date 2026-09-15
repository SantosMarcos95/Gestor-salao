import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testAuditFilters({
  request,
  prisma,
  cookie,
  salonId,
  otherMember,
  proCookie,
  proMember,
}) {
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const entityId = randomUUID(),
    action = 'TESTE_AUDITORIA_FILTRO';
  const path = `/audit?from=2025-05-01&to=2025-05-01&action=${action}&entity=stock_movements&entityId=${entityId}&actorId=${admin.id}&reason=controle`;
  for (let i = 0; i < 21; i++)
    await prisma.auditLog.create({
      data: {
        salonId,
        actorId: admin.id,
        entity: 'stock_movements',
        entityId,
        action,
        reason: 'Controle de teste',
        requestId: randomUUID(),
        createdAt: new Date('2025-05-01T03:00Z'),
        after: { unitCost: '5.123456', quantity: '1' },
      },
    });
  await prisma.auditLog.create({
    data: {
      salonId,
      actorId: admin.id,
      entity: 'stock_movements',
      entityId,
      action,
      reason: 'Controle de teste',
      requestId: randomUUID(),
      createdAt: new Date('2025-05-02T03:00Z'),
    },
  });
  await prisma.auditLog.create({
    data: {
      salonId: otherMember.salonId,
      actorId: otherMember.id,
      entity: 'foreign_audit_entity',
      entityId: randomUUID(),
      action: 'FOREIGN_ONLY_FILTER',
      requestId: randomUUID(),
      createdAt: new Date('2025-05-01T12:00Z'),
    },
  });
  assert.equal((await request(path)).status, 401);
  const result = await request(path, { cookie });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.total, 21);
  assert.equal(result.data.items.length, 20);
  assert.equal(result.data.timezone, 'America/Sao_Paulo');
  const second = await request(path + '&page=2', { cookie });
  assert.equal(second.data.items.length, 1);
  assert.ok(!result.data.items.some((a) => a.id === second.data.items[0].id));
  assert.equal((await request(path.replace(admin.id, otherMember.id), { cookie })).data.total, 0);
  const context = await request('/audit/context', { cookie });
  assert.equal(context.status, 200);
  assert.ok(context.data.actions.includes(action));
  assert.ok(!context.data.actions.includes('FOREIGN_ONLY_FILTER'));
  assert.ok(!context.data.entities.includes('foreign_audit_entity'));
  const actors = await request('/audit/actors?search=&page=1', { cookie });
  assert.equal(actors.status, 200);
  assert.equal(actors.data.total, await prisma.salonUser.count({ where: { salonId } }));
  assert.ok(!actors.data.items.some((a) => a.id === otherMember.id));
  assert.ok(actors.data.items.every((a) => Object.keys(a).sort().join(',') === 'id,name'));
  for (const q of [
    'from=2025-02-30&to=2025-03-01',
    'from=2025-05-01',
    'from=2025-05-02&to=2025-05-01',
    'actorId=invalid',
    'entityId=invalid',
    'from=2023-01-01&to=2025-01-01',
  ])
    assert.equal((await request('/audit?' + q, { cookie })).status, 400);
  // Explicit permission denial leaves no metadata endpoint accessible.
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'auditoria.visualizar' },
  });
  await prisma.userPermissionOverride.upsert({
    where: {
      membershipId_permissionId: { membershipId: proMember.id, permissionId: permission.id },
    },
    create: { membershipId: proMember.id, permissionId: permission.id, effect: 'DENY' },
    update: { effect: 'DENY' },
  });
  for (const url of ['/audit/context', '/audit/actors', path])
    assert.equal((await request(url, { cookie: proCookie })).status, 403);
  // Existing cost visibility remains enforced when filters are applied.
  const cost = await prisma.permission.findUniqueOrThrow({
    where: { code: 'produtos.visualizar_custo' },
  });
  await prisma.userPermissionOverride.upsert({
    where: { membershipId_permissionId: { membershipId: admin.id, permissionId: cost.id } },
    create: { membershipId: admin.id, permissionId: cost.id, effect: 'DENY' },
    update: { effect: 'DENY' },
  });
  const redacted = await request(path, { cookie });
  assert.equal(redacted.data.items[0].after.unitCost, undefined);
  assert.equal(redacted.data.items[0].after.quantity, '1');
  console.log(
    '✓ Auditoria: filtros combinados, datas locais, paginação estável, metadados isolados, permissão e ocultação de custo preservada',
  );
}
export async function testAuditFiltersBrowser({ page, expect, root, join }) {
  await page.getByLabel('Ação', { exact: true }).selectOption('CLIENTE_ALTERADO');
  await page.getByLabel('Módulo', { exact: true }).selectOption('clients');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.locator('.audit-item').first()).toContainText('Cliente alterado');
  await page.getByLabel('Texto do motivo').fill('Nenhum motivo encontrado para teste');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(
    page.getByText('Nenhuma atividade encontrada com os filtros aplicados.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.audit-item').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: join(root, '.local/screenshots/audit-filters-desktop.png'),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: join(root, '.local/screenshots/audit-filters-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
