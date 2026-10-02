import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertPrivateProofOutput, assertProofTarget, auditProofPack, proofDigest, proofTransport, readPreparedProof, resolveProofRepository, resolveProofScope, scopeDigest, verifyPreparedProof } from '../scripts/lib/checkpoint-proof.mjs';

const bytes = Buffer.from('synthetic transport fixture, never provenance');
const scope = { repositoryId: 'github.com/fixture/test', candidate: 'a'.repeat(40), base: 'b'.repeat(40), nativeTip: 'c'.repeat(40),
  bundleSha256: proofDigest(bytes), expiresAt: '2030-01-01T00:00:00Z' };

test('transport binds exact scope and bytes; local expiry and every altered component fail closed', () => {
  const { text, parts } = proofTransport(scope, bytes);
  const digest = scopeDigest(scope);
  verifyPreparedProof(scope, digest, bytes, text, parts, 0);
  for (const changed of [{ ...scope, candidate: 'd'.repeat(40) }, { ...scope, base: 'd'.repeat(40) }, { ...scope, repositoryId: 'github.com/other/repo' }]) {
    assert.throws(() => verifyPreparedProof(changed, digest, bytes, text, parts, 0));
  }
  assert.throws(() => verifyPreparedProof(scope, digest, Buffer.from('changed'), text, parts, 0));
  assert.throws(() => verifyPreparedProof(scope, digest, bytes, text + ' ', parts, 0));
  assert.throws(() => verifyPreparedProof(scope, digest, bytes, text, [parts[1], parts[0]], 0));
  assert.throws(() => verifyPreparedProof(scope, digest, bytes, text, parts, Date.parse(scope.expiresAt)));
  const invalid = { ...scope, expiresAt: 'invalid' };
  assert.throws(() => verifyPreparedProof(invalid, scopeDigest(invalid), bytes, text, parts, 0));
  assert.throws(() => proofTransport(scope, Buffer.alloc(72000)));
});

test('moved checkout or remote target rejects the previous handoff', () => {
  assertProofTarget('a', 'a', 'a');
  assert.throws(() => assertProofTarget('a', 'b', 'a'));
  assert.throws(() => assertProofTarget('a', 'a', 'b'));
});

