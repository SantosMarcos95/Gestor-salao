import assert from 'node:assert/strict';
export async function testReceiptsReport({
  request,
  prisma,
  cookie,
  proCookie,
  proMember,
  salonId,
  otherMember,
}) {
  const path = '/reports/receipts?from=2025-06-01&to=2025-06-01&search=RecebimentoRelatorio';
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, { cookie: proCookie })).status, 403);
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  async function order(sid, actor) {
    const client = await prisma.client.create({
      data: { salonId: sid, name: 'RecebimentoRelatorio', createdBy: actor, updatedBy: actor },
    });
    const o = await prisma.salonOrder.create({
      data: {
        salonId: sid,
        clientId: client.id,
        clientName: client.name,
        createdBy: actor,
        status: 'DUE',
        subtotal: '30.51',
        total: '30.51',
      },
    });
    await prisma.orderSale.create({
      data: {
        salonId: sid,
        orderId: o.id,
        actorId: actor,
        total: '30.51',
        createdAt: new Date('2025-05-01T12:00Z'),
      },
    });
    return o;
  }
  const o = await order(salonId, admin.id);
  const cash = await prisma.payment.create({
    data: {
      salonId,
      orderId: o.id,
      actorId: admin.id,
      method: 'CASH',
      amount: '10.10',
      tendered: '20',
      change: '9.90',
      reason: '',
      reference: 'Comprovante teste',
      createdAt: new Date('2025-06-01T03:00Z'),
    },
  });
  const past = await prisma.payment.create({
    data: {
      salonId,
      orderId: o.id,
      actorId: admin.id,
      method: 'PIX',
      amount: '20.20',
      tendered: '20.20',
      change: '0',
      reason: '',
      createdAt: new Date('2025-05-01T12:00Z'),
    },
  });
  for (let i = 0; i < 21; i++)
    await prisma.payment.create({
      data: {
        salonId,
        orderId: o.id,
        actorId: admin.id,
        method: 'DEBIT',
        amount: '0.01',
        tendered: '0.01',
        change: '0',
        reason: '',
        createdAt: new Date('2025-06-01T12:00Z'),
      },
    });
  for (const [payment, amount] of [
    [past, '5.05'],
    [cash, '1.00'],
  ])
    await prisma.paymentRefund.create({
      data: {
        salonId,
        paymentId: payment.id,
        actorId: admin.id,
        amount,
        reason: 'Devolução teste',
        createdAt: new Date('2025-06-02T02:59:59.999Z'),
      },
    });
  await prisma.paymentRefund.create({
    data: {
      salonId,
      paymentId: past.id,
      actorId: admin.id,
      amount: '1',
      reason: '',
      createdAt: new Date('2025-06-02T03:00Z'),
    },
  });
  const foreign = await order(otherMember.salonId, otherMember.id);
  await prisma.payment.create({
    data: {
      salonId: otherMember.salonId,
      orderId: foreign.id,
      actorId: otherMember.id,
      method: 'PIX',
      amount: '1',
      tendered: '1',
      change: '0',
      reason: '',
      createdAt: new Date('2025-06-01T12:00Z'),
    },
  });
  const get = (extra = '') => request(path + extra, { cookie });
  const r = await get();
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.total, 24);
  assert.deepEqual(r.data.summary, {
    received: '10.31',
    refunded: '6.05',
    net: '4.26',
    change: '9.90',
  });
  assert.equal(r.data.items.length, 20);
  const second = await get('&page=2');
  assert.equal(second.data.items.length, 4);
  assert.deepEqual(second.data.summary, r.data.summary);
  assert.ok(
    second.data.items.every((v) => !r.data.items.some((i) => i.id === v.id && i.kind === v.kind)),
  );
  const pix = await get('&method=PIX');
  assert.deepEqual(pix.data.summary, {
    received: '0.00',
    refunded: '5.05',
    net: '-5.05',
    change: '0.00',
  });
  assert.equal(pix.data.items[0].paymentId, past.id);
  assert.equal(pix.data.items[0].kind, 'refund');
  assert.equal((await get('&kind=payment')).data.summary.net, '10.31');
  assert.equal((await get('&kind=refund')).data.summary.net, '-6.05');
  assert.equal((await get('&method=CREDIT')).data.total, 0);
  assert.equal(r.data.byMethod.find((m) => m.method === 'CREDIT').net, '0.00');
  assert.equal(
    (await request('/reports/receipts?from=2025-06-01&to=2025-06-01&search=%25', { cookie })).data
      .total,
    0,
  );
  for (const q of [
    'from=2025-02-30&to=2025-03-01',
    'from=2025-06-02&to=2025-06-01',
    'from=2023-01-01&to=2025-01-01',
    'from=2025-06-01&to=2025-06-01&method=INVALID',
  ])
    assert.equal((await request('/reports/receipts?' + q, { cookie })).status, 400);
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'relatorios.financeiro' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: proMember.id, permissionId: permission.id, effect: 'ALLOW' },
  });
  assert.equal((await request(path, { cookie: proCookie })).status, 200);
  assert.equal((await request('/reports/receipts/context', { cookie: proCookie })).status, 200);
  console.log(
    '✓ Recebimentos detalhados: filtros, totais exatos, estornos de pagamentos antigos, troco separado, fuso, isolamento, autorização e paginação',
  );
}
export async function testReceiptsReportBrowser({ page, expect, root, join }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Relatórios', exact: true }).click();
  await page.getByLabel('Tipo de relatório').selectOption('receipts');
  await expect(page.getByRole('heading', { name: 'Recebimentos detalhados' })).toBeVisible();
  await expect(page.locator('.finance-card').filter({ hasText: 'Total recebido' })).toContainText(
    'R$ 40,10',
  );
  await expect(page.locator('.finance-card').filter({ hasText: 'Total estornado' })).toContainText(
    'R$ 40,10',
  );
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('PIX');
  await expect(page.locator('.finance-card').filter({ hasText: 'Total recebido' })).toContainText(
    'R$ 25,00',
  );
  await page.getByLabel('Tipo de lançamento', { exact: true }).selectOption('refund');
  await expect(page.locator('.finance-card').filter({ hasText: 'Total líquido' })).toContainText(
    'R$ -25,00',
  );
  await expect(page.getByRole('table', { name: 'Lançamentos detalhados' })).toContainText(
    'Estorno',
  );
  await page.screenshot({
    path: join(root, '.local/screenshots/receipts-report-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: join(root, '.local/screenshots/receipts-report-mobile.png'),
    fullPage: true,
  });
  await page.getByLabel('Buscar cliente').fill('Nenhum cliente encontrado neste teste');
  await expect(page.getByText('Nenhum lançamento encontrado para estes filtros.')).toBeVisible();
}
