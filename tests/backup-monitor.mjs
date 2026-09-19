import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('monitor externo: resultados, configuração e falhas sem revelar URL', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'salao-monitor-test-'));
  const url = 'https://hc-ping.com/11111111-2222-3333-4444-555555555555';
  const capture = join(folder, 'request');
  try {
    await writeFile(
      join(folder, 'curl'),
      '#!/bin/bash\nprintf "%s\\n" "$@" > "$CAPTURE"\nprintf "%s" "$RESPONSE"\nexit "$CURL_EXIT"\n',
      { mode: 0o700 },
    );
    const run = (overrides = {}) => {
      const result = spawnSync('bash', ['scripts/notify-backup-monitor.sh'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${folder}:${process.env.PATH}`,
          CAPTURE: capture,
          RESPONSE: 'OK',
          CURL_EXIT: '0',
          HEALTHCHECKS_PING_URL: url,
          WORKFLOW_RESULT: 'success',
          ...overrides,
        },
      });
      assert.ok(!`${result.stdout}${result.stderr}`.includes(url));
      return result;
    };
    assert.equal(run().status, 0);
    let args = await readFile(capture, 'utf8');
    assert.ok(args.endsWith(`${url}\n`));
    assert.ok(args.includes('--max-time\n10\n'));
    for (const state of ['failure', 'cancelled']) {
      assert.equal(run({ WORKFLOW_RESULT: state }).status, 0);
      assert.ok((await readFile(capture, 'utf8')).endsWith(`${url}/fail\n`));
    }
    for (const response of ['OK (not found)', 'OK (rate limited)', '']) {
      assert.equal(run({ RESPONSE: response }).status, 1);
    }
    assert.equal(run({ CURL_EXIT: '28' }).status, 1);
    await rm(capture);
    assert.equal(run({ HEALTHCHECKS_PING_URL: '' }).status, 0);
    assert.equal(run({ HEALTHCHECKS_PING_URL: 'http://example.com/private' }).status, 1);
    assert.equal(run({ WORKFLOW_RESULT: 'unknown' }).status, 1);
    await assert.rejects(readFile(capture), { code: 'ENOENT' });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
