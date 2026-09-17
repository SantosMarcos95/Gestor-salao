import { spawn } from 'node:child_process';

const dumpSuffix = '.dump.enc';
const manifestSuffix = '.manifest.json';
const namePattern = /^backup-[A-Za-z0-9_-]+$/;

function backupPairs(entries) {
  if (!Array.isArray(entries)) throw new Error('Listagem externa inválida.');
  const byName = new Map();
  for (const entry of entries) {
    if (entry.IsDir || !Number.isSafeInteger(entry.Size) || entry.Size <= 0) continue;
    const suffix = entry.Name?.endsWith(dumpSuffix)
      ? dumpSuffix
      : entry.Name?.endsWith(manifestSuffix)
        ? manifestSuffix
        : null;
    if (!suffix) continue;
    const stem = entry.Name.slice(0, -suffix.length);
    if (!namePattern.test(stem)) continue;
    const timestamp = Date.parse(entry.ModTime);
    if (!Number.isFinite(timestamp)) continue;
    const pair = byName.get(stem) ?? { stem };
    pair[suffix] = { name: entry.Name, timestamp };
    byName.set(stem, pair);
  }
  return [...byName.values()]
    .filter((pair) => pair[dumpSuffix] && pair[manifestSuffix])
    .map((pair) => ({
      stem: pair.stem,
      files: [pair[dumpSuffix].name, pair[manifestSuffix].name],
      timestamp: Math.max(pair[dumpSuffix].timestamp, pair[manifestSuffix].timestamp),
    }))
    .sort((a, b) => b.timestamp - a.timestamp || a.stem.localeCompare(b.stem));
}

export function checkOffsite(entries, now = Date.now(), maxAgeHours = 36) {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0)
    throw new Error('Configuração de monitoramento inválida.');
  const newest = backupPairs(entries)[0];
  const age = now - newest?.timestamp;
  if (!Number.isFinite(age) || age < 0 || age > maxAgeHours * 3600000)
    throw new Error('ALERTA: cópia externa ausente ou atrasada.');
  return { latest: newest.stem, completedAt: new Date(newest.timestamp).toISOString() };
}

export function planRetention(entries, now = Date.now(), days = 90, minKeep = 7) {
  if (
    !Number.isFinite(now) ||
    !Number.isSafeInteger(days) ||
    days < 30 ||
    !Number.isSafeInteger(minKeep) ||
    minKeep < 7
  )
    throw new Error('Política de retenção inválida.');
  const pairs = backupPairs(entries);
  if (pairs.length <= minKeep) return [];
  return pairs.slice(minKeep).filter((pair) => now - pair.timestamp > days * 86400000);
}

export function runRclone(args, executable = 'rclone') {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('rclone indisponível.')));
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks).toString('utf8'))
        : reject(new Error('Falha na operação do Drive.')),
    );
  });
}

export async function listOffsite(remote, rclone = 'rclone') {
  if (!/^[A-Za-z0-9_-]+:[^\n\r]*$/.test(remote ?? '') || remote.includes('..'))
    throw new Error('BACKUP_REMOTE inválido.');
  return JSON.parse(await runRclone(['lsjson', remote, '--files-only'], rclone));
}

export async function pruneOffsite(
  remote,
  entries,
  currentStem,
  rclone = 'rclone',
  now = Date.now(),
) {
  if (!namePattern.test(currentStem ?? '')) throw new Error('Backup atual inválido.');
  checkOffsite(entries, now);
  const pairs = backupPairs(entries);
  if (pairs[0].stem !== currentStem) throw new Error('Backup atual não é o mais recente.');
  const expired = planRetention(entries, now);
  for (const pair of expired) {
    for (const name of pair.files) await runRclone(['deletefile', `${remote}/${name}`], rclone);
  }
  return expired.length;
}
