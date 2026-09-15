import assert from 'node:assert/strict';
export async function testAvailability({
  request,
  prisma,
  cookie,
  proCookie,
  salonId,
  otherMember,
}) {
  const p = await prisma.professional.create({ data: { salonId, name: 'Equipe disponibilidade' } });
  const foreign = await prisma.professional.create({
    data: { salonId: otherMember.salonId, name: 'Equipe externa disponibilidade' },
  });
  const service = await prisma.service.create({
    data: { salonId, name: 'Serviço disponibilidade', price: '20', durationMinutes: 30 },
  });
  const externalService = await prisma.service.create({
    data: {
      salonId: otherMember.salonId,
      name: 'Serviço externo disponibilidade',
      price: '20',
      durationMinutes: 30,
    },
  });
  const base = `/availability/${p.id}`;
  const reason = 'Configuração de disponibilidade';
  for (const path of [
    '/availability/professionals',
    `${base}/work`,
    `${base}/services`,
    `${base}/service-options`,
    `${base}/blocks`,
  ]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { cookie: proCookie })).status, 403);
  }
  for (const part of ['work', 'services', 'service-options', 'blocks'])
    assert.equal((await request(`/availability/${foreign.id}/${part}`, { cookie })).status, 404);
  assert.ok(
    !(await request('/availability/professionals?status=all', { cookie })).data.items.some(
      (v) => v.id === foreign.id,
    ),
  );
  const periods = [
    { weekday: 1, startMinute: 540, endMinute: 720 },
    { weekday: 1, startMinute: 780, endMinute: 1080 },
  ];
  const save = (path, body, auth = cookie, method = 'PUT') =>
    request(`${base}/${path}`, { method, cookie: auth, body });
  assert.equal((await save('work', { version: 1, reason, periods }, proCookie)).status, 403);
  for (const invalid of [
    [{ weekday: 7, startMinute: 0, endMinute: 60 }],
    [{ weekday: 0, startMinute: 60, endMinute: 60 }],
    [{ weekday: 0, startMinute: 60, endMinute: 30 }],
    [{ weekday: 0, startMinute: -1, endMinute: 60 }],
    [{ weekday: 0, startMinute: 0, endMinute: 1441 }],
    [periods[0], { weekday: 1, startMinute: 600, endMinute: 800 }],
    [periods[0], periods[0]],
  ])
    assert.equal((await save('work', { version: 1, reason, periods: invalid })).status, 400);
  const race = await Promise.all(
    [periods, [{ weekday: 2, startMinute: 0, endMinute: 1440 }]].map((periods) =>
      save('work', { version: 1, reason, periods }),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    await prisma.auditLog.count({ where: { entityId: p.id, action: 'JORNADA_ALTERADA' } }),
    1,
  );
  const work = (await request(`${base}/work`, { cookie })).data;
  assert.equal(work.version, 2);
  assert.equal(work.timezone, 'America/Sao_Paulo');
  assert.deepEqual(
    work.periods.map(({ weekday, startMinute, endMinute }) => ({
      weekday,
      startMinute,
      endMinute,
    })),
    race.find((r) => r.status === 200).data.periods,
  );
  assert.equal(
    (await save('services', { version: 2, reason, serviceIds: [externalService.id] })).status,
    400,
  );
  assert.equal((await request(`${base}/services`, { cookie })).data.version, 2); // rollback revision
  assert.equal(
    (await save('services', { version: 2, reason, serviceIds: [service.id, service.id] })).status,
    400,
  );
  assert.equal(
    (await save('services', { version: 2, reason, serviceIds: [service.id] }, proCookie)).status,
    403,
  );
  assert.equal(
    (await save('services', { version: 2, reason, serviceIds: [service.id] })).status,
    200,
  );
  assert.equal((await save('work', { version: 2, reason, periods: [] })).status, 409);
  await prisma.service.update({ where: { id: service.id }, data: { active: false } });
  assert.equal((await request(`${base}/services`, { cookie })).data.services[0].active, false);
  assert.equal(
    (await save('services', { version: 3, reason, serviceIds: [service.id] })).status,
    200,
  ); // preserve inactive link
  assert.equal((await save('services', { version: 4, reason, serviceIds: [] })).status, 200);
  assert.equal(
    (await save('services', { version: 5, reason, serviceIds: [service.id] })).status,
    400,
  ); // cannot newly add inactive
  assert.equal((await save('work', { version: 5, reason, periods: [] })).status, 200);
  assert.equal((await request(`${base}/work`, { cookie })).data.periods.length, 0);
  await assert.rejects(
    prisma.workPeriod.create({
      data: { salonId, professionalId: foreign.id, weekday: 1, startMinute: 0, endMinute: 60 },
    }),
  );
  await assert.rejects(
    prisma.workPeriod.create({
      data: { salonId, professionalId: p.id, weekday: 1, startMinute: 60, endMinute: 0 },
    }),
  );
  await assert.rejects(
    prisma.professionalService.create({
      data: { salonId, professionalId: p.id, serviceId: externalService.id },
    }),
  );
  const block = {
    startLocal: '2026-10-01T09:00',
    endLocal: '2026-10-01T12:00',
    description: 'Ausência teste',
    reason,
  };
  assert.equal((await save('blocks', block, proCookie, 'POST')).status, 403);
  for (const invalid of [
    { ...block, endLocal: block.startLocal },
    { ...block, startLocal: '2026-02-30T09:00' },
    { ...block, startLocal: '2026-10-01T25:00' },
    { ...block, salonId: otherMember.salonId },
  ])
    assert.equal((await save('blocks', invalid, cookie, 'POST')).status, 400);
  const blockRace = await Promise.all([1, 2].map(() => save('blocks', block, cookie, 'POST')));
  assert.deepEqual(blockRace.map((r) => r.status).sort(), [201, 409]);
  const created = blockRace.find((r) => r.status === 201).data;
  assert.equal(created.startsAt, '2026-10-01T12:00:00.000Z');
  assert.equal(
    (
      await save(
        'blocks',
        { ...block, startLocal: '2026-10-01T12:00', endLocal: '2026-10-01T13:00' },
        cookie,
        'POST',
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`/availability/${foreign.id}/blocks/${created.id}/cancel`, {
        method: 'PATCH',
        cookie,
        body: { version: 1, reason },
      })
    ).status,
    404,
  );
  const cancels = await Promise.all(
    [1, 2].map(() => save(`blocks/${created.id}/cancel`, { version: 1, reason }, cookie, 'PATCH')),
  );
  assert.deepEqual(cancels.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await save('blocks', block, cookie, 'POST')).status, 201);
  assert.equal((await request(`${base}/blocks?status=inactive`, { cookie })).data.total, 1);
  assert.equal((await request(`${base}/blocks?status=all`, { cookie })).data.total, 3);
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { entityId: created.id, action: 'BLOQUEIO_CANCELADO' },
  });
  assert.equal(audit.before.cancelledAt, null);
  assert.ok(audit.after.cancelledAt);
  assert.equal(audit.reason, reason);
  // A manager can configure availability without access to professional records or service assignment.
  const proSession = await prisma.userSession.findFirstOrThrow({
    where: { user: { email: 'pro@example.test' }, revokedAt: null },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'agenda.gerenciar_disponibilidade' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: proSession.membershipId, permissionId: permission.id, effect: 'ALLOW' },
  });
  assert.equal((await request('/availability/professionals', { cookie: proCookie })).status, 200);
  assert.equal((await request(`${base}/work`, { cookie: proCookie })).status, 200);
  assert.equal((await request(`${base}/services`, { cookie: proCookie })).status, 403);
  await prisma.userPermissionOverride.delete({
    where: {
      membershipId_permissionId: {
        membershipId: proSession.membershipId,
        permissionId: permission.id,
      },
    },
  });
  console.log(
    '✓ Disponibilidade: jornadas, limites, concorrência, rollback, serviços ativos, fuso, bloqueios adjacentes, cancelamento auditado e permissões independentes',
  );
}

