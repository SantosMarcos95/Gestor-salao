import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { backup, restore } from '../scripts/lib/backup.mjs';

async function inventory(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
    ).rows;
    const result = {};
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      result[tablename] = (
        await client.query(
          `SELECT row_to_json(t)::text AS value FROM public.${quoted} t ORDER BY row_to_json(t)::text`,
        )
      ).rows;
    }
    result.constraints = (
      await client.query(
        "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname, definition",
      )
    ).rows;
    // O parser redistribui casts de arrays após dump/restore; normalize só essa equivalência.
    for (const row of result.constraints) {
      row.definition = row.definition
        .replace(
          /\(ARRAY\[([^\]]+)\]\)::text\[\]/g,
          (_, items) => `ARRAY[${items.replaceAll('::character varying', '::text')}]`,
        )
        .replace(/\(('(?:[^']|'')*)'::character varying\)::text/g, "$1'::text");
    }
    result.triggers = (
      await client.query(
        'SELECT tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname, definition',
      )
    ).rows;
    return result;
  } finally {
    await client.end();
  }
}

export async function testBackup(databaseUrl, directory, exerciseRestored) {
  const before = await inventory(databaseUrl);
  const folder = await backup(databaseUrl, join(directory, 'backups'));
  const target = new URL(databaseUrl);
  target.pathname = '/salao_restore_ensaio';
  const dump = join(folder, 'database.dump');
  assert.equal((await stat(dump)).mode & 0o777, 0o600);
  assert.equal((await stat(folder)).mode & 0o777, 0o700);
  await assert.rejects(restore(databaseUrl, folder), /Destino deve/);
  await restore(target.toString(), folder);
  assert.deepEqual(await inventory(target.toString()), before);
  await assert.rejects(restore(target.toString(), folder), /banco já existe/);
  assert.deepEqual(await inventory(target.toString()), before);
  if (exerciseRestored) await exerciseRestored(target.toString());
  await writeFile(dump, Buffer.concat([await readFile(dump), Buffer.from('corrompido')]));
  target.pathname = '/salao_restore_corrompido';
  await assert.rejects(restore(target.toString(), folder), /checksum/);
  assert.deepEqual(await inventory(databaseUrl), before);
  console.log(
    '✓ Backup/restauração: todos os registros, decimais, migrations, restrições e triggers preservados; destino existente e arquivo corrompido recusados; origem intacta',
  );
}
