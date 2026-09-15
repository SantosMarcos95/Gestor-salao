import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';

// A separate API process gives password tests their own real rate-limit window.
// Both processes use only the disposable integration database.
export async function testPasswords({
  prisma,
  root,
  env,
  cookie,
  member,
  otherMember,
  delegatedCookie,
  target,
}) {
  const server = spawn('node', ['apps/api/dist/main.js'], {
    cwd: root,
    env: { ...env, PORT: '3010' },
    stdio: 'ignore',
  });
  async function request(
    path,
    { method = 'GET', body, cookie: session = cookie, origin = env.WEB_ORIGIN } = {},
  ) {
    const result = await fetch(`http://127.0.0.1:3010/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: session },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: result.status,
      data: await result.json(),
      cookie: result.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function sessionFor(userId, membershipId) {
    const token = randomBytes(32).toString('hex');
    await prisma.userSession.create({
      data: {
        userId,
        membershipId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    return `salao_session=${token}`;
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch('http://127.0.0.1:3010/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, 'API de teste de senhas indisponível');
    const targetRow = await prisma.salonUser.findUniqueOrThrow({ where: { id: target.id } });
    const oldPassword = 'Access-test-password-123';
    const firstSession = await sessionFor(targetRow.userId, target.id);
    const secondSession = await sessionFor(targetRow.userId, target.id);
    const personal = 'Personal-password-456';
    const passwordBody = { currentPassword: oldPassword, newPassword: personal };
    assert.equal(
      (await request('/auth/password', { method: 'POST', cookie: '', body: passwordBody })).status,
      401,
    );
    assert.equal(
      (
        await request('/auth/password', {
          method: 'POST',
          cookie: firstSession,
          origin: 'https://foreign.test',
          body: passwordBody,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/auth/password', {
          method: 'POST',
          cookie: firstSession,
          body: { ...passwordBody, newPassword: 'short' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/auth/password', {
          method: 'POST',
          cookie: firstSession,
          body: { ...passwordBody, currentPassword: 'wrong' },
        })
      ).status,
      400,
    );
    assert.equal((await request('/auth/me', { cookie: firstSession })).status, 200);
    const changeRace = await Promise.all(
      [personal, 'Other-personal-password'].map((newPassword) =>
        request('/auth/password', {
          method: 'POST',
          cookie: firstSession,
          body: { ...passwordBody, newPassword },
        }),
      ),
    );
    assert.deepEqual(changeRace.map((r) => r.status).sort(), [201, 401]);
    const winnerPassword = changeRace[0].status === 201 ? personal : 'Other-personal-password';
    assert.equal((await request('/auth/me', { cookie: firstSession })).status, 401);
    assert.equal((await request('/auth/me', { cookie: secondSession })).status, 401);
    assert.equal(
      (
        await request('/auth/login', {
          method: 'POST',
          body: { email: target.email, password: oldPassword },
        })
      ).status,
      401,
    );
    const renewed = await request('/auth/login', {
      method: 'POST',
      body: { email: target.email, password: winnerPassword },
    });
    assert.equal(renewed.status, 201);
    const currentTarget = (
      await request(`/access/users?search=${encodeURIComponent(target.email)}`)
    ).data.items[0];
    const resetBody = {
      currentPassword: env.ADMIN_PASSWORD,
      newPassword: 'Temporary-password-789',
      reason: 'Recuperação solicitada pelo titular',
      revision: currentTarget.revision,
    };
    assert.equal(
      (
        await request(`/access/users/${target.id}/password`, {
          method: 'POST',
          cookie: renewed.cookie,
          body: resetBody,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`/access/users/${otherMember.id}/password`, {
          method: 'POST',
          body: resetBody,
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(`/access/users/${member.id}/password`, { method: 'POST', body: resetBody }))
        .status,
      403,
    );
    assert.equal(
      (
        await request(`/access/users/${member.id}/password`, {
          method: 'POST',
          cookie: delegatedCookie,
          body: resetBody,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`/access/users/${target.id}/password`, {
          method: 'POST',
          body: { ...resetBody, currentPassword: 'wrong' },
        })
      ).status,
      400,
    );
    assert.equal((await request('/auth/me', { cookie: renewed.cookie })).status, 200);
    // Even an inactive foreign membership prevents an administrator taking over the global account.
    const foreignLink = await prisma.salonUser.create({
      data: { salonId: otherMember.salonId, userId: targetRow.userId, active: false },
    });
    assert.equal(
      (await request(`/access/users/${target.id}/password`, { method: 'POST', body: resetBody }))
        .status,
      403,
    );
    await prisma.salonUser.delete({ where: { id: foreignLink.id } });
    const resetRace = await Promise.all(
      [1, 2].map(() =>
        request(`/access/users/${target.id}/password`, { method: 'POST', body: resetBody }),
      ),
    );
    assert.deepEqual(resetRace.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await request('/auth/me', { cookie: renewed.cookie })).status, 401);
    const temporary = await request('/auth/login', {
      method: 'POST',
      body: { email: target.email, password: resetBody.newPassword },
    });
    assert.equal(temporary.status, 201);
    assert.equal(
      (await request('/auth/me', { cookie: temporary.cookie })).data.mustChangePassword,
      true,
    );
    assert.equal((await request('/clients', { cookie: temporary.cookie })).status, 403);
    assert.equal(
      (
        await request('/auth/password', {
          method: 'POST',
          cookie: temporary.cookie,
          body: { currentPassword: resetBody.newPassword, newPassword: 'Final-personal-password' },
        })
      ).status,
      201,
    );
    const finalLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: target.email, password: 'Final-personal-password' },
    });
    assert.equal(finalLogin.status, 201);
    assert.equal(
      (await request('/auth/me', { cookie: finalLogin.cookie })).data.mustChangePassword,
      false,
    );
    assert.equal((await request('/clients', { cookie: finalLogin.cookie })).status, 200);
    const audits = await prisma.auditLog.findMany({
      where: {
        action: { in: ['SENHA_ALTERADA', 'SENHA_REDEFINIDA'] },
        entityId: { in: [target.id, targetRow.userId] },
      },
    });
    assert.equal(audits.filter((a) => a.action === 'SENHA_ALTERADA').length, 2);
    assert.equal(audits.filter((a) => a.action === 'SENHA_REDEFINIDA').length, 1);
    for (const secret of [
      oldPassword,
      winnerPassword,
      resetBody.newPassword,
      'Final-personal-password',
      'passwordHash',
    ])
      assert.ok(!JSON.stringify(audits).includes(secret));
    console.log(
      '✓ Senhas: confirmação, concorrência, sessões revogadas, redefinição com escopo, troca obrigatória e auditoria sem credenciais',
    );
  } finally {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  }
}
