import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackupJob, checkBackup } from '../scripts/lib/backup-job.mjs';
import { digest } from '../scripts/lib/backup.mjs';

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
