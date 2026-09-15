import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
export async function testFinance({
  request,
  prisma,
  cookie,
  proCookie,
  proMember,
  otherMember,
  salonId,
}) {
  const post = (path, body = {}, auth = cookie) =>
    request(path, { method: 'POST', cookie: auth, body: { requestKey: randomUUID(), ...body } });
  const get = (path, auth = cookie) => request(path, { cookie: auth });
  const context = await get('/finance/context');
  assert.equal(context.status, 200);
  const period = `from=${context.data.today}&to=${context.data.today}`;
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.findFirstOrThrow({ where: { salonId, deletedAt: null } });
  const order = await prisma.salonOrder.create({
    data: {
      salonId,
      clientId: client.id,
      clientName: 'Cliente financeiro',
      createdBy: admin.id,
      status: 'READY',
      subtotal: '35.05',
      total: '35.05',
      readyAt: new Date(),
    },
  });
  const path = `/payments/${order.id}`;
  assert.equal((await request('/finance/context')).status, 401);
  assert.equal((await get('/finance/context', proCookie)).status, 403);
  assert.equal((await get(path, proCookie)).status, 403);
  const body = {
    version: 1,
    confirmed: true,
    payments: [
      { method: 'CASH', amount: '10.05', tendered: '20' },
      { method: 'PIX', amount: '25.00' },
    ],
  };
  assert.equal((await post(path + '/checkout', body, proCookie)).status, 403);
  for (const payments of [
    [{ method: 'CASH', amount: '-1' }],
    [{ method: 'PIX', amount: 35.05 }],
    [{ method: 'PIX', amount: '35.051' }],
    [{ method: 'FAKE', amount: '35.05' }],
    [{ method: 'PIX', amount: '35.05', tendered: '40' }],
    [{ method: 'CASH', amount: '35.05', tendered: '35' }],
    [{ method: 'PIX', amount: '35' }],
  ])
    assert.equal((await post(path + '/checkout', { ...body, payments })).status, 400);
  assert.equal((await post(path + '/checkout', { ...body, confirmed: false })).status, 400);
  const key = randomUUID(),
    paid = await Promise.all([
      post(path + '/checkout', { ...body, requestKey: key }),
      post(path + '/checkout', { ...body, requestKey: key }),
    ]);
  assert.deepEqual(
    paid.map((r) => r.status),
    [201, 201],
  );
  let data = paid[0].data;
  assert.equal(data.order.status, 'CLOSED');
  assert.equal(data.sale.payments.length, 2);
  assert.equal(data.sale.netReceived, '35.05');
  assert.equal(data.sale.due, '0.00');
  const cash = data.sale.payments.find((p) => p.method === 'CASH');
  assert.equal(cash.change, '9.95');
  assert.equal(cash.tendered, '20.00');
  assert.equal(await prisma.orderSale.count({ where: { orderId: order.id } }), 1);
  assert.equal(
    (await post(path + '/checkout', { ...body, requestKey: key, reason: 'different' })).status,
    409,
  );
  assert.equal((await post(path + '/checkout', body)).status, 409);
  assert.equal(
    (await post(`/orders/${order.id}/cancel`, { version: data.order.version })).status,
    409,
  );
  assert.equal(
    (
      await post(path + '/refund', {
        version: data.order.version,
        paymentId: cash.id,
        amount: '10.06',
        confirmed: true,
      })
    ).status,
    400,
  );
  const refundKey = randomUUID(),
    refundBody = {
      version: data.order.version,
      paymentId: cash.id,
      amount: '5.05',
      confirmed: true,
      requestKey: refundKey,
    };
  const refunds = await Promise.all([
    post(path + '/refund', refundBody),
    post(path + '/refund', refundBody),
  ]);
  assert.deepEqual(
    refunds.map((r) => r.status),
    [201, 201],
  );
  data = refunds[0].data;
  assert.equal(data.order.status, 'DUE');
  assert.equal(data.sale.due, '5.05');
  assert.equal(data.sale.total, '35.05');
  assert.equal(data.sale.netReceived, '30.00');
  const dueList = await get(`/finance?${period}&kind=due`);
  assert.equal(dueList.status, 200);
  assert.equal(dueList.data.items.find((r) => r.orderId === order.id).amount, '5.05');
  // A payment and a competing reversal serialize on the order and cannot both use the old version.
  const compete = await Promise.all([
    post(path + '/checkout', {
      version: data.order.version,
      confirmed: true,
      payments: [{ method: 'DEBIT', amount: '5.05' }],
    }),
    post(path + '/refund', {
      version: data.order.version,
      paymentId: cash.id,
      amount: '1',
      confirmed: true,
    }),
  ]);
  assert.deepEqual(compete.map((r) => r.status).sort(), [201, 409]);
  data = (await get(path)).data;
  if (data.order.status === 'DUE')
    data = (
      await post(path + '/checkout', {
        version: data.order.version,
        confirmed: true,
        payments: [{ method: 'OTHER', amount: data.sale.due }],
      })
    ).data;
  assert.equal(data.sale.netReceived, '35.05');
  assert.equal(await prisma.orderSale.count({ where: { orderId: order.id } }), 1);
  await assert.rejects(prisma.payment.update({ where: { id: cash.id }, data: { amount: '1' } }));
  await assert.rejects(prisma.payment.delete({ where: { id: cash.id } }));
  await assert.rejects(
    prisma.orderSale.update({ where: { id: data.sale.id }, data: { total: '1' } }),
  );
  await assert.rejects(
    prisma.paymentRefund.create({
      data: { salonId, paymentId: cash.id, actorId: admin.id, amount: '100', reason: '' },
    }),
  );
  const foreignOrder = await prisma.salonOrder.findFirstOrThrow({
    where: { salonId: otherMember.salonId },
  });
  assert.equal((await get(`/payments/${foreignOrder.id}`)).status, 404);
  assert.equal((await post(`/payments/${foreignOrder.id}/checkout`, body)).status, 404);
  const otherOrder = await prisma.salonOrder.create({
    data: {
      salonId,
      clientId: client.id,
      clientName: 'Comanda zero',
      createdBy: admin.id,
      status: 'READY',
      subtotal: '0',
      total: '0',
    },
  });
  const zero = await post(`/payments/${otherOrder.id}/checkout`, {
    version: 1,
    payments: [],
    confirmed: true,
  });
  assert.equal(zero.status, 201);
  assert.equal(zero.data.sale.payments.length, 0);
  assert.equal(zero.data.order.status, 'CLOSED');
  assert.equal(
    (
      await post(path + '/refund', {
        version: data.order.version,
        paymentId: randomUUID(),
        amount: '1',
        confirmed: true,
      })
    ).status,
    404,
  );
  const cancelKey = randomUUID(),
    cancel = await Promise.all([
      post(path + '/void', { version: data.order.version, confirmed: true, requestKey: cancelKey }),
      post(path + '/void', { version: data.order.version, confirmed: true, requestKey: cancelKey }),
    ]);
  assert.deepEqual(
    cancel.map((r) => r.status),
    [201, 201],
  );
  data = cancel[0].data;
  assert.equal(data.order.status, 'CANCELLED');
  assert.equal(data.sale.netReceived, '0.00');
  assert.equal(data.sale.due, '0.00');
  assert.equal(data.sale.void.total, '35.05');
  assert.equal(await prisma.saleVoid.count({ where: { orderId: order.id } }), 1);
  assert.equal(
    (await post(path + '/checkout', { version: data.order.version, confirmed: true, payments: [] }))
      .status,
    409,
  );
  // A reversal this period does not rewrite the original sale/receipt dates.
  const historic = await prisma.salonOrder.create({
    data: {
      salonId,
      clientId: client.id,
      clientName: 'Histórico financeiro',
      createdBy: admin.id,
      status: 'CLOSED',
      subtotal: '2',
      total: '2',
    },
  });
  await prisma.orderSale.create({
    data: {
      salonId,
      orderId: historic.id,
      actorId: admin.id,
      total: '2',
      createdAt: new Date('2026-01-01T15:00:00Z'),
    },
  });
  const pastPayment = await prisma.payment.create({
    data: {
      salonId,
      orderId: historic.id,
      actorId: admin.id,
      amount: '2',
      tendered: '2',
      change: '0',
      method: 'PIX',
      reason: '',
      createdAt: new Date('2026-01-01T15:00:00Z'),
    },
  });
  const beforeSummary = (await get(`/finance/summary?${period}`)).data;
  assert.equal(
    (
      await post(`/payments/${historic.id}/refund`, {
        version: 1,
        paymentId: pastPayment.id,
        amount: '2',
        confirmed: true,
      })
    ).status,
    201,
  );
  const summary = (await get(`/finance/summary?${period}`)).data;
  assert.equal(summary.sales, beforeSummary.sales);
  assert.equal(summary.received, beforeSummary.received);
  const past = (await get('/finance/summary?from=2026-01-01&to=2026-01-01')).data;
  assert.equal(past.sales, '2.00');
  assert.equal(past.received, '2.00');
  assert.equal(past.refunded, '0.00');
  assert.equal(
    summary.netReceived,
    new Prisma.Decimal(beforeSummary.netReceived).minus('2.00').toFixed(2),
  );
  assert.equal((await get('/finance/summary?from=2026-02-30&to=2026-03-01')).status, 400);
  assert.equal((await get('/finance/summary?from=2026-03-01&to=2026-02-01')).status, 400);
  // Audit failure must roll back the sale, payment, command and status.
  const failedOrder = await prisma.salonOrder.create({
    data: {
      salonId,
      clientId: client.id,
      clientName: 'Rollback financeiro',
      createdBy: admin.id,
      status: 'READY',
      subtotal: '1',
      total: '1',
    },
  });
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION finance_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'Rollback financeiro' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END; $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER finance_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION finance_test_audit()',
  );
  const failure = await post(`/payments/${failedOrder.id}/checkout`, {
    version: 1,
    confirmed: true,
    payments: [{ method: 'PIX', amount: '1' }],
    reason: 'Rollback financeiro',
  });
  assert.equal(failure.status, 500);
  assert.equal(await prisma.orderSale.count({ where: { orderId: failedOrder.id } }), 0);
  assert.equal(await prisma.payment.count({ where: { orderId: failedOrder.id } }), 0);
  assert.equal(
    (await prisma.salonOrder.findUniqueOrThrow({ where: { id: failedOrder.id } })).status,
    'READY',
  );
  await prisma.$executeRawUnsafe('DROP TRIGGER finance_test_audit ON audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION finance_test_audit()');
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'financeiro.visualizar' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: proMember.id, permissionId: permission.id, effect: 'ALLOW' },
  });
  assert.equal((await get('/finance/context', proCookie)).status, 200);
  assert.equal((await get(path, proCookie)).status, 200);
  assert.equal(
    (
      await post(
        `/payments/${failedOrder.id}/checkout`,
        { version: 1, confirmed: true, payments: [{ method: 'PIX', amount: '1' }] },
        proCookie,
      )
    ).status,
    403,
  );
  console.log(
    '✓ Financeiro: pagamento dividido, troco, precisão, idempotência, estorno parcial, venda única, concorrência, datas, isolamento, permissões, cancelamento e rollback',
  );
}
export async function testFinanceBrowser({ page, expect, root, join, prisma, salonId }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Comandas', exact: true }).click();
  await page.getByLabel('Status da comanda', { exact: true }).selectOption('READY');
  await page
    .getByRole('row')
    .filter({ hasText: 'Cliente atualizado no navegador' })
    .getByRole('link', { name: 'Ver comanda', exact: true })
    .click();
  await page.getByRole('button', { name: 'Receber pagamento', exact: true }).click();
  await page.getByLabel('Valor aplicado 1 (R$)').fill('10,05');
  await page.getByLabel('Dinheiro entregue 1 (R$)').fill('20');
  await page.getByRole('button', { name: 'Adicionar forma de pagamento' }).click();
  await page.getByLabel('Valor aplicado 2 (R$)').fill('25,00');
  await expect(page.getByRole('dialog')).toContainText('Troco: R$ 9,95');
  await page.getByLabel('Confirmo os dados e o recebimento dos valores informados.').check();
  let interrupted = false;
  await page.route('**/api/payments/*/checkout', async (route) => {
    if (!interrupted) {
      interrupted = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201, await response.text());
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Resposta interrompida no teste' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Resposta interrompida no teste');
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.unroute('**/api/payments/*/checkout');
  await expect(page.locator('.page-heading')).toContainText('Quitada');
  const order = await prisma.salonOrder.findFirstOrThrow({
    where: { salonId, status: 'CLOSED', clientName: 'Cliente atualizado no navegador' },
  });
  assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Estornar Dinheiro', exact: true }).click();
  await page.getByLabel('Valor do estorno (R$)').fill('5,05');
  await page
    .getByLabel('Confirmo a devolução ou correção dos valores e os dados do estorno.')
    .check();
  await page.getByRole('button', { name: 'Confirmar estorno', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.locator('.page-heading')).toContainText('Saldo pendente');
  await page.getByRole('button', { name: 'Receber pagamento', exact: true }).click();
  await page.getByLabel('Forma de pagamento 1', { exact: true }).selectOption('OTHER');
  await page.getByLabel('Confirmo os dados e o recebimento dos valores informados.').check();
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.screenshot({
    path: join(root, '.local/screenshots/payments-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Cancelar venda e estornar', exact: true }).click();
  await page
    .getByLabel('Confirmo a devolução ou correção dos valores e os dados do estorno.')
    .check();
  await page.getByRole('button', { name: 'Confirmar cancelamento da venda', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.locator('.page-heading')).toContainText('Cancelada');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('link', { name: 'Financeiro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Financeiro', exact: true })).toBeVisible();
  await expect(page.getByLabel('Lançamentos', { exact: true })).toHaveValue('payments');
  await expect(
    page.locator('.finance-card').filter({ hasText: 'Total recebido no período' }),
  ).toContainText('R$ 40,10');
  await expect(
    page.locator('.finance-card').filter({ hasText: 'Estornos no período' }),
  ).toContainText('R$ 40,10');
  await expect(
    page.locator('.finance-card').filter({ hasText: 'Total líquido do período' }),
  ).toContainText('R$ 0,00');
  await expect(
    page.locator('.finance-card').filter({ hasText: 'Cartão de crédito' }),
  ).toContainText('R$ 0,00');
  await page.getByLabel('Lançamentos', { exact: true }).selectOption('sales');
  await expect(page.getByRole('table')).toContainText('Dinheiro + PIX');
  await page.getByLabel('Lançamentos', { exact: true }).selectOption('payments');
  await expect(page.getByRole('table')).toContainText('Cliente atualizado no navegador');
  await page.screenshot({
    path: join(root, '.local/screenshots/finance-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: join(root, '.local/screenshots/finance-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    '✓ Navegador: pagamento dividido, troco, retry sem duplicação, estorno, novo recebimento, cancelamento e financeiro no celular',
  );
}
