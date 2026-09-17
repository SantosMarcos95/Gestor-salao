import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const header = Buffer.from('SALAOBK1');

function keyFromHex(value) {
  if (!/^[a-f0-9]{64}$/i.test(value ?? ''))
    throw new Error('BACKUP_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais.');
  return Buffer.from(value, 'hex');
}

function runRclone(args, executable = 'rclone') {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('rclone indisponível.')));
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Falha no envio ou leitura da cópia externa.')),
    );
  });
}

async function remoteDigest(target, executable = 'rclone') {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['cat', target], { stdio: ['ignore', 'pipe', 'pipe'] });
    const hash = createHash('sha256');
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('rclone indisponível.')));
    child.on('close', (code) =>
      code === 0
        ? resolve({ sha256: hash.digest('hex'), bytes })
        : reject(new Error('Não foi possível ler a cópia externa.')),
    );
  });
}

export async function encryptBackup(input, output, keyHex) {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const destination = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  try {
    destination.write(Buffer.concat([header, iv]));
    await pipeline(createReadStream(input), cipher, destination, { end: false });
    await new Promise((resolve, reject) => {
      destination.end(cipher.getAuthTag(), resolve);
      destination.once('error', reject);
    });
  } catch (error) {
    destination.destroy();
    await unlink(output).catch(() => {});
    throw error;
  } finally {
    key.fill(0);
  }
}

export async function decryptBackup(input, output, keyHex) {
  const key = keyFromHex(keyHex);
  const size = (await stat(input)).size;
  if (size < header.length + 12 + 16) throw new Error('Cópia criptografada inválida.');
  const file = await open(input, 'r');
  const prefix = Buffer.alloc(header.length + 12);
  const tag = Buffer.alloc(16);
  try {
    await file.read(prefix, 0, prefix.length, 0);
    await file.read(tag, 0, 16, size - 16);
  } finally {
    await file.close();
  }
  if (!prefix.subarray(0, header.length).equals(header))
    throw new Error('Formato de cópia criptografada inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key, prefix.subarray(header.length));
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(input, { start: prefix.length, end: size - 17 }),
      decipher,
      createWriteStream(output, { flags: 'wx', mode: 0o600 }),
    );
  } catch {
    await unlink(output).catch(() => {});
    throw new Error('Falha de autenticação da cópia criptografada.');
  } finally {
    key.fill(0);
  }
}

export async function publishOffsite(folder, { remote, keyHex, rclone = 'rclone' }) {
  if (!/^[A-Za-z0-9_-]+:[^\n\r]*$/.test(remote ?? '') || remote.includes('..'))
    throw new Error('BACKUP_REMOTE inválido.');
  keyFromHex(keyHex).fill(0);
  const encrypted = join(folder, 'database.dump.enc');
  const target = `${remote.replace(/\/$/, '')}/${folder.split('/').at(-1)}.dump.enc`;
  const manifestTarget = target.replace(/\.dump\.enc$/, '.manifest.json');
  try {
    await encryptBackup(join(folder, 'database.dump'), encrypted, keyHex);
    const local = { sha256: await fileDigest(encrypted), bytes: (await stat(encrypted)).size };
    await runRclone(['copyto', encrypted, target], rclone);
    const uploaded = await remoteDigest(target, rclone);
    if (local.sha256 !== uploaded.sha256 || local.bytes !== uploaded.bytes)
      throw new Error('Cópia externa divergente.');
    const manifest = join(folder, 'manifest.json');
    const manifestHash = await fileDigest(manifest);
    await runRclone(['copyto', manifest, manifestTarget], rclone);
    if ((await remoteDigest(manifestTarget, rclone)).sha256 !== manifestHash)
      throw new Error('Manifesto externo divergente.');
    return { target, manifestTarget, sha256: local.sha256, bytes: local.bytes };
  } finally {
    await unlink(encrypted).catch(() => {});
  }
}

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
