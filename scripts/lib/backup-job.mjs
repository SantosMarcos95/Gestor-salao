import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { backup, digest } from './backup.mjs';

async function save(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value) + '\n');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

export async function runBackupJob({ directory, databaseUrl }, createBackup = backup) {
  if (!directory || !databaseUrl) throw new Error('Configuração de backup incompleta.');
  directory = resolve(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'job.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch {
    throw new Error('Backup bloqueado: execução em andamento ou bloqueio pendente.');
  }
  const file = join(directory, 'status.json');
  let previous;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    try {
      previous = JSON.parse(await readFile(file, 'utf8'));
    } catch {}
    const state = {
      version: 1,
      state: 'running',
      startedAt: new Date().toISOString(),
      lastSuccess: previous?.lastSuccess ?? null,
    };
    await save(file, state);
    try {
      const folder = await createBackup(databaseUrl, directory);
      state.lastSuccess = { folder, completedAt: new Date().toISOString() };
      state.state = 'success';
      await save(file, state);
      return state;
    } catch {
      state.state = 'failed';
      state.finishedAt = new Date().toISOString();
      await save(file, state);
      throw new Error('Backup falhou. Verifique conexão, espaço e ferramentas PostgreSQL.');
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export async function checkBackup(directory, maxAgeHours = 26, now = Date.now()) {
  if (!directory || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 8760)
    throw new Error('Configuração de monitoramento inválida.');
  const state = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8'));
  const success = state.lastSuccess;
  const age = now - Date.parse(success?.completedAt);
  if (
    state.version !== 1 ||
    state.state !== 'success' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > maxAgeHours * 3600000
  )
    throw new Error('ALERTA: backup ausente, atrasado, interrompido ou com falha.');
  const folder = resolve(success.folder);
  if (dirname(folder) !== resolve(directory) || !basename(folder).startsWith('backup-'))
    throw new Error('Registro de backup inválido.');
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.sha256 !== (await digest(join(folder, 'database.dump'))))
    throw new Error('ALERTA: arquivo de backup ausente ou corrompido.');
  return { state: 'ok', completedAt: success.completedAt };
}
