import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { hash } from 'argon2';

export async function testLoginEmail({
  prisma,
  root,
  env,
  cookie,
  member,
  otherMember,
  delegatedCookie,
}) {
  let server;
  async function stop() {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  }
  // Restart between security scenarios to keep each within the real rate-limit window.
  async function start() {
    await stop();
    server = spawn('node', ['apps/api/dist/main.js'], {
      cwd: root,
      env: { ...env, PORT: '3011' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch('http://127.0.0.1:3011/api/health')).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('API de teste de e-mail indisponível');
  }
  async function request(
    path,
    { method = 'GET', body, session = cookie, origin = env.WEB_ORIGIN } = {},
  ) {
    const r = await fetch(`http://127.0.0.1:3011/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: session },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function sessionFor(userId, membershipId) {
    const token = randomBytes(32).toString('hex');
    await prisma.userSession.create({
      data: {
        userId,
        membershipId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return `salao_session=${token}`;
  }
  const password = 'Email-test-password-123';
  const role = await prisma.role.findFirstOrThrow({
    where: { salonId: member.salonId, code: 'ROLE_ADMIN' },
  });
  async function account(email) {
    const user = await prisma.user.create({
      data: { name: 'Teste de e-mail', email, passwordHash: await hash(password) },
    });
    const m = await prisma.salonUser.create({
      data: {
        salonId: member.salonId,
        userId: user.id,
      },
    });
    await prisma.userRole.create({
      data: { salonId: member.salonId, membershipId: m.id, roleId: role.id },
    });
    return { user, member: m };
  }
  const a = await account('email-target@example.test');
  const b = await account('email-second@example.test');
  async function view(email) {
    return (await request(`/access/users?search=${encodeURIComponent(email)}`)).data.items[0];
  }
  const change = (id, body, options = {}) =>
    request(`/access/users/${id}/email`, { method: 'PATCH', body, ...options });
  try {
    await start();
    const before = await view(a.user.email);
    const first = await sessionFor(a.user.id, a.member.id);
    const second = await sessionFor(a.user.id, a.member.id);
    const body = {
      email: '  EMAIL-NEW@EXAMPLE.TEST  ',
      revision: before.revision,
      currentPassword: env.ADMIN_PASSWORD,
      reason: 'Correção solicitada pelo usuário',
    };
    const auditCount = await prisma.auditLog.count({ where: { action: 'EMAIL_LOGIN_ALTERADO' } });
    assert.equal((await request('/access/users')).data.canChangeEmail, true);
    assert.equal(
      (await request('/access/users', { session: delegatedCookie })).data.canChangeEmail,
      false,
    );
    assert.equal((await change(a.member.id, body, { session: '' })).status, 401);
    assert.equal((await change(a.member.id, body, { origin: 'https://foreign.test' })).status, 403);
    assert.equal((await change(a.member.id, body, { session: delegatedCookie })).status, 403);
    assert.equal((await change(a.member.id, { ...body, email: 'invalid' })).status, 400);
    assert.equal((await change(otherMember.id, body)).status, 404);
    assert.equal((await change(a.member.id, { ...body, currentPassword: 'wrong' })).status, 400);
    assert.equal((await change(a.member.id, { ...body, email: b.user.email })).status, 409);
    assert.equal((await request('/auth/me', { session: first })).status, 200);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'EMAIL_LOGIN_ALTERADO' } }),
      auditCount,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).email,
      a.user.email,
    );

    await start();
    assert.equal(
      (await change(a.member.id, { ...body, email: a.user.email.toUpperCase() })).status,
      400,
    );
    assert.equal((await change(a.member.id, { ...body, reason: ' ' })).status, 400);
    assert.equal(
      (await change(a.member.id, { ...body, salonId: otherMember.salonId })).status,
      400,
    );
    const foreign = await prisma.salonUser.create({
      data: { userId: a.user.id, salonId: otherMember.salonId, active: false },
    });
    assert.equal((await change(a.member.id, body)).status, 403);
    await prisma.salonUser.delete({ where: { id: foreign.id } });
    assert.equal((await change(a.member.id, { ...body, revision: '0'.repeat(64) })).status, 409);
    const race = await Promise.all([
      change(a.member.id, body),
      change(a.member.id, { ...body, email: 'email-race@example.test' }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    const winner = race[0].status === 200 ? 'email-new@example.test' : 'email-race@example.test';
    const after = await view(winner);
    assert.deepEqual(after.roleIds, before.roleIds);
    assert.deepEqual(after.overrides, before.overrides);
    assert.equal(after.active, before.active);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).passwordHash,
      a.user.passwordHash,
    );
    assert.equal((await request('/auth/me', { session: first })).status, 401);
    assert.equal((await request('/auth/me', { session: second })).status, 401);
    assert.equal((await request('/auth/me')).status, 200);
    assert.equal(
      (await request('/auth/login', { method: 'POST', body: { email: a.user.email, password } }))
        .status,
      401,
    );
    assert.equal(
      (
        await request('/auth/login', {
          method: 'POST',
          body: { email: winner.toUpperCase(), password },
        })
      ).status,
      201,
    );
    const logs = await prisma.auditLog.findMany({
      where: { entityId: a.member.id, action: 'EMAIL_LOGIN_ALTERADO' },
    });
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0].before, { email: a.user.email });
    assert.deepEqual(logs[0].after, { email: winner });
    assert.equal(logs[0].actorId, member.id);
    assert.equal(logs[0].reason, body.reason);
    assert.ok(!JSON.stringify(logs).includes(env.ADMIN_PASSWORD));
    assert.ok(!JSON.stringify(logs).includes('passwordHash'));

    await start();
    // Two accounts cannot claim the same normalized address.
    const currentB = await view(b.user.email);
    const duplicateRace = await Promise.all([
      change(a.member.id, {
        ...body,
        revision: after.revision,
        email: 'shared-email@example.test',
      }),
      change(b.member.id, {
        ...body,
        revision: currentB.revision,
        email: 'SHARED-EMAIL@example.test',
      }),
    ]);
    assert.deepEqual(duplicateRace.map((r) => r.status).sort(), [200, 409]);
    // Administrator can correct their own email and must log in again.
    const selfCookie = await sessionFor(b.user.id, b.member.id);
    const currentBUser = await prisma.user.findUniqueOrThrow({ where: { id: b.user.id } });
    const selfView = await view(currentBUser.email);
    assert.equal(
      (
        await change(
          b.member.id,
          {
            ...body,
            revision: selfView.revision,
            currentPassword: password,
            email: 'self-email@example.test',
          },
          { session: selfCookie },
        )
      ).status,
      200,
    );
    assert.equal((await request('/auth/me', { session: selfCookie })).status, 401);
    assert.equal(
      (
        await request('/auth/login', {
          method: 'POST',
          body: { email: 'self-email@example.test', password },
        })
      ).status,
      201,
    );
    console.log(
      '✓ E-mail de login: administrador, escopo, validação, concorrência, duplicidade, auditoria, revogação e novo login',
    );
  } finally {
    await stop();
  }
}
