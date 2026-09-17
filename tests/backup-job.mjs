import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackupJob, checkBackup } from '../scripts/lib/backup-job.mjs';
import { digest } from '../scripts/lib/backup.mjs';
import { decryptBackup, encryptBackup, publishOffsite } from '../scripts/lib/offsite-backup.mjs';

async function fakeBackup(_, directory) {
  const folder = await mkdtemp(join(directory, 'backup-'));
  await writeFile(join(folder, 'database.dump'), 'somente fixture');
  await writeFile(
    join(folder, 'manifest.json'),
    JSON.stringify({ format: 1, sha256: await digest(join(folder, 'database.dump')) }),
  );
  return folder;
}

test('registra sucesso privado, detecta atraso e corrupção', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-job-'));
  const status = await runBackupJob({ directory, databaseUrl: 'fixture' }, fakeBackup);
  assert.equal((await stat(join(directory, 'status.json'))).mode & 0o777, 0o600);
  assert.equal((await checkBackup(directory)).state, 'ok');
  await assert.rejects(checkBackup(directory, 26, Date.now() + 27 * 3600000), /ALERTA/);
  await writeFile(join(status.lastSuccess.folder, 'database.dump'), 'corrompido');
  await assert.rejects(checkBackup(directory), /corrompido/);
});

test('falha preserva último sucesso e não vaza detalhes; permite próxima tentativa', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-job-'));
  const config = { directory, databaseUrl: 'segredo' };
  const first = await runBackupJob(config, fakeBackup);
  await assert.rejects(
    runBackupJob(config, async () => {
      throw new Error('segredo');
    }),
    /Backup falhou/,
  );
  const content = await readFile(join(directory, 'status.json'), 'utf8');
  assert.equal(content.includes('segredo'), false);
  assert.deepEqual(JSON.parse(content).lastSuccess, first.lastSuccess);
  await assert.rejects(checkBackup(directory), /ALERTA/);
  await runBackupJob(config, fakeBackup);
  assert.equal((await checkBackup(directory)).state, 'ok');
});

test('recusa execução concorrente sem substituir o estado em andamento', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-job-'));
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const config = { directory, databaseUrl: 'fixture' };
  const first = runBackupJob(config, async (...args) => {
    started();
    await wait;
    return fakeBackup(...args);
  });
  await ready;
  try {
    await assert.rejects(runBackupJob(config, fakeBackup), /bloqueado/);
    await assert.rejects(checkBackup(directory), /ALERTA/);
  } finally {
    release();
    await first;
  }
  assert.equal((await checkBackup(directory)).state, 'ok');
});

test('ausência, configuração inválida e bloqueio órfão não indicam sucesso', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-job-'));
  await assert.rejects(checkBackup(directory));
  await assert.rejects(checkBackup(directory, Number.NaN));
  await assert.rejects(runBackupJob({ directory }, fakeBackup));
  await writeFile(join(directory, 'job.lock'), 'processo interrompido');
  await assert.rejects(
    runBackupJob({ directory, databaseUrl: 'fixture' }, fakeBackup),
    /bloqueado/,
  );
});

test('recusa pasta fora do diretório e subpasta com prefixo semelhante', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-job-'));
  const status = await runBackupJob({ directory, databaseUrl: 'fixture' }, fakeBackup);
  for (const folder of [
    directory + '-externo/backup-teste',
    join(directory, 'backup-pai', 'filho'),
  ]) {
    status.lastSuccess.folder = folder;
    await writeFile(join(directory, 'status.json'), JSON.stringify(status));
    await assert.rejects(checkBackup(directory), /Registro de backup inválido/);
  }
});

test('criptografia autenticada recupera o dump e rejeita chave errada', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-crypto-'));
  const input = join(directory, 'dump');
  const encrypted = join(directory, 'dump.enc');
  const restored = join(directory, 'restored');
  const key = 'ab'.repeat(32);
  await writeFile(input, 'fixture privada');
  await encryptBackup(input, encrypted, key);
  assert.equal((await readFile(encrypted)).includes('fixture privada'), false);
  await decryptBackup(encrypted, restored, key);
  assert.equal(await readFile(restored, 'utf8'), 'fixture privada');
  await assert.rejects(
    decryptBackup(encrypted, join(directory, 'wrong'), 'cd'.repeat(32)),
    /autenticação/,
  );
  const altered = await readFile(encrypted);
  altered[25] ^= 1;
  await writeFile(join(directory, 'altered.enc'), altered);
  await assert.rejects(
    decryptBackup(join(directory, 'altered.enc'), join(directory, 'altered.dump'), key),
    /autenticação/,
  );
});

test('sucesso externo exige confirmação e falha de envio não registra sucesso', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-offsite-'));
  const remoteRoot = join(directory, 'remote');
  const rclone = join(directory, 'rclone-fixture');
  await writeFile(rclone, '#!/bin/sh\nexit 1\n');
  await chmod(rclone, 0o700);
  const config = { directory, databaseUrl: 'fixture' };
  const publish = (folder) =>
    publishOffsite(folder, {
      remote: `fixture:${remoteRoot}`,
      keyHex: 'ab'.repeat(32),
      rclone,
    });
  await assert.rejects(runBackupJob(config, fakeBackup, publish), /Backup falhou/);
  assert.equal(JSON.parse(await readFile(join(directory, 'status.json'))).state, 'failed');
  const working = join(directory, 'rclone-working');
  await writeFile(
    working,
    `#!/bin/sh\ntarget="${remoteRoot}/\${3##*/}"\ncase "$1" in\n  copyto) mkdir -p "${remoteRoot}"; cp "$2" "$target";;\n  cat) cat "${remoteRoot}/\${2##*/}";;\nesac\n`,
  );
  await chmod(working, 0o700);
  await runBackupJob(config, fakeBackup, (folder) =>
    publishOffsite(folder, {
      remote: `fixture:${remoteRoot}`,
      keyHex: 'ab'.repeat(32),
      rclone: working,
    }),
  );
  assert.equal((await checkBackup(directory, 26, Date.now(), true)).state, 'ok');
});
