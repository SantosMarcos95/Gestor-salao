import { backup, restore } from './lib/backup.mjs';

process.umask(0o077);
try {
  const [action, directory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length || !['create', 'restore'].includes(action))
    throw new Error(
      'Uso: npm run db:backup -- <diretório> ou npm run db:restore -- <pasta-do-backup>',
    );
  if (action === 'create') {
    const folder = await backup(process.env.BACKUP_DATABASE_URL, directory);
    console.log(`Backup verificado: ${folder}`);
  } else {
    await restore(process.env.RESTORE_DATABASE_URL, directory);
    console.log(
      'Restauração concluída em banco novo. Valide a aplicação antes de qualquer troca de ambiente.',
    );
  }
} catch (error) {
  console.error(
    error.code
      ? 'Falha de acesso aos arquivos de backup; confira caminho e permissões.'
      : error.message,
  );
  process.exitCode = 1;
}