export async function testAvailabilityBrowser({ page, expect, root, join }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Disponibilidade', exact: true }).click();
  await page.getByRole('heading', { name: 'Disponibilidade e serviços', exact: true }).waitFor();
  const loaded = page.waitForResponse(
    (r) => r.url().includes('/api/availability/professionals') && r.url().includes('status=all'),
  );
  await page.getByLabel('Status', { exact: true }).selectOption('all');
  const response = await loaded;
  assert.equal(response.status(), 200, await response.text());
  await page
    .getByRole('button', { name: 'Jornada de Profissional do navegador', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Adicionar período — Segunda-feira', exact: true })
    .click();
  await page.getByLabel('Fim Segunda-feira 1', { exact: true }).fill('12:00');
  await page
    .getByRole('button', { name: 'Adicionar período — Segunda-feira', exact: true })
    .click();
  await page.getByLabel('Início Segunda-feira 2', { exact: true }).fill('13:00');
  await page.getByLabel('Motivo da alteração').fill('Jornada pelo navegador');
  await page.getByRole('button', { name: 'Salvar jornada', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Jornada de Profissional do navegador', exact: true })
    .click();
  await expect(page.getByLabel('Fim Segunda-feira 1', { exact: true })).toHaveValue('12:00');
  await expect(page.getByLabel('Início Segunda-feira 2', { exact: true })).toHaveValue('13:00');
  await page.screenshot({
    path: join(root, '.local/screenshots/work-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(root, '.local/screenshots/work-mobile.png'), fullPage: true });
  assert.ok(
    await page.evaluate(() => {
      const d = document.querySelector('dialog');
      return d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }),
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Serviços de Profissional do navegador', exact: true })
    .click();
  await page.getByLabel('Buscar serviço').fill('Escova do navegador');
  await page.getByLabel('Escova do navegador', { exact: true }).check();
  await page.getByLabel('Motivo da alteração').fill('Vincular serviço pelo navegador');
  await page.getByRole('button', { name: 'Salvar serviços', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Serviços de Profissional do navegador', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Remover serviço Escova do navegador', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Bloqueios de Profissional do navegador', exact: true })
    .click();
  await page.getByLabel('Descrição', { exact: true }).fill('Curso da equipe');
  await page.getByLabel('Início do bloqueio').fill('2026-10-05T09:00');
  await page.getByLabel('Fim do bloqueio').fill('2026-10-05T12:00');
  await page.getByLabel('Motivo da alteração').fill('Participação em curso');
  await page.getByRole('button', { name: 'Criar bloqueio', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Bloqueio criado.');
  await expect(
    page.getByText('05/10/2026, 09:00 até 05/10/2026, 12:00', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: join(root, '.local/screenshots/blocks-mobile.png'),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(() => {
      const d = document.querySelector('dialog');
      return d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }),
  );
  await page
    .getByRole('button', { name: 'Cancelar bloqueio Curso da equipe', exact: true })
    .click();
  await page.getByLabel('Motivo da alteração').fill('Curso foi adiado');
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Bloqueio cancelado.');
  await page.getByLabel('Exibir bloqueios').selectOption('inactive');
  await expect(page.getByText('Curso da equipe', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  console.log(
    '✓ Navegador: jornada com intervalo, persistência, serviços, bloqueios/cancelamento, teclado e celular',
  );
}
