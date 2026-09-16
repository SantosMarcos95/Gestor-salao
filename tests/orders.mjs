import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testOrders({
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
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.create({
    data: { salonId, name: 'Cliente comandas', createdBy: admin.id, updatedBy: admin.id },
  });
  const otherClient = await prisma.client.create({
    data: { salonId, name: 'Outro cliente comandas', createdBy: admin.id, updatedBy: admin.id },
  });
  const professional = await prisma.professional.findFirstOrThrow({
    where: { salonId, membershipId: proMember.id },
  });
  const otherProfessional = await prisma.professional.create({
    data: { salonId, name: 'Equipe comandas' },
  });
  const service = await prisma.service.create({
    data: { salonId, name: 'Corte comandas', price: '85.50', durationMinutes: 30 },
  });
  const service2 = await prisma.service.create({
    data: { salonId, name: 'Escova comandas', price: '50.25', durationMinutes: 30 },
  });
  for (const p of [professional, otherProfessional])
    for (const s of [service, service2])
      await prisma.professionalService.create({
        data: { salonId, professionalId: p.id, serviceId: s.id },
      });
  const product = await prisma.product.create({
    data: { salonId, name: 'Creme comandas', baseUnit: 'g', minimum: '1', packages: [] },
  });
  const foreignProduct = await prisma.product.findFirstOrThrow({
    where: { salonId: otherMember.salonId },
  });
  const entry = await post(`/products/${product.id}/movements`, {
    kind: 'ENTRY',
    quantity: '10',
    unitCost: '0.012345',
    version: 1,
    reason: 'Entrada para teste de consumo',
  });
  assert.equal(entry.status, 201);
  assert.equal((await request('/orders')).status, 401);
  assert.equal((await post('/orders', { clientId: client.id }, proCookie)).status, 403);
  const foreignClient = await prisma.client.findFirstOrThrow({
    where: { salonId: otherMember.salonId },
  });
  assert.equal((await post('/orders', { clientId: foreignClient.id })).status, 404);
  const key = randomUUID();
  const opened = await Promise.all([
    post('/orders', { clientId: client.id, requestKey: key }),
    post('/orders', { clientId: client.id, requestKey: key }),
  ]);
  assert.deepEqual(
    opened.map((r) => r.status),
    [201, 201],
  );
  assert.equal(opened[0].data.id, opened[1].data.id);
  let order = opened[0].data;
  assert.equal((await post('/orders', { clientId: otherClient.id, requestKey: key })).status, 409);
  assert.equal((await get(`/orders/${order.id}`, proCookie)).status, 403);
  const addBody = {
    version: 1,
    professionalId: professional.id,
    serviceIds: [service.id, service2.id],
  };
  const added = await post(`/orders/${order.id}/visits`, addBody);
  assert.equal(added.status, 201, JSON.stringify(added));
  order = added.data;
  assert.equal(order.total, '135.75');
  let visit = order.visits[0];
  assert.equal((await get(`/visits/${visit.id}`, proCookie)).status, 200);
  assert.equal((await post(`/orders/${order.id}/ready`, { version: order.version })).status, 409);
  assert.equal(
    (
      await post(`/visits/${visit.id}/consumptions`, {
        version: visit.version,
        productId: product.id,
        quantity: '1',
        confirmed: true,
      })
    ).status,
    409,
  );
  const modified = await post(`/orders/${order.id}/visits/${visit.id}/prices`, {
    version: order.version,
    prices: [{ id: visit.items[0].id, price: '40.10' }],
  });
  assert.equal(modified.status, 201);
  order = modified.data;
  visit = order.visits[0];
  assert.equal(order.total, '90.35');
  assert.equal(
    (await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).price.toFixed(2),
    '85.50',
  );
  assert.equal(
    (await post(`/orders/${order.id}/discount`, { version: order.version, discount: '90.36' }))
      .status,
    400,
  );
  order = (await post(`/orders/${order.id}/discount`, { version: order.version, discount: '5.05' }))
    .data;
  assert.equal(order.total, '85.30');
  const another = await post(`/orders/${order.id}/visits`, {
    version: order.version,
    professionalId: otherProfessional.id,
    serviceIds: [service2.id],
  });
  assert.equal(another.status, 201);
  order = another.data;
  const second = order.visits.find((v) => v.professionalId === otherProfessional.id);
  assert.equal((await get(`/visits/${second.id}`, proCookie)).status, 404);
  assert.equal(
    (await post(`/visits/${second.id}/start`, { version: second.version }, proCookie)).status,
    404,
  );
  const startKey = randomUUID();
  const started = await Promise.all([
    post(`/visits/${visit.id}/start`, { version: visit.version, requestKey: startKey }, proCookie),
    post(`/visits/${visit.id}/start`, { version: visit.version, requestKey: startKey }, proCookie),
  ]);
  assert.deepEqual(
    started.map((r) => r.status),
    [201, 201],
  );
  visit = started[0].data;
  assert.equal(visit.status, 'IN_PROGRESS');
  assert.equal(
    (
      await post(
        `/visits/${visit.id}/consumptions`,
        { version: visit.version, productId: product.id, quantity: '1', confirmed: true },
        proCookie,
      )
    ).status,
    403,
  );
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'atendimentos.registrar_consumo' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: proMember.id, permissionId: permission.id, effect: 'ALLOW' },
  });
  assert.equal(
    (
      await post(
        `/visits/${visit.id}/consumptions`,
        { version: visit.version, productId: product.id, quantity: '1', confirmed: false },
        proCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        `/visits/${visit.id}/consumptions`,
        { version: visit.version, productId: foreignProduct.id, quantity: '1', confirmed: true },
        proCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await post(
        `/visits/${visit.id}/consumptions`,
        { version: visit.version, productId: product.id, quantity: '11', confirmed: true },
        proCookie,
      )
    ).status,
    400,
  );
  const consumeKey = randomUUID(),
    consumeBody = {
      version: visit.version,
      productId: product.id,
      quantity: '0.000001',
      confirmed: true,
      requestKey: consumeKey,
    };
  const consumed = await Promise.all([
    post(`/visits/${visit.id}/consumptions`, consumeBody, proCookie),
    post(`/visits/${visit.id}/consumptions`, consumeBody, proCookie),
  ]);
  assert.deepEqual(
    consumed.map((r) => r.status),
    [201, 201],
  );
  visit = consumed[0].data;
  assert.equal(visit.consumptions.length, 1);
  assert.ok(!('unitCost' in visit.consumptions[0]));
  assert.equal((await get(`/visits/${visit.id}`)).data.consumptions[0].unitCost, '0.012345');
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    '9.999999',
  );
  assert.equal(
    (await post(`/visits/${visit.id}/consumptions`, { ...consumeBody, quantity: '1' }, proCookie))
      .status,
    409,
  );
  const race = await Promise.all([
    post(
      `/visits/${visit.id}/consumptions`,
      { ...consumeBody, version: visit.version, quantity: '1', requestKey: randomUUID() },
      proCookie,
    ),
    post(`/visits/${visit.id}/complete`, { version: visit.version }, proCookie),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  visit = (await get(`/visits/${visit.id}`)).data;
  if (visit.status === 'IN_PROGRESS')
    visit = (await post(`/visits/${visit.id}/complete`, { version: visit.version }, proCookie))
      .data;
  assert.equal(visit.status, 'COMPLETED');
  order = (await get(`/orders/${order.id}`)).data;
  assert.equal(
    (
      await post(`/orders/${order.id}/visits/${visit.id}/prices`, {
        version: order.version,
        prices: [{ id: visit.items[0].id, price: '1' }],
      })
    ).status,
    409,
  );
  await assert.rejects(
    prisma.visitItem.update({ where: { id: visit.items[0].id }, data: { price: '1' } }),
  );
  const balance = (
    await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
  ).balance.toFixed(6);
  const cancelledSecond = await post(`/visits/${second.id}/cancel`, { version: second.version });
  assert.equal(cancelledSecond.status, 201);
  order = (await get(`/orders/${order.id}`)).data;
  assert.equal(order.total, '85.30');
  const readyKey = randomUUID();
  const ready = await Promise.all([
    post(`/orders/${order.id}/ready`, { version: order.version, requestKey: readyKey }),
    post(`/orders/${order.id}/ready`, { version: order.version, requestKey: readyKey }),
  ]);
  assert.deepEqual(
    ready.map((r) => r.status),
    [201, 201],
  );
  order = ready[0].data;
  assert.equal(order.status, 'READY');
  assert.equal(
    (await post(`/orders/${order.id}/discount`, { version: order.version, discount: '0' })).status,
    409,
  );
  assert.equal((await post(`/orders/${order.id}/cancel`, { version: order.version })).status, 201);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    balance,
  );
  // Import preserves the agreed appointment price; duplicate imports cannot create a second visit.
  let importedOrder = (await post('/orders', { clientId: client.id })).data;
  const location = await prisma.location.findFirstOrThrow({ where: { salonId } });
  const appointment = await prisma.appointment.create({
    data: {
      salonId,
      professionalId: professional.id,
      clientId: client.id,
      locationId: location.id,
      startsAt: new Date('2026-08-01T12:00Z'),
      endsAt: new Date('2026-08-01T12:30Z'),
      requestKey: randomUUID(),
      requestHash: 'b'.repeat(64),
      services: {
        create: {
          serviceId: service.id,
          name: 'Corte combinado',
          price: '25.15',
          durationMinutes: 30,
          position: 0,
        },
      },
    },
  });
  const directAppointment = await prisma.appointment.create({
    data: {
      salonId,
      professionalId: professional.id,
      clientId: client.id,
      locationId: location.id,
      startsAt: new Date('2026-08-03T12:00Z'),
      endsAt: new Date('2026-08-03T12:30Z'),
      requestKey: randomUUID(),
      requestHash: 'd'.repeat(64),
      services: {
        create: {
          serviceId: service.id,
          name: 'Corte direto da agenda',
          price: '35.20',
          durationMinutes: 30,
          position: 0,
        },
      },
    },
  });
  const directPath = `/orders/from-appointment/${directAppointment.id}`;
  assert.equal((await post(directPath, { appointmentVersion: 1 }, proCookie)).status, 403);
  const directKey = randomUUID();
  const directResults = await Promise.all([
    post(directPath, { appointmentVersion: 1, requestKey: directKey }),
    post(directPath, { appointmentVersion: 1, requestKey: directKey }),
  ]);
  assert.deepEqual(
    directResults.map((r) => r.status),
    [201, 201],
  );
  assert.equal(directResults[0].data.id, directResults[1].data.id);
  assert.equal(directResults[0].data.total, '35.20');
  assert.equal(directResults[0].data.visits[0].appointmentId, directAppointment.id);
  assert.equal(
    (await get(`/appointments/${directAppointment.id}`)).data.visit.orderId,
    directResults[0].data.id,
  );
  assert.equal(
    (await post(directPath, { appointmentVersion: 1 })).data.id,
    directResults[0].data.id,
  );
  assert.equal(await prisma.visit.count({ where: { appointmentId: directAppointment.id } }), 1);
  // Regression: a service completed only in the agenda can still be charged once.
  const completedAppointment = await prisma.appointment.create({
    data: {
      salonId,
      professionalId: professional.id,
      clientId: client.id,
      locationId: location.id,
      startsAt: new Date('2026-08-02T12:00Z'),
      endsAt: new Date('2026-08-02T12:30Z'),
      status: 'COMPLETED',
      requestKey: randomUUID(),
      requestHash: 'c'.repeat(64),
      services: {
        create: {
          serviceId: service.id,
          name: 'Corte concluído',
          price: '99.90',
          durationMinutes: 30,
          position: 0,
        },
      },
    },
  });
  let completedOrder = (await post('/orders', { clientId: client.id })).data;
  assert.ok(
    (await get(`/orders/${completedOrder.id}/appointments`)).data.items.some(
      (a) => a.id === completedAppointment.id,
    ),
  );
  const importKey = randomUUID();
  const completedPayload = {
    version: 1,
    appointmentId: completedAppointment.id,
    appointmentVersion: 1,
    requestKey: importKey,
  };
  const completedImport = await post(`/orders/${completedOrder.id}/import`, completedPayload);
  assert.equal(completedImport.status, 201, JSON.stringify(completedImport));
  completedOrder = completedImport.data;
  assert.equal(completedOrder.total, '99.90');
  assert.equal(completedOrder.visits[0].status, 'COMPLETED');
  assert.equal(completedOrder.visits[0].startedAt, null);
  assert.equal(completedOrder.visits[0].completedAt, null);
  assert.equal(
    (await post(`/orders/${completedOrder.id}/import`, completedPayload)).data.visits.length,
    1,
  );
  assert.equal(
    (
      await post(`/orders/${importedOrder.id}/import`, {
        version: 1,
        appointmentId: completedAppointment.id,
        appointmentVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(await prisma.orderSale.count({ where: { orderId: completedOrder.id } }), 0);
  completedOrder = (
    await post(`/orders/${completedOrder.id}/ready`, { version: completedOrder.version })
  ).data;
  const paid = await post(`/payments/${completedOrder.id}/checkout`, {
    version: completedOrder.version,
    confirmed: true,
    payments: [
      { method: 'CREDIT', amount: '50.00' },
      { method: 'DEBIT', amount: '49.90' },
    ],
  });
  assert.equal(paid.status, 201, JSON.stringify(paid));
  const today = (await get('/finance/context')).data.today;
  const sales = await get(`/finance?from=${today}&to=${today}&kind=sales`);
  const sale = sales.data.items.find((s) => s.orderId === completedOrder.id);
  assert.equal(sale.amount, '99.90');
  assert.deepEqual(sale.paymentMethods.sort(), ['CREDIT', 'DEBIT']);
  const imported = await post(`/orders/${importedOrder.id}/import`, {
    version: 1,
    appointmentId: appointment.id,
    appointmentVersion: 1,
  });
  assert.equal(imported.status, 201);
  importedOrder = imported.data;
  assert.equal(importedOrder.total, '25.15');
  const otherOrder = (await post('/orders', { clientId: client.id })).data;
  assert.equal(
    (
      await post(`/orders/${otherOrder.id}/import`, {
        version: 1,
        appointmentId: appointment.id,
        appointmentVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        cookie,
        body: { version: 1, status: 'CANCELLED' },
      })
    ).status,
    409,
  );
  let importedVisit = importedOrder.visits[0];
  importedVisit = (
    await post(`/visits/${importedVisit.id}/start`, { version: importedVisit.version }, proCookie)
  ).data;
  assert.equal(
    (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status,
    'ARRIVED',
  );
  // Audit failure rolls back both consumption and inventory.
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION order_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'Rollback consumo' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END; $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER order_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION order_test_audit()',
  );
  const failed = await post(`/visits/${importedVisit.id}/consumptions`, {
    version: importedVisit.version,
    productId: product.id,
    quantity: '1',
    confirmed: true,
    reason: 'Rollback consumo',
  });
  assert.equal(failed.status, 500);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).balance.toFixed(6),
    balance,
  );
  assert.equal(await prisma.visitConsumption.count({ where: { visitId: importedVisit.id } }), 0);
  await prisma.$executeRawUnsafe('DROP TRIGGER order_test_audit ON audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION order_test_audit()');
  importedVisit = (
    await post(`/visits/${importedVisit.id}/consumptions`, {
      version: importedVisit.version,
      productId: product.id,
      quantity: '1',
      confirmed: true,
    })
  ).data;
  assert.equal(
    (await post(`/visits/${importedVisit.id}/cancel`, { version: importedVisit.version })).status,
    201,
  );
  assert.equal(
    (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status,
    'CANCELLED',
  );
  assert.equal(await prisma.visitConsumption.count({ where: { visitId: importedVisit.id } }), 1);
  assert.ok((await get('/orders?status=all&clientId=' + client.id)).data.total >= 3);
  const foreignOrder = await prisma.salonOrder.create({
    data: {
      salonId: otherMember.salonId,
      clientId: foreignClient.id,
      clientName: foreignClient.name,
      createdBy: otherMember.id,
    },
  });
  assert.equal((await get(`/orders/${foreignOrder.id}`)).status, 404);
  assert.equal((await post(`/orders/${foreignOrder.id}/cancel`, { version: 1 })).status, 404);
  await assert.rejects(
    prisma.visit.create({
      data: {
        salonId,
        orderId: otherOrder.id,
        clientId: otherClient.id,
        professionalId: professional.id,
        professionalName: professional.name,
      },
    }),
  );
  console.log(
    '✓ Comandas e atendimentos: múltiplos profissionais, snapshots, descontos, escopo próprio, consumo único, concorrência, cancelamento sem devolução, vínculo de agenda e rollback',
  );
}

export async function testOrdersBrowser({ page, expect, root, join, prisma, salonId }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Comandas', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir comanda', exact: true }).click();
  await page.getByRole('button', { name: 'Cliente atualizado no navegador', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Abrir comanda', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Comanda de Cliente atualizado no navegador', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Adicionar atendimento', exact: true }).click();
  await page.getByLabel('Buscar profissional do atendimento').fill('Equipe da agenda');
  await page.getByRole('button', { name: 'Equipe da agenda', exact: true }).click();
  await page.getByLabel('Buscar serviço do atendimento').fill('Corte da agenda');
  await page.getByRole('button', { name: 'Corte da agenda', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Adicionar atendimento', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Editar valores', exact: true }).click();
  await page.getByLabel('Valor de Corte da agenda (R$)').fill('40,10');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Editar valores', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Aplicar desconto', exact: true }).click();
  await page.getByLabel('Desconto em reais').fill('5,05');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Aplicar desconto', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.locator('.order-summary')).toContainText('R$ 35,05');
  await page.getByRole('button', { name: 'Iniciar atendimento', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Iniciar atendimento', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Registrar consumo', exact: true }).click();
  await page.getByLabel('Buscar produto consumido').fill('Shampoo do navegador');
  await page.getByRole('button', { name: 'Shampoo do navegador', exact: true }).click();
  await page.getByLabel('Quantidade consumida (ml)').fill('0,5');
  await page
    .getByLabel('Confirmo que o produto foi utilizado e pode ser baixado do estoque.')
    .check();
  const product = await prisma.product.findFirstOrThrow({
    where: { salonId, name: 'Shampoo do navegador' },
  });
  const before = product.balance.toFixed(6);
  let interrupted = false;
  await page.route('**/api/visits/*/consumptions', async (route) => {
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
  await page.getByRole('button', { name: 'Confirmar consumo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Resposta interrompida no teste');
  await page.getByRole('button', { name: 'Confirmar consumo', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.unroute('**/api/visits/*/consumptions');
  const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(product.balance.minus(after.balance).toFixed(6), '0.500000');
  assert.notEqual(after.balance.toFixed(6), before);
  await page.getByRole('button', { name: 'Concluir atendimento', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concluir atendimento', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Finalizar e receber', exact: true }).click();
  await expect(page.getByLabel('Forma de pagamento 1', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.getByRole('status')).toContainText('Itens finalizados');
  await page.screenshot({
    path: join(root, '.local/screenshots/orders-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: join(root, '.local/screenshots/orders-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Atendimentos', exact: true }).click();
  await page.getByLabel('Status do atendimento', { exact: true }).selectOption('COMPLETED');
  await expect(
    page.locator('.visit-card').filter({ hasText: 'Cliente atualizado no navegador' }),
  ).toContainText('R$ 40,10');
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    '✓ Navegador: comanda, preço, desconto, atendimento, consumo com retry, finalização e celular',
  );
}
