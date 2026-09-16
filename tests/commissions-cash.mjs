import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testCommissionsCash({
  request,
  prisma,
  cookie,
  proCookie,
  proMember,
  salonId,
  otherMember,
}) {
  const get = (path, auth = cookie) => request(path, { cookie: auth });
  const post = (path, body, auth = cookie) =>
    request(path, {
      method: 'POST',
      cookie: auth,
      body: { requestKey: randomUUID(), confirmed: true, ...body },
    });
  const admin = await prisma.salonUser.findFirstOrThrow({
    where: { salonId, user: { email: 'admin@example.test' } },
  });
  const client = await prisma.client.findFirstOrThrow({ where: { salonId, deletedAt: null } });
  const pro =
    (await prisma.professional.findFirst({ where: { salonId, membershipId: proMember.id } })) ??
    (await prisma.professional.create({
      data: { salonId, membershipId: proMember.id, name: 'Profissional Comissão' },
    }));
  await prisma.professional.update({ where: { id: pro.id }, data: { commissionRate: '60.00' } });
  const second = await prisma.professional.create({
    data: { salonId, name: 'Outra Comissão', commissionRate: '50' },
  });
  const service = await prisma.service.findFirstOrThrow({ where: { salonId } });
  const context = (await get('/commissions/context')).data;
  const period = `from=${context.today}&to=${context.today}`;
  assert.equal(context.all, true);
  assert.equal((await get('/commissions/context', proCookie)).data.all, false);
  assert.equal((await get('/cash', proCookie)).status, 403);
  assert.equal((await request('/commissions?' + period)).status, 401);
  // Exclude fixtures from previous modules by querying only the test professionals.
  const baseBefore = (await get(`/commissions?${period}&professionalId=${pro.id}`, proCookie)).data;
  async function newOrder() {
    const order = await prisma.salonOrder.create({
      data: {
        salonId,
        clientId: client.id,
        clientName: 'Comissões teste',
        createdBy: admin.id,
        status: 'OPEN',
        subtotal: '200',
        discount: '20',
        total: '180',
      },
    });
    for (const p of [pro, second]) {
      const visit = await prisma.visit.create({
        data: {
          salonId,
          orderId: order.id,
          clientId: client.id,
          professionalId: p.id,
          professionalName: p.name,
          status: 'WAITING',
          items: {
            create: {
              serviceId: service.id,
              name: 'Serviço comissão',
              durationMinutes: 30,
              price: '100',
              position: 0,
            },
          },
        },
      });
      await prisma.visit.update({
        where: { id: visit.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
    return prisma.salonOrder.update({
      where: { id: order.id },
      data: { status: 'READY', readyAt: new Date() },
    });
  }
  const order = await newOrder();
  assert.equal(await prisma.commissionBasis.count({ where: { orderId: order.id } }), 0);
  const openingKey = randomUUID();
  const opened = await Promise.all([
    post('/cash/open', { opening: '50', requestKey: openingKey }),
    post('/cash/open', { opening: '50', requestKey: openingKey }),
  ]);
  assert.deepEqual(
    opened.map((r) => r.status),
    [201, 201],
  );
  assert.equal(opened[0].data.id, opened[1].data.id);
  const cashId = opened[0].data.id;
  assert.equal((await post('/cash/open', { opening: '0' })).status, 409);
  const paymentBody = {
    version: order.version,
    payments: [
      { method: 'CASH', amount: '100', tendered: '120' },
      { method: 'PIX', amount: '80' },
    ],
    requestKey: randomUUID(),
  };
  const paid = await post(`/payments/${order.id}/checkout`, paymentBody);
  assert.equal(paid.status, 201, JSON.stringify(paid.data));
  assert.equal((await post(`/payments/${order.id}/checkout`, paymentBody)).status, 201);
  const bases = await prisma.commissionBasis.findMany({ where: { orderId: order.id } });
  assert.equal(bases.length, 2);
  assert.ok(bases.every((b) => b.base.toFixed(2) === '90.00'));
  const own = (await get(`/commissions?${period}&professionalId=${pro.id}`, proCookie)).data;
  assert.equal(Number(own.commission) - Number(baseBefore.commission), 54);
  assert.equal(
    (await get(`/commissions?${period}&professionalId=${second.id}`, proCookie)).data.total,
    0,
  );
  assert.equal(
    (await get(`/commissions?${period}&professionalId=${randomUUID()}`, proCookie)).data.total,
    0,
  );
  let cash = (await get(`/cash/${cashId}`)).data;
  assert.equal(cash.expected, '150.00');
  assert.equal(cash.received, '100.00'); // change and PIX excluded
  const currentPro = await prisma.professional.findUniqueOrThrow({ where: { id: pro.id } });
  const update = {
    name: currentPro.name,
    membershipId: proMember.id,
    commissionRate: '80',
    version: currentPro.version,
    reason: 'Alterar comissão futura',
  };
  assert.equal(
    (await request(`/professionals/${pro.id}`, { method: 'PATCH', cookie, body: update })).status,
    200,
  );
  // Even delegated catalog managers may not change commission.
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: 'profissionais.gerenciar' },
  });
  await prisma.userPermissionOverride.upsert({
    where: {
      membershipId_permissionId: { membershipId: proMember.id, permissionId: permission.id },
    },
    create: { membershipId: proMember.id, permissionId: permission.id, effect: 'ALLOW' },
    update: { effect: 'ALLOW' },
  });
  assert.equal(
    (
      await request(`/professionals/${pro.id}`, {
        method: 'PATCH',
        cookie: proCookie,
        body: { ...update, version: currentPro.version + 1, commissionRate: '99' },
      })
    ).status,
    403,
  );
  const cashPayment = paid.data.sale.payments.find((p) => p.method === 'CASH');
  const refunded = await post(`/payments/${order.id}/refund`, {
    version: paid.data.order.version,
    paymentId: cashPayment.id,
    amount: '20',
  });
  assert.equal(refunded.status, 201, JSON.stringify(refunded.data));
  const afterRefund = (await get(`/commissions?${period}&professionalId=${pro.id}`, proCookie))
    .data;
  assert.equal(Number(afterRefund.commission) - Number(baseBefore.commission), 48); // historical 60%, base 80
  assert.equal((await get(`/cash/${cashId}`)).data.expected, '130.00');
  const repaid = await post(`/payments/${order.id}/checkout`, {
    version: refunded.data.order.version,
    payments: [{ method: 'PIX', amount: '20' }],
  });
  assert.equal(repaid.status, 201);
  assert.equal(
    Number(
      (await get(`/commissions?${period}&professionalId=${pro.id}`, proCookie)).data.commission,
    ) - Number(baseBefore.commission),
    54,
  );
  const withdrawal = { amount: '30', reason: 'Retirada para depósito', requestKey: randomUUID() };
  assert.equal((await post(`/cash/${cashId}/withdraw`, withdrawal)).status, 201);
  assert.equal((await post(`/cash/${cashId}/withdraw`, withdrawal)).status, 201);
  assert.equal((await get(`/cash/${cashId}`)).data.expected, '100.00');
  assert.equal(
    (await post(`/cash/${cashId}/withdraw`, { amount: '101', reason: 'Saldo insuficiente' }))
      .status,
    409,
  );
  assert.equal(
    (
      await post(`/cash/${cashId}/close`, {
        counted: '99',
        expected: '130',
        reason: 'Contagem divergente',
      })
    ).status,
    409,
  );
  assert.equal(
    (await post(`/cash/${cashId}/close`, { counted: '99', expected: '100' })).status,
    409,
  );
  const close = await post(`/cash/${cashId}/close`, {
    counted: '99',
    expected: '100',
    reason: 'Diferença na contagem',
  });
  assert.equal(close.status, 201);
  cash = (await get(`/cash/${cashId}`)).data;
  assert.equal(cash.session.difference, '-1');
  const extra = await newOrder();
  const rejected = await post(`/payments/${extra.id}/checkout`, {
    version: extra.version,
    payments: [{ method: 'CASH', amount: '180' }],
  });
  assert.equal(rejected.status, 409);
  assert.equal(await prisma.orderSale.count({ where: { orderId: extra.id } }), 0); // atomic rollback
  assert.equal(await prisma.commissionBasis.count({ where: { orderId: extra.id } }), 0);
  // A new shift receives refunds for an earlier payment; closed history remains unchanged.
  const simultaneousOpen = await Promise.all([
    post('/cash/open', { opening: '100' }),
    post('/cash/open', { opening: '100' }),
  ]);
  assert.deepEqual(simultaneousOpen.map((r) => r.status).sort(), [201, 409]);
  const reopened = simultaneousOpen.find((r) => r.status === 201);
  assert.equal(reopened.status, 201);
  const voided = await post(`/payments/${order.id}/void`, { version: repaid.data.order.version });
  assert.equal(voided.status, 201, JSON.stringify(voided.data));
  assert.equal(
    Number(
      (await get(`/commissions?${period}&professionalId=${pro.id}`, proCookie)).data.commission,
    ) - Number(baseBefore.commission),
    0,
  );
  assert.equal((await get(`/cash/${reopened.data.id}`)).data.expected, '20.00');
  assert.equal((await get(`/cash/${cashId}`)).data.expected, '100.00');
  assert.equal(
    (await post(`/cash/${cashId}/withdraw`, { amount: '1', reason: 'Fechado' })).status,
    409,
  );
  await assert.rejects(
    prisma.cashMovement.updateMany({ where: { sessionId: cashId }, data: { reason: 'adulterar' } }),
  );
  await assert.rejects(
    prisma.commissionBasis.updateMany({ where: { orderId: order.id }, data: { rate: '99' } }),
  );
  await assert.rejects(
    prisma.cashSession.update({ where: { id: cashId }, data: { counted: '100' } }),
  );
  const foreign = await prisma.cashSession.create({
    data: { salonId: otherMember.salonId, openedBy: otherMember.id, opening: '0' },
  });
  assert.equal((await get(`/cash/${foreign.id}`)).status, 404);
  const future = await post(`/payments/${extra.id}/checkout`, {
    version: extra.version,
    payments: [{ method: 'PIX', amount: '180' }],
  });
  assert.equal(future.status, 201);
  const futureBasis = await prisma.commissionBasis.findFirstOrThrow({
    where: { orderId: extra.id, professionalId: pro.id },
  });
  assert.equal(futureBasis.rate.toFixed(2), '80.00');
  assert.equal(
    (
      await prisma.commissionEntry.findFirstOrThrow({ where: { basisId: futureBasis.id } })
    ).amount.toFixed(2),
    '72.00',
  );
  // Concurrent cash receipt and closing cannot both succeed with the old expected balance.
  const raceOrder = await newOrder();
  const race = await Promise.all([
    post(`/payments/${raceOrder.id}/checkout`, {
      version: raceOrder.version,
      payments: [{ method: 'CASH', amount: '180' }],
    }),
    post(`/cash/${reopened.data.id}/close`, { counted: '20', expected: '20' }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  if (race[0].status === 201) {
    assert.equal((await get(`/cash/${reopened.data.id}`)).data.expected, '200.00');
    assert.equal(
      (await post(`/payments/${raceOrder.id}/void`, { version: race[0].data.order.version }))
        .status,
      201,
    );
  } else {
    assert.equal(await prisma.payment.count({ where: { orderId: raceOrder.id } }), 0);
    assert.equal((await post('/cash/open', { opening: '20' })).status, 201);
  }
  console.log(
    '✓ Comissões após desconto/pagamento, histórico, estorno, retry, escopo e caixa com troco, sangria, fechamento, rollback e imutabilidade',
  );
  return { cashId: reopened.data.id };
}
