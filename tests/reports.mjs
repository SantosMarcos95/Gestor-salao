import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testReports({
  request,
  prisma,
  cookie,
  proCookie,
  proMember,
  salonId,
  otherMember,
}) {
  const path = '/reports/production?from=2025-07-01&to=2025-07-01';
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, { cookie: proCookie })).status, 403);
  assert.equal((await request('/reports/context', { cookie: proCookie })).status, 403);
  const get = (suffix = '', auth = cookie) => request(path + suffix, { cookie: auth });
  async function fixture(sid, actor) {
    const client = await prisma.client.create({
      data: { salonId: sid, name: 'Relatório teste', createdBy: actor, updatedBy: actor },
    });
    const pro = await prisma.professional.create({
      data: { salonId: sid, name: 'Equipe relatório', active: false },
    });
    const service = await prisma.service.create({
      data: {
        salonId: sid,
        name: 'Corte relatório',
        price: '999',
        durationMinutes: 30,
        active: false,
      },
    });
    const service2 = await prisma.service.create({
      data: { salonId: sid, name: 'Escova relatório', price: '888', durationMinutes: 30 },
    });
    const location = await prisma.location.findFirstOrThrow({ where: { salonId: sid } });
    const appointment = await prisma.appointment.create({
      data: {
        salonId: sid,
        clientId: client.id,
        professionalId: pro.id,
        locationId: location.id,
        status: 'COMPLETED',
        startsAt: new Date('2025-07-01T02:00Z'),
        endsAt: new Date('2025-07-01T03:00Z'),
        requestKey: randomUUID(),
        requestHash: 'e'.repeat(64),
        services: {
          create: [service, service2].map((s, position) => ({
            serviceId: s.id,
            name: s.name,
            price: position ? '20.20' : '10.10',
            position,
            durationMinutes: 30,
          })),
        },
      },
    });
    const order = await prisma.salonOrder.create({
      data: { salonId: sid, clientId: client.id, clientName: client.name, createdBy: actor },
    });
    return { client, pro, service, service2, appointment, order };
  }
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const f = await fixture(salonId, admin.id);
  await fixture(otherMember.salonId, otherMember.id);
  const first = await get();
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.deepEqual(first.data.summary, { services: 2, visits: 1, amount: '30.30' });
  // Linking a completed agenda entry must replace its source, never double its count.
  const imported = await prisma.visit.create({
    data: {
      salonId,
      orderId: f.order.id,
      clientId: f.client.id,
      professionalId: f.pro.id,
      professionalName: f.pro.name,
      appointmentId: f.appointment.id,
      items: {
        create: [f.service, f.service2].map((s, position) => ({
          serviceId: s.id,
          name: s.name,
          price: position ? '20.20' : '10.10',
          position,
          durationMinutes: 30,
        })),
      },
    },
  });
  await prisma.visit.update({ where: { id: imported.id }, data: { status: 'COMPLETED' } });
  assert.deepEqual((await get()).data.summary, first.data.summary);
  async function visit(date, status, price) {
    const v = await prisma.visit.create({
      data: {
        salonId,
        orderId: f.order.id,
        clientId: f.client.id,
        professionalId: f.pro.id,
        professionalName: f.pro.name,
        items: {
          create: {
            serviceId: f.service.id,
            name: 'Nome histórico',
            price,
            position: 0,
            durationMinutes: 30,
          },
        },
      },
    });
    await prisma.visit.update({
      where: { id: v.id },
      data: { status, completedAt: new Date(date) },
    });
  }
  await visit('2025-07-02T02:59:59.999Z', 'COMPLETED', '30.30');
  await visit('2025-07-02T03:00Z', 'COMPLETED', '500');
  await visit('2025-07-01T12:00Z', 'CANCELLED', '600');
  const result = await get();
  assert.deepEqual(result.data.summary, { services: 3, visits: 2, amount: '60.60' });
  assert.equal(result.data.items[0].name, 'Corte relatório');
  assert.equal(result.data.items[0].amount, '40.40');
  assert.equal((await get('&group=professionals')).data.items[0].services, 3);
  assert.equal((await get('&search=Escova')).data.summary.amount, '20.20');
  assert.equal((await get('&search=%25')).data.total, 0);
  assert.deepEqual((await get('&page=2')).data.items, []);
  assert.equal((await get('&page=2')).data.summary.amount, '60.60');
  for (const q of [
    'from=2025-02-30&to=2025-03-01',
    'from=2025-07-02&to=2025-07-01',
    'from=2023-01-01&to=2025-01-01',
    'from=2025-07-01&to=2025-07-01&group=invalid',
  ])
    assert.equal((await request('/reports/production?' + q, { cookie })).status, 400);
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'relatorios.agenda' },
  });
  await prisma.userPermissionOverride.create({
    data: { membershipId: proMember.id, permissionId: permission.id, effect: 'ALLOW' },
  });
  const limited = await get('', proCookie);
  assert.equal(limited.status, 200);
  assert.equal(limited.data.summary.services, 3);
  assert.equal(limited.data.summary.amount, null);
  assert.ok(limited.data.items.every((r) => r.amount === null));
  console.log(
    '✓ Relatórios: totais exatos, agenda/comanda sem duplicação, fuso/limites, inativos, escopo, permissões, filtros e paginação',
  );
}
export async function testReportsBrowser({ page, expect, root, join }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Relatórios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Relatórios', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('R$ 40,10');
  await page.getByLabel('Organizar por').selectOption('professionals');
  await expect(page.getByRole('table')).toContainText('R$ 40,10');
  await page.screenshot({
    path: join(root, '.local/screenshots/reports-desktop.png'),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: join(root, '.local/screenshots/reports-mobile.png'),
    fullPage: true,
  });
  await page.getByLabel('Buscar profissional').fill('Sem resultado de relatório');
  await expect(
    page.getByText('Nenhum serviço concluído neste período e nesta busca.'),
  ).toBeVisible();
  await page.getByLabel('Tipo de relatório').selectOption('occupancy');
  await expect(
    page.getByRole('heading', { name: 'Ocupação da agenda', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Equipe da agenda');
  await page.screenshot({
    path: join(root, '.local/screenshots/occupancy-mobile.png'),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: join(root, '.local/screenshots/occupancy-desktop.png'),
    fullPage: true,
  });
}
