import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

function connection(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Informe uma URL PostgreSQL explícita na variável apropriada.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2
  )
    throw new Error('URL PostgreSQL inválida.');
  // Prisma usa schema, que não é uma opção de conexão do libpq.
  url.searchParams.delete('schema');
  const allowed = new Set([
    'sslmode',
    'channel_binding',
    'sslrootcert',
    'sslcert',
    'sslkey',
    'connect_timeout',
    'application_name',
  ]);
  for (const key of url.searchParams.keys())
    if (!allowed.has(key)) throw new Error('Parâmetro de conexão não suportado na URL de backup.');
  return url;
}

async function run(tool, args, url) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  if (url) {
    const clean = new URL(url);
    env.PGPASSWORD = decodeURIComponent(clean.password);
    clean.password = '';
    env.PGDATABASE = clean.toString();
    env.PGCONNECT_TIMEOUT = '10';
  }
  const executable = process.env.POSTGRES_BIN ? join(process.env.POSTGRES_BIN, tool) : tool;
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let warning = false;
    child.stderr.on('data', () => {
      warning = true;
    });
    child.on('error', () =>
      reject(
        new Error(`${tool} indisponível; configure POSTGRES_BIN com os clientes PostgreSQL 17.`),
      ),
    );
    child.on('close', (code) => {
      if (code !== 0)
        reject(
          new Error(
            `${tool} falhou; confira versão, conexão e permissões. Credenciais e saída SQL foram omitidas.`,
          ),
        );
      else if (warning)
        reject(
          new Error(
            `${tool} emitiu avisos; operação não certificada. Investigue com acesso restrito antes de usar o arquivo.`,
          ),
        );
      else resolvePromise();
    });
  });
}

export async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function backup(databaseUrl, directory) {
  const url = connection(databaseUrl);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(join(resolve(directory), 'backup-'));
  const partial = join(folder, 'database.dump.partial');
  await writeFile(partial, '', { mode: 0o600, flag: 'wx' });
  await run(
    'pg_dump',
    ['--dbname', urlWithoutPassword(url), '--format=custom', '--no-password', '--file', partial],
    url,
  );
  await run('pg_restore', ['--list', partial]);
  const manifest = {
    format: 1,
    createdAt: new Date().toISOString(),
    sha256: await digest(partial),
  };
  await rename(partial, join(folder, 'database.dump'));
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  return folder;
}

export async function restore(databaseUrl, folder) {
  const url = connection(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^salao_restore_[a-z0-9_]{1,40}$/.test(name))
    throw new Error('Destino deve ser um banco novo chamado salao_restore_<identificador>.');
  const file = join(resolve(folder), 'database.dump');
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.sha256 !== (await digest(file)))
    throw new Error('Backup inválido: checksum ou formato divergente.');
  await run('pg_restore', ['--list', file]);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    // CREATE sem IF NOT EXISTS: recusa inclusive concorrência e bancos vazios existentes.
    await client.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  } catch {
    throw new Error(
      'Não foi possível criar destino novo; confira acesso e se o banco já existe. Nenhum banco existente será sobrescrito.',
    );
  } finally {
    await client.end();
  }
  await run(
    'pg_restore',
    [
      '--no-password',
      '--dbname',
      urlWithoutPassword(url),
      '--no-owner',
      '--no-acl',
      '--single-transaction',
      '--exit-on-error',
      file,
    ],
    url,
  );
  return name;
}

function urlWithoutPassword(url) {
  const clean = new URL(url);
  clean.password = '';
  return clean.toString();
}
