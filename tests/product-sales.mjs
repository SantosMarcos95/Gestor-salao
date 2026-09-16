import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testProductSales({
  request,
  prisma,
  cookie,
  proCookie,
  otherMember,
  salonId,
}) {
  const post = (path, body = {}, auth = cookie) =>
    request(path, { method: 'POST', cookie: auth, body: { requestKey: randomUUID(), ...body } });
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.create({
    data: { salonId, name: 'Cliente produtos vendidos', createdBy: admin.id, updatedBy: admin.id },
  });
  const product = await prisma.product.create({
    data: {
      salonId,
      name: 'Frasco para venda',
      baseUnit: 'ml',
      minimum: '0',
      packages: [],
      salePrice: '30.00',
      saleQuantity: '500',
    },
  });
  const foreign = await prisma.product.create({
    data: {
      salonId: otherMember.salonId,
      name: 'Produto externo para venda',
      baseUnit: 'un',
      minimum: '0',
      packages: [],
      salePrice: '10.00',
    },
  });
  const entry = await post(`/products/${product.id}/movements`, {
    kind: 'ENTRY',
    quantity: '1000',
    version: 1,
    reason: 'Entrada para venda',
  });
  assert.equal(entry.status, 201, JSON.stringify(entry));
  const opened = await post('/orders', { clientId: client.id });
  assert.equal(opened.status, 201);
  let order = opened.data;
  assert.equal((await request('/orders/options/products')).status, 401);
  assert.equal(
    (
      await post(
        `/orders/${order.id}/products`,
        { version: order.version, productId: product.id, units: 1 },
        proCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(`/orders/${order.id}/products`, {
        version: order.version,
        productId: foreign.id,
        units: 1,
      })
    ).status,
    404,
  );
  const addKey = randomUUID();
  const added = await Promise.all([
    post(`/orders/${order.id}/products`, {
      version: order.version,
      productId: product.id,
      units: 1,
      requestKey: addKey,
    }),
    post(`/orders/${order.id}/products`, {
      version: order.version,
      productId: product.id,
      units: 1,
      requestKey: addKey,
    }),
  ]);
  assert.deepEqual(
    added.map((r) => r.status),
    [201, 201],
  );
  order = added[0].data;
  assert.equal(order.total, '30.00');
  assert.equal(order.productItems.length, 1);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    '1000.000000',
  );
  const line = order.productItems[0];
  const removed = await post(`/orders/${order.id}/products/${line.id}/remove`, {
    version: order.version,
  });
  assert.equal(removed.status, 201, JSON.stringify(removed));
  order = removed.data;
  assert.equal(order.total, '0.00');
  order = (
    await post(`/orders/${order.id}/products`, {
      version: order.version,
      productId: product.id,
      units: 1,
    })
  ).data;
  order = (await post(`/orders/${order.id}/discount`, { version: order.version, discount: '5.00' }))
    .data;
  assert.equal(order.total, '25.00');
  const ready = await post(`/orders/${order.id}/ready`, { version: order.version });
  assert.equal(ready.status, 201, JSON.stringify(ready));
  order = ready.data;
  const key = randomUUID();
  const paid = await Promise.all([
    post(`/payments/${order.id}/checkout`, {
      version: order.version,
      confirmed: true,
      payments: [{ method: 'PIX', amount: '25.00' }],
      requestKey: key,
    }),
    post(`/payments/${order.id}/checkout`, {
      version: order.version,
      confirmed: true,
      payments: [{ method: 'PIX', amount: '25.00' }],
      requestKey: key,
    }),
  ]);
  assert.deepEqual(
    paid.map((r) => r.status),
    [201, 201],
    JSON.stringify(paid),
  );
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    '500.000000',
  );
  assert.equal(
    await prisma.stockMovement.count({ where: { productId: product.id, kind: 'SALE' } }),
    1,
  );
  assert.equal(
    (await prisma.orderProductItem.findFirstOrThrow({ where: { orderId: order.id } }))
      .movementId !== null,
    true,
  );
  const stockContext = await request('/reports/stock/context', { cookie });
  const stockReport = await request(
    `/reports/stock?from=${stockContext.data.today}&to=${stockContext.data.today}&search=Frasco%20para%20venda`,
    { cookie },
  );
  assert.equal(stockReport.status, 200);
  assert.equal(stockReport.data.items[0].sold, '500.000000');
  assert.equal(stockReport.data.items[0].manual, '0.000000');
  assert.equal(
    (
      await post(`/orders/${order.id}/products`, {
        version: paid[0].data.order.version,
        productId: product.id,
        units: 1,
      })
    ).status,
    409,
  );

  const second = await post('/orders', { clientId: client.id });
  let next = (
    await post(`/orders/${second.data.id}/products`, {
      version: second.data.version,
      productId: product.id,
      units: 1,
    })
  ).data;
  next = (
    await post(`/orders/${next.id}/products`, {
      version: next.version,
      productId: product.id,
      units: 1,
    })
  ).data;
  next = (await post(`/orders/${next.id}/ready`, { version: next.version })).data;
  const insufficient = await post(`/payments/${next.id}/checkout`, {
    version: next.version,
    confirmed: true,
    payments: [{ method: 'PIX', amount: '60.00' }],
  });
  assert.equal(insufficient.status, 409, JSON.stringify(insufficient));
  assert.equal(await prisma.orderSale.count({ where: { orderId: next.id } }), 0);
  assert.equal(
    await prisma.stockMovement.count({ where: { productId: product.id, kind: 'SALE' } }),
    1,
  );
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    '500.000000',
  );

  const retail = await prisma.product.create({
    data: {
      salonId,
      name: 'Produto com serviço',
      baseUnit: 'un',
      minimum: '0',
      packages: [],
      balance: '2',
      salePrice: '50.00',
      saleQuantity: '1',
    },
  });
  const professional = await prisma.professional.create({
    data: { salonId, name: 'Profissional venda mista', commissionRate: '60.00' },
  });
  const service = await prisma.service.create({
    data: { salonId, name: 'Serviço da venda mista', price: '100.00', durationMinutes: 30 },
  });
  const mixed = await prisma.salonOrder.create({
    data: {
      salonId,
      clientId: client.id,
      clientName: client.name,
      createdBy: admin.id,
      status: 'OPEN',
      subtotal: '150.00',
      discount: '30.00',
      total: '120.00',
    },
  });
  const visit = await prisma.visit.create({
    data: {
      salonId,
      orderId: mixed.id,
      clientId: client.id,
      professionalId: professional.id,
      professionalName: professional.name,
    },
  });
  await prisma.visitItem.create({
    data: {
      salonId,
      visitId: visit.id,
      serviceId: service.id,
      name: service.name,
      durationMinutes: 30,
      price: '100.00',
      position: 0,
    },
  });
  await prisma.orderProductItem.create({
    data: {
      salonId,
      orderId: mixed.id,
      productId: retail.id,
      productName: retail.name,
      baseUnit: 'un',
      saleQuantity: '1',
      units: 1,
      unitPrice: '50.00',
      total: '50.00',
    },
  });
  await prisma.visit.update({
    where: { id: visit.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  await prisma.salonOrder.update({
    where: { id: mixed.id },
    data: { status: 'READY', readyAt: new Date() },
  });
  const mixedPaid = await post(`/payments/${mixed.id}/checkout`, {
    version: mixed.version,
    confirmed: true,
    payments: [{ method: 'PIX', amount: '120.00' }],
  });
  assert.equal(mixedPaid.status, 201, JSON.stringify(mixedPaid));
  const basis = await prisma.commissionBasis.findFirstOrThrow({ where: { orderId: mixed.id } });
  assert.equal(basis.base.toFixed(2), '80.00');
  const commission = await prisma.commissionEntry.findFirstOrThrow({
    where: { basisId: basis.id },
  });
  assert.equal(commission.amount.toFixed(2), '48.00');
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: retail.id } })).balance.toFixed(6),
    '1.000000',
  );
}

