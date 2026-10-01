import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const helper = resolve('.buildkite/scripts/checkpoint-evidence.sh');
const summary = resolve('scripts/validation-public-summary.mjs');
const run = (cwd, command, args, env = {}) => spawnSync(command, args, { cwd, env: { ...process.env, TABELLIO_CHECKPOINT_BUNDLE: '', ...env }, encoding: 'utf8' });
const git = (cwd, ...args) => { const r = run(cwd, 'git', ['-c', 'core.hooksPath=/dev/null', ...args]); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
test('customer checkpoint bundle import blocks missing/invalid evidence and preserves native identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-checkpoint-import-'));
  try {
    const source = join(root, 'source'); const target = join(root, 'target');
    git(root, 'init', source); git(root, 'init', target);
    git(source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'Fixture object, not provenance proof');
    const head = git(source, 'rev-parse', 'HEAD');
    git(source, 'branch', 'entire/checkpoints/v1');
    const bundle = join(root, 'checkpoints.bundle'); git(source, 'bundle', 'create', bundle, 'refs/heads/entire/checkpoints/v1');
    const missing = run(target, 'bash', [helper]); assert.equal(missing.status, 1); assert.match(missing.stderr, /trusted worker/);
    const invalid = join(root, 'invalid.bundle'); await writeFile(invalid, 'private-secret-marker');
    const bad = run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: invalid }); assert.equal(bad.status, 1); assert.ok(!bad.stderr.includes('private-secret-marker'));
    const wrong = join(root, 'wrong.bundle'); git(source, 'bundle', 'create', wrong, 'HEAD');
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: wrong }).status, 1);
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: bundle }).status, 0);
    assert.equal(git(target, 'rev-parse', 'refs/heads/entire/checkpoints/v1'), head);
    assert.equal(run(target, 'bash', [helper]).status, 0);
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: bundle }).status, 0);
    // Divergent local native history is never overwritten by an import.
    git(target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'Different fixture root');
    const different = git(target, 'rev-parse', 'HEAD'); git(target, 'update-ref', 'refs/heads/entire/checkpoints/v1', different);
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: bundle }).status, 1);
    assert.equal(git(target, 'rev-parse', 'refs/heads/entire/checkpoints/v1'), different);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('public CI summary never forwards private metadata or error content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-public-summary-'));
  try {
    const input = join(root, 'private.json'); const output = join(root, 'public.json');
    for (const value of [{ ok: true, result: { status: 'passed', session: 'private-secret-marker' } }, { ok: false, error: 'private-secret-marker' }]) {
      await writeFile(input, JSON.stringify(value));
      assert.equal(run(root, process.execPath, [summary, input, output]).status, 0);
      const result = JSON.parse(await readFile(output, 'utf8'));
      assert.deepEqual(Object.keys(result), ['status']); assert.ok(!JSON.stringify(result).includes('private-secret-marker'));
      assert.equal(result.status, value.ok ? 'passed' : 'blocked');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
