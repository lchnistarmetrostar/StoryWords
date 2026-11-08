import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../scripts/start-public.cjs', import.meta.url), 'utf8');

test('public dev/start disable owner credentials before Next loads', () => {
  for (const mode of ['dev', 'start']) {
    const process = {
      execPath: 'node', argv: ['node', 'launcher', mode, '--port', '3005'],
      env: { STORYWORDS_BYOK_ONLY: '0', STORYWORDS_LOCAL_AI_DEMO: '1',
        AI_BASE_URL: 'https://example.invalid', AI_MODEL: 'fixture', AI_API_KEY: 'fixture-not-a-key',
        STORYWORDS_ALLOWED_ORIGINS: 'http://127.0.0.1:3005' },
    };
    let called = false;
    const require = Object.assign((path: string) => {
      called = true;
      assert.equal(path, 'next-entry');
      assert.equal(process.env.STORYWORDS_BYOK_ONLY, '1');
      assert.equal(process.env.STORYWORDS_LOCAL_AI_DEMO, '0');
      assert.equal(process.env.AI_BASE_URL + process.env.AI_MODEL + process.env.AI_API_KEY, '');
      assert.equal(process.env.STORYWORDS_ALLOWED_ORIGINS, 'http://127.0.0.1:3005');
    }, { resolve: () => 'next-entry' });
    runInNewContext(script, { process, require });
    assert.ok(called);
    assert.deepEqual(Array.from(process.argv), ['node', 'next-entry', mode, '--hostname', '127.0.0.1', '--port', '3005']);
  }
});

test('public entry supplies only local default origins and rejects unknown modes', () => {
  const process = { execPath: 'node', argv: ['node', 'launcher', 'start'], env: {} as Record<string, string> };
  const require = Object.assign(() => {}, { resolve: () => 'next-entry' });
  runInNewContext(script, { process, require });
  assert.equal(process.env.STORYWORDS_ALLOWED_ORIGINS, 'http://127.0.0.1:3000,http://localhost:3000');
  process.argv = ['node', 'launcher', 'unexpected'];
  assert.throws(() => runInNewContext(script, { process, require }), /Expected dev or start/);
});
