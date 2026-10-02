import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
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
      assert.deepEqual(Object.keys(result), ['status', 'validators']); assert.deepEqual(result.validators, []); assert.ok(!JSON.stringify(result).includes('private-secret-marker'));
      assert.equal(result.status, value.ok ? 'passed' : 'blocked');
    }
    await writeFile(input, JSON.stringify({ ok: true, result: { status: 'failed', validators: [
      { id: 'control-plane-static', status: 'failed', reasons: ['command_failed', 'private-secret-marker'] },
      { id: 'private-secret-marker', status: 'failed', reasons: [] },
      { id: 'control-plane-security', status: 'private-secret-marker', reasons: [] }
    ], commands: [{ id: 'control-plane-static', stdout: { tail: 'not ok 1 private-secret-marker\n# fail 1\n', bytes: 100, digest: 'private-secret-marker', truncated: false }, stderr: 'private-secret-marker' }] } }));
    assert.equal(run(root, process.execPath, [summary, input, output]).status, 0);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { status: 'failed', validators: [{ id: 'control-plane-static', status: 'failed', reasons: ['command_failed'], testFailures: 1 }] });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('filtered native bundle preserves original identity and excludes transcript and prompt blobs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-metadata-only-'));
  try {
    const source = join(root, 'source'); const target = join(root, 'target');
    git(root, 'init', source); git(root, 'init', target);
    // Synthetic transport fixture only: this does not establish live provenance.
    await writeFile(join(source, 'metadata.json'), '{"fixture":"metadata"}');
    await writeFile(join(source, 'full.jsonl'), 'private-transcript-marker');
    await writeFile(join(source, 'prompt.txt'), 'private-prompt-marker');
    git(source, 'add', '.');
    git(source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Synthetic filtered transport fixture');
    const head = git(source, 'rev-parse', 'HEAD');
    git(source, 'branch', 'entire/checkpoints/v1');
    const patterns = join(root, 'patterns'); await writeFile(patterns, '/metadata.json\n');
    const filter = git(source, 'hash-object', '-w', patterns);
    const bundle = join(root, 'metadata.bundle');
    git(source, 'bundle', 'create', bundle, `--filter=sparse:oid=${filter}`, 'refs/heads/entire/checkpoints/v1');
    await writeFile(join(target, 'candidate.mjs'), 'export const fixture = true;\n');
    git(target, 'add', '.');
    git(target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Public candidate fixture');
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: bundle }).status, 0);
    assert.equal(git(target, 'rev-parse', 'refs/heads/entire/checkpoints/v1'), head);
    assert.equal(git(target, 'show', `${head}:metadata.json`), '{"fixture":"metadata"}');
    const probe = run(target, 'bash', [resolve('.buildkite/scripts/verify-git-toolchain.sh')], { TABELLIO_GIT_EVIDENCE_PATH: join(root, 'capability.json') });
    assert.equal(probe.status, 0, 'The candidate Git capability probe must not traverse excluded private checkpoint blobs.');

    for (const path of ['full.jsonl', 'prompt.txt']) {
      const oid = git(source, 'rev-parse', `${head}:${path}`);
      assert.notEqual(run(target, 'git', ['cat-file', '-e', oid]).status, 0);
    }
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: bundle }).status, 0);
    // Existing divergent native history survives a filtered import unchanged.
    git(target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'Separate fixture history');
    const divergent = git(target, 'rev-parse', 'HEAD');
    git(target, 'update-ref', 'refs/heads/entire/checkpoints/v1', divergent);
    assert.equal(run(target, 'bash', [helper], { TABELLIO_CHECKPOINT_BUNDLE: bundle }).status, 1);
    assert.equal(git(target, 'rev-parse', 'refs/heads/entire/checkpoints/v1'), divergent);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('private runner envelope binds candidate and digest, rejects leaks, and removes only imported objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-private-proof-'));
  try {
    const source = join(root, 'source'); const target = join(root, 'target'); const runner = join(root, 'runner');
    git(root, 'init', source); git(root, 'init', target); await mkdir(runner);
    await writeFile(join(source, 'metadata.json'), '{"fixture":"transport metadata, not provenance"}');
    await writeFile(join(source, 'prompt.txt'), 'private-prompt-marker');
    await writeFile(join(source, 'full.jsonl'), 'private-transcript-marker');
    git(source, 'add', '.'); git(source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Synthetic transport fixture');
    const nativeTip = git(source, 'rev-parse', 'HEAD'); git(source, 'branch', 'entire/checkpoints/v1');
    const patterns = join(root, 'patterns'); await writeFile(patterns, '/metadata.json\n');
    const oid = git(source, 'hash-object', '-w', patterns); const bundle = join(root, 'native.bundle');
    git(source, 'bundle', 'create', bundle, `--filter=sparse:oid=${oid}`, 'refs/heads/entire/checkpoints/v1');
    await mkdir(join(target, '.buildkite/scripts'), { recursive: true }); await writeFile(join(target, '.buildkite/scripts/checkpoint-evidence.sh'), await readFile(helper));
    git(target, 'add', '.'); git(target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture base');
    const base = git(target, 'rev-parse', 'HEAD'); git(target, 'update-ref', 'refs/remotes/origin/main', base);
    git(target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'Fixture candidate');
    const candidate = git(target, 'rev-parse', 'HEAD'); const bytes = await readFile(bundle);
    const { createHash } = await import('node:crypto');
    const envelope = { schemaVersion: 'tabellio-private-checkpoint-proof/v1', repositoryId: 'github.com/Fixture/Transport', candidate, base, nativeTip, sha256: createHash('sha256').update(bytes).digest('hex'), bundle: bytes.toString('base64') };
    const loader = resolve('scripts/ci-checkpoint-evidence.mjs');
    const invoke = (command, value = envelope) => {
      const text = JSON.stringify(value); const middle = Math.floor(text.length / 2);
      return run(target, process.execPath, [loader, command], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_WORKSPACE: target, RUNNER_TEMP: runner, GITHUB_REPOSITORY: 'Fixture/Transport', TABELLIO_CHECKPOINT_PROOF_1: text.slice(0, middle), TABELLIO_CHECKPOINT_PROOF_2: text.slice(middle) });
    };
    for (const bad of [{ ...envelope, candidate: base }, { ...envelope, sha256: '0'.repeat(64) }, { ...envelope, repositoryId: 'wrong/private-secret-marker' }]) {
      const r = invoke('load', bad); assert.equal(r.status, 1); assert.ok(!r.stderr.includes('private-secret-marker'));
    }
    // A main push advances origin/main to HEAD; the gate still validates HEAD^..HEAD.
    git(target, 'update-ref', 'refs/remotes/origin/main', candidate);
    const invokePush = value => {
      const text = JSON.stringify(value); const middle = Math.floor(text.length / 2);
      return run(target, process.execPath, [loader, 'load'], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_WORKSPACE: target, RUNNER_TEMP: runner, GITHUB_REPOSITORY: 'Fixture/Transport', TABELLIO_CHECKPOINT_PROOF_1: text.slice(0, middle), TABELLIO_CHECKPOINT_PROOF_2: text.slice(middle) });
    };
    assert.equal(invokePush({ ...envelope, base: candidate }).status, 1, 'HEAD is not the prior push base');
    assert.equal(invokePush({ ...envelope, repositoryId: 'github.com/Wrong/Repository' }).status, 1);
    assert.equal(invokePush({ ...envelope, candidate: base }).status, 1);
    assert.equal(invokePush(envelope).status, 0, 'prior-base proof loads after origin/main advances');
    assert.equal(git(target, 'rev-parse', 'refs/heads/entire/checkpoints/v1'), nativeTip);
    assert.equal(invoke('cleanup').status, 0);
    git(target, 'update-ref', 'refs/remotes/origin/main', base);
    assert.equal(invoke('load', { ...envelope, base: candidate }).status, 1, 'PR proof rejects the wrong base');
    const loaded = invoke('load'); assert.equal(loaded.status, 0, loaded.stderr);
    assert.equal(git(target, 'rev-parse', 'refs/heads/entire/checkpoints/v1'), nativeTip);
    for (const path of ['prompt.txt', 'full.jsonl']) assert.notEqual(run(target, 'git', ['cat-file', '-e', git(source, 'rev-parse', `${nativeTip}:${path}`)]).status, 0);
    const cleaned = invoke('cleanup'); assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.notEqual(run(target, 'git', ['rev-parse', '--verify', 'refs/heads/entire/checkpoints/v1']).status, 0);
    assert.notEqual(run(target, 'git', ['cat-file', '-e', nativeTip]).status, 0);
    assert.equal(git(target, 'rev-parse', 'HEAD'), candidate); git(target, 'cat-file', '-e', base);
    assert.ok(!(loaded.stdout + loaded.stderr + cleaned.stdout + cleaned.stderr).includes('private-prompt-marker'));
    assert.ok(!(loaded.stdout + cleaned.stdout).includes(nativeTip));
    for (const ref of ['refs/heads/entire/checkpoints/v1', 'refs/tabellio/validations']) {
      git(target, 'update-ref', ref, base); assert.equal(invoke('load').status, 1);
      assert.equal(git(target, 'rev-parse', ref), base); git(target, 'update-ref', '-d', ref);
    }
    git(target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'Second PR candidate');
    const secondCandidate = git(target, 'rev-parse', 'HEAD');
    assert.equal(git(target, 'rev-parse', 'HEAD^'), candidate);
    assert.equal(git(target, 'merge-base', 'origin/main', 'HEAD'), base);
    assert.equal(invoke('load', { ...envelope, candidate: secondCandidate, base: candidate }).status, 1, 'multi-commit PR must reject HEAD^ in place of merge-base');
    assert.equal(invoke('load', { ...envelope, candidate: secondCandidate }).status, 0, 'multi-commit PR retains its merge-base');
    assert.equal(invoke('cleanup').status, 0);
    assert.equal(git(target, 'rev-parse', 'HEAD'), secondCandidate);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('Buildkite repository extraction uses shared GitHub parser for HTTPS and SSH origins', async () => {
  const source = await readFile(resolve('.buildkite/scripts/product-validation.sh'), 'utf8');
  const extraction = source.match(/node --input-type=module -e '([^']+)' "\$repository_url"/);
  assert.ok(extraction, 'Exercise the registered shell command, not a copy of its parser');
  for (const remote of ['https://github.com/Fixture/Transport.git', 'git@github.com:Fixture/Transport.git', 'ssh://git@github.com/Fixture/Transport.git']) {
    const result = run(process.cwd(), process.execPath, ['--input-type=module', '-e', extraction[1], remote]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'Fixture/Transport');
  }
  for (const remote of ['ssh://git@example.com/Fixture/Transport.git', 'https://github.com/Fixture/Transport/extra', 'ssh://git@github.com/../Transport.git', 'not-a-repository']) {
    const result = run(process.cwd(), process.execPath, ['--input-type=module', '-e', extraction[1], remote]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), '');
  }
});
