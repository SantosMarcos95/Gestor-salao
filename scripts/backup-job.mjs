import { runBackupJob, checkBackup } from './lib/backup-job.mjs';

process.umask(0o077);
try {
  if (process.argv.length !== 3) throw new Error('Comando inválido.');
  if (process.argv[2] === 'run') {
    await runBackupJob({
      directory: process.env.BACKUP_DIRECTORY,
      databaseUrl: process.env.BACKUP_DATABASE_URL,
    });
    console.log('Backup local concluído e registrado.');
  } else if (process.argv[2] === 'check') {
    const status = await checkBackup(
      process.env.BACKUP_DIRECTORY,
      Number(process.env.BACKUP_MAX_AGE_HOURS ?? 26),
    );
    console.log(`Backup local íntegro; última conclusão: ${status.completedAt}`);
  } else throw new Error('Comando inválido.');
} catch {
  console.error(
    'ALERTA: backup não confirmado. Confira configuração, status.json, bloqueio e ferramentas. Nenhum detalhe de conexão foi registrado.',
  );
  process.exitCode = 1;
}
