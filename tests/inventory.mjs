import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testInventory({
  request,
  prisma,
  cookie,
  proCookie,
  proMember,
  otherMember,
  salonId,
}) {
  const productBody = {
    name: 'Shampoo integração',
    baseUnit: 'ml',
    minimum: '100.000001',
    packages: [{ name: 'Frasco', quantity: '1', unit: 'l' }],
    reason: 'Cadastro de estoque',
  };
  const post = (url, body, session = cookie) =>
    request(url, { method: 'POST', cookie: session, body });
  const patch = (url, body) => request(url, { method: 'PATCH', cookie, body });
  assert.equal((await request('/products')).status, 401);
  assert.equal((await request('/products', { cookie: proCookie })).status, 403);
  assert.equal((await post('/products', productBody, proCookie)).status, 403);
  assert.equal((await post('/products', { ...productBody, baseUnit: 'g' })).status, 400);
  const product = await post('/products', productBody);
  assert.equal(product.status, 201);
  const id = product.data.id;
  const path = `/products/${id}/movements`;
  const supplier = await post('/suppliers', {
    name: 'Fornecedor integração',
    phone: '11999998888',
    reason: 'Fornecedor de produtos',
  });
  assert.equal(supplier.status, 201);
  const foreignProduct = await prisma.product.create({
    data: {
      salonId: otherMember.salonId,
      name: 'Externo',
      baseUnit: 'ml',
      minimum: '0',
      packages: [],
    },
  });
  const foreignSupplier = await prisma.supplier.create({
    data: { salonId: otherMember.salonId, name: 'Externo' },
  });
  assert.equal((await request(`/products/${foreignProduct.id}/movements`, { cookie })).status, 404);
  const movement = {
    kind: 'ENTRY',
    quantity: '2',
    packageName: 'Frasco',
    supplierId: supplier.data.id,
    unitCost: '0.012345',
    version: 1,
    reason: 'Compra de dois frascos',
    requestKey: randomUUID(),
  };
  assert.equal((await post(path, { ...movement, supplierId: foreignSupplier.id })).status, 404);
  assert.equal((await prisma.product.findUnique({ where: { id } })).balance.toFixed(6), '0.000000');
  const duplicate = await Promise.all([post(path, movement), post(path, movement)]);
  assert.deepEqual(
    duplicate.map((x) => x.status),
    [201, 201],
  );
  assert.equal(duplicate[0].data.id, duplicate[1].data.id);
  assert.equal(duplicate[0].data.balanceAfter, '2000.000000');
  assert.equal(duplicate[0].data.unitCost, '0.012345');
  assert.equal(await prisma.stockMovement.count({ where: { productId: id } }), 1);
  assert.equal((await post(path, { ...movement, quantity: '3' })).status, 409);
  assert.equal(
    (
      await post(`/products/${foreignProduct.id}/movements`, {
        ...movement,
        requestKey: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal((await post(path, { ...movement, requestKey: randomUUID() })).status, 409);
  const loss = {
    kind: 'LOSS',
    quantity: '1500.000001',
    version: 2,
    reason: 'Perda de produto',
    requestKey: randomUUID(),
  };
  const race = await Promise.all([
    post(path, loss),
    post(path, { ...loss, requestKey: randomUUID() }),
  ]);
  assert.deepEqual(race.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    (await prisma.product.findUnique({ where: { id } })).balance.toFixed(6),
    '499.999999',
  );
  assert.equal((await post(path, { ...loss, version: 3, requestKey: randomUUID() })).status, 400);
  assert.equal(await prisma.stockMovement.count({ where: { productId: id } }), 2);
  const adjustment = {
    kind: 'ADJUST',
    quantity: '0',
    version: 3,
    reason: 'Contagem física zerada',
    requestKey: randomUUID(),
  };
  assert.equal((await post(path, adjustment)).data.delta, '-499.999999');
  assert.equal(
    (await post(path, { ...adjustment, version: 4, requestKey: randomUUID() })).status,
    400,
  );
  // Permissions and cost redaction are checked independently, including the audit endpoint.
  for (const code of ['produtos.visualizar', 'estoque.visualizar', 'auditoria.visualizar']) {
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.userPermissionOverride.upsert({
      where: { membershipId_permissionId: { membershipId: proMember.id, permissionId: perm.id } },
      create: { membershipId: proMember.id, permissionId: perm.id, effect: 'ALLOW' },
      update: { effect: 'ALLOW' },
    });
  }
  assert.equal(
    (
      await post(
        path,
        { ...adjustment, version: 4, quantity: '1', requestKey: randomUUID() },
        proCookie,
      )
    ).status,
    403,
  );
  const hidden = await request(path, { cookie: proCookie });
  assert.equal(hidden.status, 200);
  assert.ok(hidden.data.items.every((m) => !('unitCost' in m)));
  const audit = await request('/audit', { cookie: proCookie });
  assert.ok(
    audit.data.items
      .filter((a) => a.entity === 'stock_movements')
      .every((a) => !('unitCost' in a.after)),
  );
  const visible = await request(path, { cookie });
  assert.equal(visible.data.items.length, 3);
  assert.equal(
    visible.data.items.find((m) => m.kind === 'ENTRY').supplierName,
    'Fornecedor integração',
  );
  assert.equal(visible.data.items.find((m) => m.kind === 'ENTRY').packageSnapshot.quantity, '1');
  assert.equal(
    (await patch(`/products/${id}`, { ...productBody, baseUnit: 'g', packages: [], version: 4 }))
      .status,
    400,
  );
  const editRace = await Promise.all(
    ['Shampoo alterado A', 'Shampoo alterado B'].map((name) =>
      patch(`/products/${id}`, { ...productBody, name, version: 4 }),
    ),
  );
  assert.deepEqual(editRace.map((x) => x.status).sort(), [200, 409]);
  assert.equal(
    (
      await patch(`/products/${id}/status`, {
        active: false,
        version: 5,
        reason: 'Desativação temporária',
      })
    ).status,
    200,
  );
  assert.equal(
    (await post(path, { ...adjustment, quantity: '1', version: 6, requestKey: randomUUID() }))
      .status,
    400,
  );
  assert.equal(
    (await request('/products?status=inactive', { cookie })).data.items.some((p) => p.id === id),
    true,
  );
  assert.equal(
    (
      await patch(`/products/${id}/status`, {
        active: true,
        version: 6,
        reason: 'Retorno ao estoque',
      })
    ).status,
    200,
  );
  const max = {
    kind: 'ENTRY',
    quantity: '999999999999.999999',
    version: 7,
    reason: 'Teste do limite decimal',
    requestKey: randomUUID(),
  };
  assert.equal((await post(path, max)).data.balanceAfter, '999999999999.999999');
  assert.equal(
    (await post(path, { ...max, quantity: '0.000001', version: 8, requestKey: randomUUID() }))
      .status,
    400,
  );
  assert.equal(await prisma.stockMovement.count({ where: { productId: id } }), 4);
  await assert.rejects(
    prisma.stockMovement.update({
      where: { id: duplicate[0].data.id },
      data: { reason: 'Reescrever histórico' },
    }),
  );
  await assert.rejects(prisma.stockMovement.delete({ where: { id: duplicate[0].data.id } }));
  await assert.rejects(prisma.product.update({ where: { id }, data: { balance: '-1' } }));
  // Transaction rolls back the stock balance if audit insertion fails.
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION inventory_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'Teste rollback estoque' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END; $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER inventory_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION inventory_test_reject_audit()`,
  );
  const rollback = await post(path, {
    kind: 'OUT',
    quantity: '1',
    version: 8,
    reason: 'Teste rollback estoque',
    requestKey: randomUUID(),
  });
  assert.equal(rollback.status, 500);
  assert.equal(
    (await prisma.product.findUnique({ where: { id } })).balance.toFixed(6),
    '999999999999.999999',
  );
  assert.equal(await prisma.stockMovement.count({ where: { productId: id } }), 4);
  await prisma.$executeRawUnsafe('DROP TRIGGER inventory_test_audit ON audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION inventory_test_reject_audit()');
  console.log(
    '✓ Estoque: conversões, precisão, concorrência, idempotência, escopo, permissões, custos, histórico imutável e rollback',
  );
}
export async function testInventoryBrowser({ page, expect, root, join }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Fornecedores', exact: true }).click();
  await page.getByRole('button', { name: 'Novo fornecedor', exact: true }).click();
  await page.getByLabel('Nome do fornecedor').fill('Fornecedor do navegador');
  await page.getByLabel('Motivo da alteração').fill('Cadastro pelo navegador');
  await page.getByRole('button', { name: 'Salvar fornecedor', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('link', { name: 'Produtos e estoque', exact: true }).click();
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await page.getByLabel('Nome do produto').fill('Shampoo do navegador');
  await page.getByLabel('Estoque mínimo').fill('500');
  await page.getByRole('button', { name: 'Adicionar embalagem' }).click();
  await page.getByLabel('Nome da embalagem 1').fill('Frasco');
  await page.getByLabel('Conteúdo 1', { exact: true }).fill('1');
  await page.getByLabel('Unidade do conteúdo 1').selectOption('l');
  await page.getByLabel('Motivo da alteração').fill('Cadastro pelo navegador');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await page.getByRole('button', { name: 'Movimentar Shampoo do navegador', exact: true }).click();
  await page.getByLabel('Quantidade', { exact: true }).fill('2');
  await page.getByLabel('Medida', { exact: true }).selectOption('Frasco');
  await page.getByRole('button', { name: 'Fornecedor do navegador', exact: true }).click();
  await page.getByLabel('Custo por ml em reais (opcional)').fill('0,025');
  await page.getByLabel('Motivo da movimentação').fill('Entrada de dois frascos');
  let interrupted = false;
  await page.route('**/api/products/*/movements', async (route) => {
    if (route.request().method() === 'POST' && !interrupted) {
      interrupted = true;
      const committed = await route.fetch();
      assert.equal(committed.status(), 201, await committed.text());
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Resposta interrompida no teste' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Registrar movimentação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Resposta interrompida no teste');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.unroute('**/api/products/*/movements');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.getByRole('row').filter({ hasText: 'Shampoo do navegador' })).toContainText(
    '2000 / 500 ml',
  );
  await page.screenshot({
    path: join(root, '.local/screenshots/inventory-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Movimentar Shampoo do navegador', exact: true }).click();
  await page.getByLabel('Tipo de movimentação').selectOption('LOSS');
  await page.getByLabel('Quantidade', { exact: true }).fill('1600,5');
  await page.getByLabel('Motivo da movimentação').fill('Perda registrada no celular');
  await page.getByRole('button', { name: 'Registrar movimentação', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.getByRole('row').filter({ hasText: 'Shampoo do navegador' })).toContainText(
    '399,5 / 500 ml',
  );
  await expect(page.getByRole('row').filter({ hasText: 'Shampoo do navegador' })).toContainText(
    'Reposição necessária',
  );
  await page.screenshot({
    path: join(root, '.local/screenshots/inventory-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page
    .getByRole('button', { name: 'Histórico de Shampoo do navegador', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Entrada de dois frascos');
  await expect(page.getByRole('dialog')).toContainText('Perda registrada no celular');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    '✓ Navegador: fornecedor, embalagem, entrada, perda, estoque mínimo e histórico no celular',
  );
}
