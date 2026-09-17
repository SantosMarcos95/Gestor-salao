import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkOffsite, planRetention, pruneOffsite } from '../scripts/lib/offsite-maintenance.mjs';

const day = 86400000;
const now = Date.parse('2026-09-17T12:00:00Z');

function pair(index, ageDays, incomplete = false) {
  const stem = `backup-${index}`;
  const ModTime = new Date(now - ageDays * day).toISOString();
  return [
    { Name: `${stem}.dump.enc`, Size: 100, ModTime, IsDir: false },
    ...(!incomplete ? [{ Name: `${stem}.manifest.json`, Size: 20, ModTime, IsDir: false }] : []),
  ];
}

test('detecta ausência de cópia diária completa', () => {
  assert.equal(checkOffsite(pair(1, 1), now).latest, 'backup-1');
  assert.throws(() => checkOffsite(pair(1, 2), now), /ALERTA/);
  assert.throws(() => checkOffsite(pair(1, 0, true), now), /ALERTA/);
  assert.throws(() => checkOffsite([], now), /ALERTA/);
});

test('retenção preserva sete pares e só seleciona os mais antigos que 90 dias', () => {
  const entries = [
    ...pair(0, 0),
    ...pair(1, 1),
    ...pair(2, 2),
    ...pair(3, 3),
    ...pair(4, 4),
    ...pair(5, 5),
    ...pair(6, 6),
    ...pair(7, 91),
    ...pair(8, 100),
    ...pair(9, 200, true),
  ];
  assert.deepEqual(
    planRetention(entries, now).map((pair) => pair.stem),
    ['backup-7', 'backup-8'],
  );
  assert.deepEqual(planRetention(entries.slice(0, 14), now), []);
});

test('remoção usa apenas os dois arquivos de pares expirados depois de novo backup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'salao-retention-'));
  const log = join(directory, 'calls');
  const rclone = join(directory, 'rclone');
  await writeFile(rclone, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n`);
  await chmod(rclone, 0o700);
  const entries = Array.from({ length: 8 }, (_, i) => pair(i, i === 7 ? 100 : i)).flat();
  assert.equal(await pruneOffsite('fixture:backups', entries, 'backup-0', rclone, now), 1);
  const calls = (await readFile(log, 'utf8')).trim().split('\n');
  assert.deepEqual(calls, [
    'deletefile fixture:backups/backup-7.dump.enc',
    'deletefile fixture:backups/backup-7.manifest.json',
  ]);
  await assert.rejects(
    pruneOffsite('fixture:backups', entries, 'backup-7', rclone, now),
    /não é o mais recente/,
  );
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2);
});