test('private output rejects source, Git and symlink destinations; existing files are read exactly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-proof-fixture-'));
  try {
    const repo = join(root, 'repo'); const gitDirectory = join(root, 'git');
    await mkdir(repo); await mkdir(gitDirectory); await symlink(repo, join(root, 'alias'));
    await assert.rejects(assertPrivateProofOutput(repo, gitDirectory, join(repo, 'proof')));
    await assert.rejects(assertPrivateProofOutput(repo, gitDirectory, join(gitDirectory, 'proof')));
    await assert.rejects(assertPrivateProofOutput(repo, gitDirectory, join(root, 'alias', 'proof')));
    const out = join(root, 'safe'); await assertPrivateProofOutput(repo, gitDirectory, out); await mkdir(out);
    const { text, parts } = proofTransport(scope, bytes);
    for (const [name, value] of Object.entries({ 'scope.json': JSON.stringify(scope), 'metadata.bundle': bytes, 'envelope.json': text, 'part-1.txt': parts[0], 'part-2.txt': parts[1] })) await writeFile(join(out, name), value);
    const prepared = await readPreparedProof(out);
    verifyPreparedProof(prepared.scope, scopeDigest(scope), prepared.bytes, prepared.text, prepared.parts, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('serialized native pack preserves IDs and rejects extra blobs, wrong tips and inline content', async () => {
  // Synthetic Git fixture exercises transport filtering only; it is never captured evidence.
  const root = await mkdtemp(join(tmpdir(), 'tabellio-proof-pack-fixture-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Transport Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('checkout', '-qb', 'entire/checkpoints/v1');
    const prefix = 'ab/cdef012345'; await mkdir(join(root, prefix, '0'), { recursive: true });
    const metadata = { checkpoint_id: 'abcdef012345', sessions: [{ metadata: `/${prefix}/0/metadata.json`, prompt: '', transcript: `/${prefix}/0/full.jsonl`, content_hash: 'fixture' }] };
    await writeFile(join(root, prefix, 'metadata.json'), JSON.stringify(metadata));
    await writeFile(join(root, prefix, '0/metadata.json'), JSON.stringify({ checkpoint_id: 'abcdef012345', session_id: 'synthetic' }));
    await writeFile(join(root, prefix, '0/full.jsonl'), 'private-transcript-marker');
    git('add', '.'); git('commit', '-qm', 'Synthetic transport fixture'); const tip = git('rev-parse', 'HEAD');
    const patterns = `/${prefix}/metadata.json\n/${prefix}/0/metadata.json\n`;
    const filter = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: patterns, encoding: 'utf8' }).trim();
    const bundle = join(root, 'filtered.bundle'); git('bundle', 'create', bundle, `--filter=sparse:oid=${filter}`, 'refs/heads/entire/checkpoints/v1');
    const filtered = await readFile(bundle);
    assert.deepEqual(await auditProofPack(root, filtered, tip, ['abcdef012345']), { metadataBlobs: 2, transcriptsIncluded: false, promptsIncluded: false });
    await assert.rejects(auditProofPack(root, filtered, 'a'.repeat(40), ['abcdef012345']));
    await assert.rejects(auditProofPack(root, Buffer.from('not a pack'), tip, ['abcdef012345']));
    await assert.rejects(auditProofPack(root, filtered, tip, ['invalid']));
    await assert.rejects(auditProofPack(root, filtered, tip, []));
    const full = join(root, 'full.bundle'); git('bundle', 'create', '--version=3', full, 'refs/heads/entire/checkpoints/v1');
    await assert.rejects(auditProofPack(root, await readFile(full), tip, ['abcdef012345']));
    metadata.sessions[0].prompt = 'inline-private-prompt'; await writeFile(join(root, prefix, 'metadata.json'), JSON.stringify(metadata));
    git('add', prefix); git('commit', '-qm', 'Unsupported inline prompt fixture'); const changed = git('rev-parse', 'HEAD');
    const inline = join(root, 'inline.bundle'); git('bundle', 'create', inline, `--filter=sparse:oid=${filter}`, 'refs/heads/entire/checkpoints/v1');
    await assert.rejects(auditProofPack(root, await readFile(inline), changed, ['abcdef012345']));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('push CLI accepts omitted PR number and reaches event-specific scope validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-proof-cli-fixture-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/fixture/test.git'], { cwd: root });
    const result = spawnSync(process.execPath, [resolve('scripts/tabellio-checkpoint-proof.mjs'), 'prepare',
      '--repo', root, '--repo-id', 'github.com/fixture/test', '--event', 'push', '--candidate', 'invalid', '--out', join(root, 'rejected')], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).stage, 'scope');
    assert.equal(result.stdout, '');
    const invalid = spawnSync(process.execPath, [resolve('scripts/tabellio-checkpoint-proof.mjs'), 'prepare', '--unknown', 'value'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1); assert.equal(JSON.parse(invalid.stderr).stage, 'options');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scope resolver separates landed and checkpoint ranges and rejects mismatched GitHub/target facts', async () => {
  const candidate = 'a'.repeat(40), base = 'b'.repeat(40), source = 'c'.repeat(40);
  const repository = { fullName: 'fixture/test', identity: 'github.com/fixture/test' };
  const options = { repositoryId: repository.identity, event: 'push', candidate };
  const merged = [{ number: 5, merged_at: '2026-01-01T00:00:00Z', merge_commit_sha: candidate, head: { sha: source } }];
  const dependencies = {
    repository,
    github: path => path.endsWith('/pulls') ? merged : { full_name: repository.fullName },
    git: (...args) => {
      const ref = args.at(-1);
      if (args[0] === 'merge-base' || ref === `${candidate}^` || ref === 'origin/main') return base;
      if (ref.endsWith('^{tree}')) return 'tree';
      return candidate;
    },
    remote: async () => candidate,
  };
  const push = await resolveProofScope(options, dependencies);
  assert.equal(push.checkpointHead, source); assert.equal(push.base, base); assert.equal(push.checkpointBase, base);
  const prOptions = { ...options, event: 'pull_request', pullRequest: '5' };
  const prDeps = { ...dependencies, remote: async ref => ref === 'refs/heads/main' ? base : candidate };
  const pr = await resolveProofScope(prOptions, prDeps);
  assert.equal(pr.checkpointHead, candidate); assert.equal(pr.targetRef, 'refs/pull/5/head');
  const direct = await resolveProofScope(options, { ...dependencies, github: path => path.endsWith('/pulls') ? [] : { full_name: repository.fullName } });
  assert.equal(direct.checkpointHead, candidate);
  for (const invalid of [{ ...options, event: 'unknown' }, { ...options, candidate: 'invalid' }, { ...options, repositoryId: 'github.com/foreign/test' }, { ...options, pullRequest: '5' }, { ...prOptions, pullRequest: undefined }]) {
    await assert.rejects(resolveProofScope(invalid, dependencies));
  }
  await assert.rejects(resolveProofScope(options, { ...dependencies, github: () => ({ full_name: 'foreign/test' }) }));
  await assert.rejects(resolveProofScope(options, { ...dependencies, git: (...args) => args.includes('--verify') ? base : dependencies.git(...args) }));
  await assert.rejects(resolveProofScope(options, { ...dependencies, remote: async () => base }));
  await assert.rejects(resolveProofScope(prOptions, dependencies));
  await assert.rejects(resolveProofScope(options, { ...dependencies, git: (...args) => args.at(-1) === `${source}^{tree}` ? 'different-tree' : dependencies.git(...args) }));
});

test('CLI resolves a checkout subdirectory before rejecting source-tree proof output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tabellio-proof-subdirectory-fixture-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/fixture/test.git'], { cwd: root });
    await mkdir(join(root, 'scripts')); await mkdir(join(root, 'docs')); await mkdir(join(root, 'bin'));
    const resolved = await resolveProofRepository(join(root, 'scripts'));
    assert.equal(resolved, await resolveProofRepository(root));
    const marker = join(root, 'unexpected-github-call');
    // Read-access stub only: preparation must reject this location before any GitHub call.
    const stub = join(root, 'bin', 'gh');
    await writeFile(stub, `#!/bin/sh\ntouch '${marker}'\nprintf '%s' '{"full_name":"fixture/test"}'\n`); await chmod(stub, 0o700);
    const result = spawnSync(process.execPath, [resolve('scripts/tabellio-checkpoint-proof.mjs'), 'prepare',
      '--repo', join(root, 'scripts'), '--repo-id', 'github.com/fixture/test', '--event', 'push',
      '--candidate', 'a'.repeat(40), '--out', join(root, 'docs', 'handoff')],
      { encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` } });
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).stage, 'scope');
    await assert.rejects(access(marker)); await assert.rejects(access(join(root, 'docs', 'handoff')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
