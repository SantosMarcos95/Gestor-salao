import assert from 'node:assert/strict';

export async function testCatalog({
  request,
  prisma,
  cookie,
  proCookie,
  salonId,
  otherMember,
  proMember,
}) {
  assert.equal((await request('/professionals')).status, 401);
  assert.equal((await request('/services')).status, 401);
  assert.equal((await request('/professionals', { cookie: proCookie })).status, 403);
  assert.equal((await request('/professionals/users', { cookie: proCookie })).status, 403);
  assert.equal((await request('/services', { cookie: proCookie })).status, 200);
  const serviceBody = {
    name: 'Corte de teste',
    description: 'Serviço de integração',
    durationMinutes: 45,
    price: '85.50',
    reason: 'Novo serviço no catálogo',
  };
  assert.equal(
    (await request('/services', { method: 'POST', cookie: proCookie, body: serviceBody })).status,
    403,
  );
  for (const price of [85.5, '-1', '1.234', '1e2', '1000000000000.00', '85,50']) {
    assert.equal(
      (await request('/services', { method: 'POST', cookie, body: { ...serviceBody, price } }))
        .status,
      400,
    );
  }
  for (const durationMinutes of [0, 1441, 1.5])
    assert.equal(
      (
        await request('/services', {
          method: 'POST',
          cookie,
          body: { ...serviceBody, durationMinutes },
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request('/services', {
        method: 'POST',
        cookie,
        body: { ...serviceBody, salonId: otherMember.salonId },
      })
    ).status,
    400,
  );
  const created = await request('/services', { method: 'POST', cookie, body: serviceBody });
  assert.equal(created.status, 201);
  assert.equal(created.data.price, '85.50');
  assert.equal(
    (await prisma.service.findUniqueOrThrow({ where: { id: created.data.id } })).price.toFixed(2),
    '85.50',
  );
  const foreignService = await prisma.service.create({
    data: {
      name: 'Serviço de outro salão',
      salonId: otherMember.salonId,
      price: '30.00',
      durationMinutes: 30,
    },
  });
  assert.equal(
    (
      await request(`/services/${foreignService.id}`, {
        method: 'PATCH',
        cookie,
        body: { ...serviceBody, version: 1 },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/services/${foreignService.id}/status`, {
        method: 'PATCH',
        cookie,
        body: { active: false, version: 1, reason: 'Tentativa externa' },
      })
    ).status,
    404,
  );
  const serviceRace = await Promise.all(
    ['90.10', '95.20'].map((price) =>
      request(`/services/${created.data.id}`, {
        method: 'PATCH',
        cookie,
        body: { ...serviceBody, price, version: 1 },
      }),
    ),
  );
  assert.deepEqual(serviceRace.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    await prisma.auditLog.count({
      where: { entityId: created.data.id, action: 'SERVICO_ALTERADO' },
    }),
    1,
  );
  assert.equal(
    (
      await request(`/services/${created.data.id}`, {
        method: 'PATCH',
        cookie,
        body: { ...serviceBody, version: 2, active: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/services/${created.data.id}/status`, {
        method: 'PATCH',
        cookie: proCookie,
        body: { active: false, version: 2, reason: 'Sem autorização' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/services/${created.data.id}/status`, {
        method: 'PATCH',
        cookie,
        body: { active: false, version: 2, reason: 'Retirar do catálogo ativo' },
      })
    ).status,
    200,
  );
  assert.equal((await request('/services?search=Corte%20de%20teste', { cookie })).data.total, 0);
  assert.equal(
    (await request('/services?status=inactive&search=Corte%20de%20teste', { cookie })).data.total,
    1,
  );
  assert.equal(
    (
      await request(`/services/${created.data.id}/status`, {
        method: 'PATCH',
        cookie,
        body: { active: true, version: 3, reason: 'Retorno ao catálogo ativo' },
      })
    ).status,
    200,
  );
  const maxPrice = await request('/services', {
    method: 'POST',
    cookie,
    body: { ...serviceBody, name: 'Preço máximo', price: '999999999999.99' },
  });
  assert.equal(maxPrice.status, 201);
  assert.equal(maxPrice.data.price, '999999999999.99');
  const zeroPrice = await request('/services', {
    method: 'POST',
    cookie,
    body: { ...serviceBody, name: 'Cortesia', price: '0' },
  });
  assert.equal(zeroPrice.data.price, '0.00');
  await assert.rejects(
    prisma.service.create({
      data: { salonId, name: 'Inválido', durationMinutes: 0, price: '1.00' },
    }),
  );
  await assert.rejects(
    prisma.service.create({
      data: { salonId, name: 'Inválido', durationMinutes: 1, price: '-1.00' },
    }),
  );

  const professionalBody = {
    name: 'Profissional integração',
    phone: '11999998888',
    email: 'EQUIPE@EXAMPLE.TEST',
    specialty: 'Coloração',
    notes: 'Cadastro de teste',
    membershipId: proMember.id,
    reason: 'Entrada na equipe do salão',
  };
  assert.equal(
    (
      await request('/professionals', {
        method: 'POST',
        cookie,
        body: { ...professionalBody, membershipId: otherMember.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/professionals', {
        method: 'POST',
        cookie,
        body: { ...professionalBody, phone: 'inválido' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/professionals', {
        method: 'POST',
        cookie,
        body: { ...professionalBody, salonId: otherMember.salonId },
      })
    ).status,
    400,
  );
  const professional = await request('/professionals', {
    method: 'POST',
    cookie,
    body: professionalBody,
  });
  assert.equal(professional.status, 201);
  assert.equal(professional.data.email, 'equipe@example.test');
  assert.equal(professional.data.membership.id, proMember.id);
  assert.ok(!JSON.stringify(professional.data).includes('password'));
  assert.equal(
    (await request('/professionals', { method: 'POST', cookie, body: professionalBody })).status,
    409,
  );
  assert.equal(
    (await request('/professionals/users?search=pro%40example.test', { cookie })).data.total,
    0,
  );
  assert.equal(
    (await request('/professionals/users?search=other%40example.test', { cookie })).data.total,
    0,
  );
  const foreignProfessional = await prisma.professional.create({
    data: {
      salonId: otherMember.salonId,
      name: 'Profissional externo',
      membershipId: otherMember.id,
    },
  });
  assert.equal(
    (
      await request(`/professionals/${foreignProfessional.id}`, {
        method: 'PATCH',
        cookie,
        body: { ...professionalBody, version: 1 },
      })
    ).status,
    404,
  );
  await assert.rejects(
    prisma.professional.create({
      data: { salonId, membershipId: otherMember.id, name: 'Vínculo externo inválido' },
    }),
  );
  const professionalRace = await Promise.all(
    ['Cortes', 'Coloração e cortes'].map((specialty) =>
      request(`/professionals/${professional.data.id}`, {
        method: 'PATCH',
        cookie,
        body: { ...professionalBody, specialty, version: 1 },
      }),
    ),
  );
  assert.deepEqual(professionalRace.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    await prisma.auditLog.count({
      where: { entityId: professional.data.id, action: 'PROFISSIONAL_ALTERADO' },
    }),
    1,
  );
  assert.equal(
    (
      await request(`/professionals/${professional.data.id}/status`, {
        method: 'PATCH',
        cookie,
        body: { active: false, version: 2, reason: 'Afastamento da equipe' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/professionals?search=Profissional%20integração', { cookie })).data.total,
    0,
  );
  assert.equal(
    (await request('/professionals?status=inactive&search=Profissional%20integração', { cookie }))
      .data.total,
    1,
  );
  assert.equal((await request('/auth/me', { cookie: proCookie })).status, 200);
  assert.equal(
    (
      await request(`/professionals/${professional.data.id}/status`, {
        method: 'PATCH',
        cookie,
        body: { active: true, version: 3, reason: 'Retorno à equipe' },
      })
    ).status,
    200,
  );
  for (let i = 0; i < 21; i++)
    await prisma.service.create({
      data: {
        salonId,
        name: `Paginação ${String(i).padStart(2, '0')}`,
        price: '0.10',
        durationMinutes: 1,
      },
    });
  const first = (await request('/services?search=Paginação', { cookie })).data;
  const second = (await request('/services?search=Paginação&page=2', { cookie })).data;
  assert.equal(first.total, 21);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 1);
  assert.ok(!first.items.some((s) => s.id === second.items[0].id));
  assert.equal((await request('/services?status=invalid', { cookie })).status, 400);
  const audits = await prisma.auditLog.findMany({
    where: { entityId: { in: [professional.data.id, created.data.id] } },
  });
  assert.equal(audits.length, 8);
  assert.ok(audits.every((a) => a.reason && a.after));
  assert.ok(audits.filter((a) => !a.action.endsWith('CRIADO')).every((a) => a.before));
  console.log(
    '✓ Profissionais e serviços: decimais exatos, validações, escopo, vínculo único, concorrência, status, paginação e auditoria',
  );
}

export async function testCatalogBrowser({ page, expect, root, join }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Serviços', exact: true }).click();
  await page.getByRole('button', { name: 'Novo serviço', exact: true }).click();
  await page.getByLabel('Nome do serviço', { exact: true }).fill('Escova do navegador');
  await page.getByLabel('Preço em reais', { exact: true }).fill('85,50');
  await page.getByLabel('Duração em minutos').fill('45');
  await page.getByLabel('Motivo da alteração').fill('Cadastro pelo navegador');
  await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await page
    .getByRole('button', { name: 'Editar serviço Escova do navegador', exact: true })
    .click();
  await page.getByLabel('Preço em reais', { exact: true }).fill('95,90');
  await page.getByLabel('Motivo da alteração').fill('Atualizar preço do serviço');
  await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Escova do navegador' })).toContainText(
    'R$ 95,90',
  );
  await page
    .getByRole('button', { name: 'Desativar serviço Escova do navegador', exact: true })
    .click();
  await page.getByLabel('Motivo da alteração').fill('Retirar temporariamente');
  await page.getByRole('button', { name: 'Desativar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Status', { exact: true }).selectOption('inactive');
  await page
    .getByRole('button', { name: 'Ativar serviço Escova do navegador', exact: true })
    .click();
  await page.getByLabel('Motivo da alteração').fill('Retorno do serviço');
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Status', { exact: true }).selectOption('active');
  await page
    .getByRole('button', { name: 'Editar serviço Escova do navegador', exact: true })
    .waitFor();
  await page.screenshot({
    path: join(root, '.local/screenshots/services-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(root, '.local/screenshots/services-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Profissionais', exact: true }).click();
  await page.getByRole('button', { name: 'Novo profissional', exact: true }).click();
  await page.getByLabel('Nome do profissional').fill('Profissional do navegador');
  await page.getByLabel('Especialidade').fill('Cortes');
  await page.getByText('Usuário vinculado: nenhum', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Equipe do navegador · browser-team@example.test', exact: true })
    .waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Administradora Teste · admin@example.test', exact: true })
    .click();
  await page.getByLabel('Motivo da alteração').fill('Profissional cadastrado no celular');
  await page.getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await page
    .getByRole('button', { name: 'Editar profissional Profissional do navegador', exact: true })
    .click();
  await page.getByLabel('Especialidade').fill('Cortes e escovas');
  await page.getByLabel('Motivo da alteração').fill('Atualizar especialidade');
  await page.getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Profissional do navegador' }),
  ).toContainText('Cortes e escovas');
  await page.screenshot({
    path: join(root, '.local/screenshots/professionals-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page
    .getByRole('button', { name: 'Desativar profissional Profissional do navegador', exact: true })
    .click();
  await page.getByLabel('Motivo da alteração').fill('Afastamento temporário');
  await page.getByRole('button', { name: 'Desativar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Status', { exact: true }).selectOption('inactive');
  await page
    .getByRole('button', { name: 'Ativar profissional Profissional do navegador', exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    '✓ Navegador: serviços com preço em reais, edição, status e profissional vinculado no celular',
  );
}
