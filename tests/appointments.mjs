import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testAppointments({
  request,
  prisma,
  cookie,
  proCookie,
  salonId,
  otherMember,
  proMember,
}) {
  const reason = 'Agendamento de integração';
  const location = await prisma.location.findFirstOrThrow({ where: { salonId } });
  const foreignLocation = await prisma.location.create({
    data: { salonId: otherMember.salonId, name: 'Unidade agenda externa' },
  });
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.create({
    data: { salonId, name: 'Cliente agenda', createdBy: admin.id, updatedBy: admin.id },
  });
  const unrelated = await prisma.client.create({
    data: { salonId, name: 'Cliente sem relação', createdBy: admin.id, updatedBy: admin.id },
  });
  const external = await prisma.client.create({
    data: {
      salonId: otherMember.salonId,
      name: 'Cliente externo agenda',
      createdBy: otherMember.id,
      updatedBy: otherMember.id,
    },
  });
  const p = await prisma.professional.create({ data: { salonId, name: 'Profissional agenda' } });
  const p2 = await prisma.professional.create({ data: { salonId, name: 'Profissional agenda 2' } });
  const own = await prisma.professional.findFirstOrThrow({
    where: { salonId, membershipId: proMember.id },
  });
  const foreign = await prisma.professional.findFirstOrThrow({
    where: { salonId: otherMember.salonId },
  });
  const s1 = await prisma.service.create({
    data: { salonId, name: 'Corte agenda', price: '85.50', durationMinutes: 30 },
  });
  const s2 = await prisma.service.create({
    data: { salonId, name: 'Escova agenda', price: '50.25', durationMinutes: 30 },
  });
  for (const professional of [p, p2, own]) {
    await prisma.workPeriod.deleteMany({ where: { professionalId: professional.id } });
    await prisma.workPeriod.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => [
        { salonId, professionalId: professional.id, weekday, startMinute: 540, endMinute: 720 },
        { salonId, professionalId: professional.id, weekday, startMinute: 780, endMinute: 1080 },
      ]).flat(),
    });
    await prisma.professionalService.createMany({
      data: [s1, s2].map((s) => ({ salonId, professionalId: professional.id, serviceId: s.id })),
    });
  }
  const body = {
    professionalId: p.id,
    clientId: client.id,
    locationId: location.id,
    startLocal: '2026-10-05T09:00',
    serviceIds: [s1.id, s2.id],
    notes: 'Preferência do cliente',
    reason,
  };
  const create = (data = {}, auth = cookie) =>
    request('/appointments', {
      method: 'POST',
      cookie: auth,
      body: { ...body, requestKey: randomUUID(), ...data },
    });
  const patch = (id, data, auth = cookie, suffix = '') =>
    request(`/appointments/${id}${suffix}`, { method: 'PATCH', cookie: auth, body: data });
  assert.equal((await request('/appointments?date=2026-10-05')).status, 401);
  assert.equal((await request('/appointments?date=2026-02-30', { cookie })).status, 400);
  assert.equal((await request('/appointments?date=2026-10-05&days=30', { cookie })).status, 400);
  assert.equal(
    (await request(`/appointments?date=2026-10-05&professionalId=${foreign.id}`, { cookie }))
      .status,
    404,
  );
  assert.equal((await create({ professionalId: foreign.id })).status, 404);
  assert.equal((await create({ clientId: external.id })).status, 404);
  assert.equal((await create({ locationId: foreignLocation.id })).status, 404);
  assert.equal((await create({ salonId: otherMember.salonId })).status, 400);
  assert.equal((await create({ serviceIds: [s1.id, s1.id] })).status, 400);
  assert.equal((await create({ startLocal: '2026-10-05T08:59' })).status, 409);
  assert.equal((await create({ startLocal: '2026-10-05T11:30' })).status, 409);
  assert.equal((await create({}, proCookie)).status, 404);
  assert.equal(
    (await create({ professionalId: own.id, clientId: unrelated.id }, proCookie)).status,
    404,
  );
  const requestKey = randomUUID();
  const duplicates = await Promise.all([1, 2].map(() => create({ requestKey })));
  assert.deepEqual(
    duplicates.map((r) => r.status),
    [201, 201],
  );
  const a = duplicates[0].data;
  assert.equal(a.id, duplicates[1].data.id);
  assert.equal(a.startsAt, '2026-10-05T12:00:00.000Z');
  assert.equal(a.endsAt, '2026-10-05T13:00:00.000Z');
  assert.equal(a.total, '135.75');
  assert.equal(a.services[0].price, '85.50');
  assert.ok(!('requestHash' in a));
  assert.equal(
    await prisma.auditLog.count({ where: { entityId: a.id, action: 'AGENDAMENTO_CRIADO' } }),
    1,
  );
  assert.equal((await create({ requestKey, notes: 'Conteúdo diferente' })).status, 409);
  assert.equal((await create()).status, 409);
  assert.equal((await create({ startLocal: '2026-10-05T10:00' })).status, 201); // adjacent
  const race = await Promise.all([1, 2].map(() => create({ startLocal: '2026-10-05T13:00' })));
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const ownAppointment = await create({ professionalId: own.id });
  assert.equal(ownAppointment.status, 201);
  // Quoted prices are scoped to the appointment and do not change the catalog.
  for (const price of ['-1', '0.001', '1e2', '1000000000000', 10]) {
    assert.equal((await create({ servicePrices: [{ serviceId: s1.id, price }] })).status, 400);
  }
  assert.equal(
    (await create({ servicePrices: [{ serviceId: randomUUID(), price: '1.00' }] })).status,
    400,
  );
  assert.equal(
    (
      await create({
        servicePrices: [
          { serviceId: s1.id, price: '1' },
          { serviceId: s1.id, price: '2' },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await patch(
        ownAppointment.data.id,
        {
          ...body,
          professionalId: own.id,
          version: 1,
          servicePrices: [{ serviceId: s1.id, price: '1.00' }],
        },
        proCookie,
      )
    ).status,
    403,
  );
  const customKey = randomUUID();
  const customBody = {
    startLocal: '2026-10-12T09:00',
    reason: undefined,
    requestKey: customKey,
    servicePrices: [
      { serviceId: s1.id, price: '0' },
      { serviceId: s2.id, price: '0.10' },
    ],
  };
  const custom = await create(customBody);
  assert.equal(custom.status, 201);
  assert.equal(custom.data.total, '0.10');
  assert.equal(custom.data.services[0].price, '0.00');
  assert.equal((await create(customBody)).data.id, custom.data.id);
  assert.equal(
    (await create({ ...customBody, servicePrices: [{ serviceId: s1.id, price: '1' }] })).status,
    409,
  );
  assert.equal(
    (await prisma.service.findUniqueOrThrow({ where: { id: s1.id } })).price.toFixed(2),
    '85.50',
  );
  const customEdits = await Promise.all(
    ['12.34', '15.67'].map((price) =>
      patch(custom.data.id, {
        ...body,
        startLocal: '2026-10-12T10:00',
        version: 1,
        reason: '',
        servicePrices: [{ serviceId: s1.id, price }],
      }),
    ),
  );
  assert.deepEqual(customEdits.map((r) => r.status).sort(), [200, 409]);
  const customEdited = customEdits.find((r) => r.status === 200).data;
  const kept = await patch(custom.data.id, {
    ...body,
    startLocal: '2026-10-12T11:00',
    version: 2,
    reason: null,
  });
  assert.equal(kept.status, 200);
  assert.equal(kept.data.total, customEdited.total);
  const priceAudit = await prisma.auditLog.findFirstOrThrow({
    where: { entityId: custom.data.id, action: 'AGENDAMENTO_ALTERADO' },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(priceAudit.before.services[0].price, '0.00');
  assert.equal(priceAudit.after.total, customEdited.total);
  assert.equal(priceAudit.reason, '');
  assert.equal(
    (await patch(custom.data.id, { version: 3, status: 'CONFIRMED' }, cookie, '/status')).status,
    200,
  );
  const ownList = (await request('/appointments?date=2026-10-05', { cookie: proCookie })).data;
  assert.equal(ownList.professionals.length, 1);
  assert.ok(ownList.items.every((v) => v.professionalId === own.id));
  assert.equal((await request(`/appointments/${a.id}`, { cookie: proCookie })).status, 404);
  assert.equal(
    (await request(`/appointments?date=2026-10-05&professionalId=${p.id}`, { cookie: proCookie }))
      .status,
    404,
  );
  assert.equal(
    (
      await request(`/appointments/services?professionalId=${p.id}&action=criar`, {
        cookie: proCookie,
      })
    ).status,
    404,
  );
  const clients = (await request('/appointments/clients?action=criar', { cookie: proCookie })).data;
  assert.ok(clients.items.some((c) => c.id === client.id));
  assert.ok(!clients.items.some((c) => c.id === unrelated.id || c.id === external.id));
  assert.equal(
    (await create({ professionalId: own.id, startLocal: '2026-10-05T10:00' }, proCookie)).status,
    201,
  );
  assert.equal(
    (
      await patch(
        ownAppointment.data.id,
        { ...body, version: 1, professionalId: p2.id, startLocal: '2026-10-05T14:00' },
        proCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await patch(
        a.id,
        { ...body, version: 1, professionalId: own.id, startLocal: '2026-10-05T14:00' },
        proCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await patch(a.id, { version: 1, status: 'CANCELLED', reason }, proCookie, '/status')).status,
    404,
  );
  assert.equal(
    (
      await patch(
        ownAppointment.data.id,
        { version: 1, status: 'CONFIRMED', reason },
        proCookie,
        '/status',
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/appointments/${ownAppointment.data.id}`, { cookie: proCookie })).data.status,
    'CONFIRMED',
  );
  await prisma.service.update({
    where: { id: s1.id },
    data: { price: '99.90', durationMinutes: 90 },
  });
  const edits = await Promise.all(
    ['14:00', '15:00'].map((hour) =>
      patch(a.id, { ...body, version: 1, startLocal: `2026-10-05T${hour}` }),
    ),
  );
  assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
  const updated = edits.find((r) => r.status === 200).data;
  assert.equal(updated.total, '135.75');
  assert.equal(updated.services[0].durationMinutes, 30);
  assert.equal(
    (await patch(a.id, { version: 2, status: 'NO_SHOW', reason }, cookie, '/status')).status,
    409,
  );
  assert.equal(
    (await patch(a.id, { version: 2, status: 'CONFIRMED', reason }, cookie, '/status')).status,
    200,
  );
  const details = (await request(`/appointments/${a.id}`, { cookie })).data;
  assert.equal(details.history.length, 3);
  assert.equal(details.status, 'CONFIRMED');
  assert.equal(
    (await patch(a.id, { version: 3, status: 'CANCELLED', reason: '   ' }, cookie, '/status'))
      .status,
    400,
  );
  const cancellations = await Promise.all(
    [1, 2].map(() => patch(a.id, { version: 3, status: 'CANCELLED', reason }, cookie, '/status')),
  );
  assert.deepEqual(cancellations.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await patch(a.id, { version: 4, status: 'SCHEDULED', reason }, cookie, '/status')).status,
    409,
  );
  assert.equal((await patch(a.id, { ...body, version: 4 }, cookie)).status, 409);
  assert.equal(
    (
      await create({
        startLocal:
          updated.startsAt.slice(0, 10) +
          'T' +
          String(new Date(updated.startsAt).getUTCHours() - 3).padStart(2, '0') +
          ':00',
        serviceIds: [s2.id],
      })
    ).status,
    201,
  );
  const blockBody = {
    startLocal: '2026-10-06T09:00',
    endLocal: '2026-10-06T11:00',
    description: 'Indisponível',
    reason,
  };
  const block = (data, professionalId = p.id) =>
    request(`/availability/${professionalId}/blocks`, { method: 'POST', cookie, body: data });
  assert.equal(
    (await block({ ...blockBody, startLocal: '2026-10-05T10:00', endLocal: '2026-10-05T11:00' }))
      .status,
    409,
  );
  assert.equal((await block(blockBody)).status, 201);
  assert.equal(
    (await create({ startLocal: blockBody.startLocal, serviceIds: [s2.id] })).status,
    409,
  );
  const blockRace = await Promise.all([
    create({ professionalId: p2.id, startLocal: '2026-10-07T09:00', serviceIds: [s2.id] }),
    block({ ...blockBody, startLocal: '2026-10-07T09:00', endLocal: '2026-10-07T10:00' }, p2.id),
  ]);
  assert.deepEqual(blockRace.map((r) => r.status).sort(), [201, 409]);
  const professional = await prisma.professional.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(
    (
      await request(`/availability/${p.id}/work`, {
        method: 'PUT',
        cookie,
        body: { version: professional.version, reason, periods: [] },
      })
    ).status,
    409,
  );
  assert.equal(
    (await prisma.professional.findUniqueOrThrow({ where: { id: p.id } })).version,
    professional.version,
  );
  const inactive = await prisma.service.create({
    data: { salonId, name: 'Não vinculado', price: '0', durationMinutes: 30 },
  });
  assert.equal(
    (await create({ startLocal: '2026-10-08T09:00', serviceIds: [inactive.id] })).status,
    400,
  );
  await prisma.service.update({ where: { id: s2.id }, data: { active: false } });
  assert.equal((await create({ startLocal: '2026-10-08T09:00', serviceIds: [s2.id] })).status, 400);
  await prisma.service.update({ where: { id: s2.id }, data: { active: true } });
  const past = await create({ startLocal: '2026-08-01T09:00', serviceIds: [s2.id] });
  assert.equal(past.status, 201);
  assert.equal(
    (await patch(past.data.id, { version: 1, status: 'ARRIVED', reason }, cookie, '/status'))
      .status,
    200,
  );
  assert.equal(
    (await patch(past.data.id, { version: 2, status: 'COMPLETED', reason }, cookie, '/status'))
      .status,
    200,
  );
  const noShow = await create({ startLocal: '2026-08-01T10:00', serviceIds: [s2.id] });
  assert.equal(
    (await patch(noShow.data.id, { version: 1, status: 'NO_SHOW', reason }, cookie, '/status'))
      .status,
    200,
  );
  assert.equal((await create({ startLocal: '2026-08-01T10:00', serviceIds: [s2.id] })).status, 201);
  await assert.rejects(
    prisma.appointment.create({
      data: {
        salonId,
        professionalId: foreign.id,
        clientId: client.id,
        locationId: location.id,
        startsAt: new Date('2026-10-09T12:00Z'),
        endsAt: new Date('2026-10-09T13:00Z'),
        requestKey: randomUUID(),
        requestHash: 'a'.repeat(64),
      },
    }),
  );
  const viewPermission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'agenda.visualizar_propria' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: proMember.id, permissionId: viewPermission.id, effect: 'DENY' },
  });
  assert.equal(
    (await request(`/appointments/${ownAppointment.data.id}`, { cookie: proCookie })).status,
    403,
  );
  assert.equal(
    (
      await create(
        { professionalId: own.id, startLocal: '2026-10-09T09:00', serviceIds: [s2.id] },
        proCookie,
      )
    ).status,
    403,
  );
  await prisma.userPermissionOverride.delete({
    where: {
      membershipId_permissionId: { membershipId: proMember.id, permissionId: viewPermission.id },
    },
  });
  console.log(
    '✓ Agenda: multisserviço, snapshots decimais, idempotência, concorrência, jornada, bloqueios, escopo próprio, remarcação, transições, cancelamento e auditoria',
  );
}

export async function testAppointmentsBrowser({ page, expect, root, join, prisma, salonId }) {
  const professional = await prisma.professional.create({
    data: { salonId, name: 'Equipe da agenda' },
  });
  await prisma.workPeriod.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      salonId,
      professionalId: professional.id,
      weekday,
      startMinute: 480,
      endMinute: 1080,
    })),
  });
  const service = await prisma.service.create({
    data: { salonId, name: 'Corte da agenda', price: '45.50', durationMinutes: 30 },
  });
  const service2 = await prisma.service.create({
    data: { salonId, name: 'Escova da agenda', price: '30.25', durationMinutes: 30 },
  });
  await prisma.professionalService.createMany({
    data: [service, service2].map((s) => ({
      salonId,
      professionalId: professional.id,
      serviceId: s.id,
    })),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByRole('heading', { name: 'Agenda', exact: true }).waitFor();
  await page.getByLabel('Data da agenda').fill('2026-10-05');
  await page.getByRole('button', { name: 'Novo agendamento', exact: true }).click();
  await page.getByRole('button', { name: 'Equipe da agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Cliente atualizado no navegador', exact: true }).click();
  await page.getByText('Adicionar serviços', { exact: true }).click();
  await page.getByLabel('Buscar serviço para agendamento').fill('Corte da agenda');
  await page.getByRole('button', { name: 'Corte da agenda', exact: true }).click();
  await page.getByLabel('Buscar serviço para agendamento').fill('Escova da agenda');
  await page.getByRole('button', { name: 'Escova da agenda', exact: true }).click();
  await expect(page.getByText('60 minutos · R$ 75,75', { exact: true })).toBeVisible();
  await page.getByLabel('Valor de Corte da agenda (R$)').fill('40,10');
  await expect(page.getByText('60 minutos · R$ 70,35', { exact: true })).toBeVisible();
  const saveResponsePromise = page.waitForResponse(
    (r) =>
      r.url().includes('/api/appointments') && ['POST', 'PATCH'].includes(r.request().method()),
  );
  await page.getByRole('button', { name: 'Salvar agendamento', exact: true }).click();
  const saveResponse = await saveResponsePromise;
  assert.ok(saveResponse.ok(), await saveResponse.text());
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const event = page.getByRole('button', {
    name: '09:00 · Cliente atualizado no navegador · Equipe da agenda · Agendado',
    exact: true,
  });
  await event.waitFor();
  await page.screenshot({
    path: join(root, '.local/screenshots/agenda-day-desktop.png'),
    fullPage: true,
  });
  await event.click();
  await expect(page.getByText('Total previsto: R$ 70,35', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remarcar ou editar', exact: true }).click();
  await page.getByLabel('Início do agendamento').fill('2026-10-05T10:00');
  await expect(page.getByLabel('Valor de Corte da agenda (R$)')).toHaveValue('40,10');
  await page.getByLabel('Valor de Corte da agenda (R$)').fill('42,20');
  await page.getByRole('button', { name: 'Salvar agendamento', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByRole('button', {
      name: '10:00 · Cliente atualizado no navegador · Equipe da agenda · Agendado',
      exact: true,
    })
    .click();
  await expect(page.getByText('Total previsto: R$ 72,45', { exact: true })).toBeVisible();
  assert.equal(
    (await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).price.toFixed(2),
    '45.50',
  );
  await page.getByLabel('Novo status').selectOption('CONFIRMED');
  await page.getByLabel('Motivo da alteração').fill('Cliente confirmou presença');
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Visão', { exact: true }).selectOption('7');
  await page.getByLabel('Grade semanal', { exact: true }).waitFor();
  await page.screenshot({
    path: join(root, '.local/screenshots/agenda-week-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(root, '.local/screenshots/agenda-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page
    .getByRole('button', {
      name: '10:00 · Cliente atualizado no navegador · Equipe da agenda · Confirmado',
      exact: true,
    })
    .click();
  await page.getByText('Histórico do agendamento (últimas 50 alterações)', { exact: true }).click();
  await expect(page.getByText('Edição', { exact: true })).toBeVisible();
  await page.getByLabel('Novo status').selectOption('CANCELLED');
  await page.getByLabel('Motivo do cancelamento').fill('Cliente solicitou cancelamento');
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(
    page.getByRole('button', {
      name: '10:00 · Cliente atualizado no navegador · Equipe da agenda · Cancelado',
      exact: true,
    }),
  ).toBeVisible();
  await page.route('**/api/appointments?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Falha de conexão de teste' }),
    }),
  );
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Falha de conexão de teste' }),
  ).toBeVisible();
  await page.unroute('**/api/appointments?*');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.getByLabel('Grade semanal', { exact: true }).waitFor();
  console.log(
    '✓ Navegador: agenda dia/semana, multisserviço, remarcação, confirmação, histórico, cancelamento, celular e recuperação de erro',
  );
}
