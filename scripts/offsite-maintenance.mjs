import { checkOffsite, listOffsite, pruneOffsite } from './lib/offsite-maintenance.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

try {
  const command = process.argv[2];
  const remote = process.env.BACKUP_REMOTE;
  const entries = await listOffsite(remote, process.env.RCLONE_BIN || 'rclone');
  if (command === 'check') {
    const result = checkOffsite(
      entries,
      Date.now(),
      Number(process.env.BACKUP_MAX_AGE_HOURS ?? 36),
    );
    console.log(`Cópia externa recente confirmada: ${result.completedAt}`);
  } else if (command === 'prune') {
    const status = JSON.parse(
      await readFile(join(process.env.BACKUP_DIRECTORY, 'status.json'), 'utf8'),
    );
    if (
      status.state !== 'success' ||
      !status.lastSuccess?.offsite?.target?.startsWith(`${remote}/`)
    )
      throw new Error('Backup atual não confirmado.');
    const currentStem = status.lastSuccess.offsite.target
      .slice(remote.length + 1)
      .replace(/\.dump\.enc$/, '');
    const removed = await pruneOffsite(
      remote,
      entries,
      currentStem,
      process.env.RCLONE_BIN || 'rclone',
    );
    console.log(`Retenção concluída: ${removed} pares antigos removidos.`);
  } else throw new Error('Comando inválido.');
} catch {
  console.error('ALERTA: verificação ou retenção da cópia externa falhou.');
  process.exitCode = 1;
}