export async function testProductSalesBrowser({ page, expect, prisma, salonId, root, join }) {
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.create({
    data: { salonId, name: 'Cliente venda visual', createdBy: admin.id, updatedBy: admin.id },
  });
  const product = await prisma.product.create({
    data: {
      salonId,
      name: 'Frasco venda visual',
      baseUnit: 'ml',
      minimum: '0',
      packages: [],
      balance: '1000',
      salePrice: '35.00',
      saleQuantity: '500',
    },
  });
  const order = await prisma.salonOrder.create({
    data: {
      salonId,
      clientId: client.id,
      clientName: client.name,
      createdBy: admin.id,
    },
  });
  await page.goto('http://localhost:5179/produtos');
  await page.getByLabel('Buscar por nome').fill('Frasco venda visual');
  await page.getByRole('button', { name: 'Editar produto Frasco venda visual' }).click();
  await expect(page.getByLabel('Preço de venda por unidade (R$)')).toHaveValue('35,00');
  await expect(page.getByLabel('Quantidade em cada unidade vendida (ml)')).toHaveValue('500');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await page.goto(`http://localhost:5179/comandas/${order.id}`);
  await page.getByRole('heading', { name: 'Comanda de Cliente venda visual' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Adicionar produto', exact: true }).click();
  await page.getByLabel('Buscar produto à venda').fill('Frasco venda visual');
  await page.getByRole('button', { name: 'Frasco venda visual', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('R$ 35,00 por unidade de 500 ml');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Adicionar produto', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.locator('.order-summary')).toContainText('R$ 35,00');
  await expect(page.getByRole('heading', { name: 'Produtos da comanda' })).toBeVisible();
  await page.screenshot({
    path: join(root, '.local/screenshots/product-sale-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: join(root, '.local/screenshots/product-sale-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover produto' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.locator('.order-summary')).toContainText('R$ 0,00');
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    '1000.000000',
  );
}
