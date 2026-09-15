import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const databaseDir = resolve(root, '.local/postgres');
mkdirSync(resolve(root, '.local'), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'salao',
  password: 'local_dev_only',
  port: 5432,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1', '-k', resolve(root, '.local')],
  onLog: () => {},
  onError: () => {},
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) {
    await pg.initialise();
    writeFileSync(
      resolve(databaseDir, 'pg_hba.conf'),
      'local all all scram-sha-256\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n',
    );
  }
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  try {
    if (!(await client.query("SELECT 1 FROM pg_database WHERE datname = 'salao'")).rowCount)
      await client.query('CREATE DATABASE salao');
  } finally {
    await client.end();
  }
  console.log(
    'PostgreSQL local pronto em 127.0.0.1:5432. Dados em .local/postgres. Ctrl+C encerra sem apagar os dados.',
  );
} catch {
  console.error('Não foi possível iniciar PostgreSQL local. Verifique se a porta 5432 está livre.');
  try {
    await pg.stop();
  } catch {}
  process.exitCode = 1;
}
