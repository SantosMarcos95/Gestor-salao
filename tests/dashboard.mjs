import assert from 'node:assert/strict';

export async function testDashboard({ request, prisma, cookie, proCookie, salonId, proMember }) {
  assert.equal((await request('/dashboard/context')).status, 401);
  assert.equal((await request('/dashboard?from=2026-09-01&to=2026-09-10')).status, 401);
  const context = await request('/dashboard/context', { cookie });
  assert.equal(context.status, 200);
  assert.match(context.data.today, /^\d{4}-\d{2}-\d{2}$/);
  for (const query of [
    'from=2026-02-30&to=2026-03-01',
    'from=2026-09-10&to=2026-09-01',
    'from=2024-01-01&to=2026-01-01',
  ]) {
    assert.equal((await request('/dashboard?' + query, { cookie })).status, 400);
  }
  const path = '/dashboard?from=2026-01-01&to=2026-12-31';
  const result = await request(path, { cookie });
  assert.equal(result.status, 200);
  assert.equal(
    result.data.clients,
    await prisma.client.count({ where: { salonId, deletedAt: null } }),
  );
  const products = await prisma.product.findMany({ where: { salonId, active: true } });
  assert.equal(result.data.stock, products.filter((p) => p.balance.lte(p.minimum)).length);
  const orders = await prisma.salonOrder.count({
    where: { salonId, status: { in: ['OPEN', 'READY', 'DUE'] } },
  });
  assert.equal(
    result.data.orders.reduce((n, r) => n + r.count, 0),
    orders,
  );
  const appointments = await prisma.appointment.findMany({ where: { salonId } });
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: context.data.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const inRange = appointments.filter((a) => formatter.format(a.startsAt).startsWith('2026-'));
  assert.equal(
    result.data.agenda.reduce((n, r) => n + r.count, 0),
    inRange.length,
  );
  // Earlier modules grant extra capabilities to this shared fixture.
  // Explicit denials make this scenario independent of those grants.
  for (const code of [
    'clientes.visualizar_todos',
    'estoque.visualizar',
    'financeiro.visualizar',
    'agenda.visualizar_todas',
    'comandas.visualizar_todas',
  ]) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.userPermissionOverride.upsert({
      where: {
        membershipId_permissionId: { membershipId: proMember.id, permissionId: permission.id },
      },
      create: { membershipId: proMember.id, permissionId: permission.id, effect: 'DENY' },
      update: { effect: 'DENY' },
    });
  }
  const own = await request(path, { cookie: proCookie });
  assert.equal(own.status, 200);
  assert.equal(own.data.clients, null);
  assert.equal(own.data.stock, null);
  const professionals = await prisma.professional.findMany({
    where: { salonId, membershipId: proMember.id },
  });
  assert.equal(
    own.data.agenda.reduce((n, r) => n + r.count, 0),
    inRange.filter((a) => professionals.some((p) => p.id === a.professionalId)).length,
  );
  assert.equal('netSales' in own.data, false);
  assert.equal(
    (await request('/finance/summary?from=2026-01-01&to=2026-12-31', { cookie: proCookie })).status,
    403,
  );
  console.log(
    '✓ Dashboard: totais conciliados, escopo de salão/profissional, permissões e datas inválidas',
  );
}
