import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { checkBackup } from './lib/backup-job.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const local = join(root, '.local');

try {
  const settings = parse(await readFile(join(local, 'backup.env')));
  for (const [name, value] of Object.entries(settings)) process.env[name] = value;
  if (process.argv[2] === 'run-if-due') {
    let current = false;
    try {
      await checkBackup(settings.BACKUP_DIRECTORY, 20, Date.now(), true);
      current = true;
    } catch {}
    if (current) {
      console.log('Backup externo recente; nenhuma nova execução necessária.');
      process.exit(0);
    }
    process.argv[2] = 'run';
  }
  if (process.argv[2] === 'run') {
    const neon = parse(await readFile(join(local, 'neon.env')));
    const url = new URL(neon.DATABASE_URL);
    if (!url.hostname.endsWith('.neon.tech')) throw new Error('Destino inesperado.');
    process.env.BACKUP_DATABASE_URL = neon.DATABASE_URL;
  }
  await import('./backup-job.mjs');
} catch {
  console.error('ALERTA: configuração local do backup incompleta ou inválida.');
  process.exitCode = 1;
}
