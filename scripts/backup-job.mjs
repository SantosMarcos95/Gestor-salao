import { runBackupJob, checkBackup } from './lib/backup-job.mjs';
import { publishOffsite, decryptBackup } from './lib/offsite-backup.mjs';

process.umask(0o077);
try {
  if (process.argv[2] === 'run') {
    const remote = process.env.BACKUP_REMOTE;
    await runBackupJob(
      { directory: process.env.BACKUP_DIRECTORY, databaseUrl: process.env.BACKUP_DATABASE_URL },
      undefined,
      remote
        ? (folder) =>
            publishOffsite(folder, {
              remote,
              keyHex: process.env.BACKUP_ENCRYPTION_KEY,
              rclone: process.env.RCLONE_BIN || 'rclone',
            })
        : null,
    );
    console.log(`Backup concluído; cópia externa ${remote ? 'confirmada' : 'não configurada'}.`);
  } else if (process.argv[2] === 'check') {
    const status = await checkBackup(
      process.env.BACKUP_DIRECTORY,
      Number(process.env.BACKUP_MAX_AGE_HOURS ?? 26),
      Date.now(),
      process.env.BACKUP_REQUIRE_OFFSITE === 'true',
    );
    console.log(`Backup íntegro; última conclusão: ${status.completedAt}`);
  } else if (process.argv[2] === 'decrypt') {
    if (process.argv.length !== 5) throw new Error('Comando inválido.');
    await decryptBackup(process.argv[3], process.argv[4], process.env.BACKUP_ENCRYPTION_KEY);
    console.log('Cópia descriptografada; confira o checksum antes de restaurar.');
  } else throw new Error('Comando inválido.');
} catch {
  console.error(
    'ALERTA: backup não confirmado. Confira configuração, status.json, bloqueio e ferramentas. Nenhum detalhe de conexão foi registrado.',
  );
  const webhook = ['run', 'check'].includes(process.argv[2])
    ? process.env.BACKUP_ALERT_WEBHOOK_URL
    : null;
  if (webhook) {
    try {
      if (new URL(webhook).protocol !== 'https:') throw new Error('Webhook inválido.');
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'backup_failed', occurredAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Webhook recusou o aviso.');
    } catch {
      console.error('ALERTA: não foi possível entregar a notificação externa.');
    }
  }
  process.exitCode = 1;
}
