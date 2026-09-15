import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testOccupancy({ request, prisma, cookie, proCookie, salonId, otherMember }) {
  const path = '/reports/occupancy?from=2025-07-01&to=2025-07-01&search=OcupacaoTeste';
  assert.equal((await request(path)).status, 401);
  // Run before report tests grant the professional reporting permission.
  assert.equal((await request(path, { cookie: proCookie })).status, 403);
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.create({
    data: { salonId, name: 'Ocupação teste', createdBy: admin.id, updatedBy: admin.id },
  });
  const location = await prisma.location.findFirstOrThrow({ where: { salonId } });
  const pro = await prisma.professional.create({
    data: {
      salonId,
      name: 'OcupacaoTeste',
      workPeriods: {
        create: [
          { weekday: 2, startMinute: 540, endMinute: 720 },
          { weekday: 2, startMinute: 780, endMinute: 1020 },
        ],
      },
    },
  });
  await prisma.professional.create({
    data: { salonId: otherMember.salonId, name: 'OcupacaoTeste estrangeiro' },
  });
  await prisma.availabilityBlock.create({
    data: {
      salonId,
      professionalId: pro.id,
      startsAt: new Date('2025-07-01T13:00Z'),
      endsAt: new Date('2025-07-01T14:00Z'),
      description: 'Bloqueio teste',
    },
  });
  for (const [start, end, status] of [
    ['12:00', '13:00', 'COMPLETED'],
    ['16:00', '17:00', 'CONFIRMED'],
    ['17:00', '18:00', 'CANCELLED'],
    ['18:00', '19:00', 'NO_SHOW'],
  ]) {
    await prisma.appointment.create({
      data: {
        salonId,
        clientId: client.id,
        professionalId: pro.id,
        locationId: location.id,
        startsAt: new Date(`2025-07-01T${start}Z`),
        endsAt: new Date(`2025-07-01T${end}Z`),
        status,
        requestKey: randomUUID(),
        requestHash: 'f'.repeat(64),
      },
    });
  }
  const result = await request(path, { cookie });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.total, 1);
  assert.deepEqual(result.data.summary, {
    availableMinutes: 360,
    occupiedMinutes: 120,
    freeMinutes: 240,
    blockedMinutes: 60,
    outsideMinutes: 0,
    cancelled: 1,
    noShow: 1,
    rate: 33.3,
  });
  assert.equal((await request(path + '&page=2', { cookie })).data.summary.rate, 33.3);
  assert.equal((await request(path + '&page=2', { cookie })).data.items.length, 0);
  await prisma.professional.update({ where: { id: pro.id }, data: { active: false } });
  assert.equal((await request(path, { cookie })).data.summary.rate, null);
  assert.equal((await request(path + '&status=all', { cookie })).data.summary.rate, 33.3);
  for (const query of [
    'from=2025-07-01&to=2025-08-01',
    'from=2025-07-02&to=2025-07-01',
    'from=2025-02-30&to=2025-03-01',
  ])
    assert.equal((await request('/reports/occupancy?' + query, { cookie })).status, 400);
  console.log(
    '✓ Ocupação: jornada, intervalo, bloqueio, conclusão, cancelamento/falta, escopo, permissões, inativos, datas e totais além da página',
  );
}
