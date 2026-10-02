#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommandOptions, requireOptions } from './lib/cli-options.mjs';
import { effectiveGitHubRepository, readRemoteRefOid } from './lib/github-repository.mjs';
import { assertPrivateProofOutput, resolveProofRepository, resolveProofScope, auditProofPack, proofDigest, proofTransport, readPreparedProof, scopeDigest, verifyPreparedProof } from './lib/checkpoint-proof.mjs';

let ownedOutput;
let stage = 'options';
try {
  const options = parseCommandOptions(process.argv.slice(2), {
    prepare: ['repo', 'repoId', 'event', 'candidate', 'pullRequest', 'out'],
    check: ['repo', 'out', 'scopeSha256'],
  });
  requireOptions(options, options.command === 'prepare' ? ['repoId', 'event', 'candidate', 'out'] : ['out', 'scopeSha256']);
  const repo = await resolveProofRepository(options.repo ?? '.');
  const out = resolve(options.out);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  stage = 'repository';
  const repository = await effectiveGitHubRepository({ repoPath: repo }, 'origin');
  const scopeNow = (repositoryId, event, candidate, pullRequest) => resolveProofScope({ repositoryId, event, candidate, pullRequest }, {
    repository, git,
    github: path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })),
    remote: ref => readRemoteRefOid({ repoPath: repo, remote: 'origin', ref }),
  });
  if (options.command === 'prepare') {
    stage = 'scope';
    await assertPrivateProofOutput(repo, resolve(repo, git('rev-parse', '--git-common-dir')), out);
    const range = await scopeNow(options.repoId, options.event, options.candidate, options.pullRequest);
    await mkdir(out, { mode: 0o700 }); ownedOutput = out;
    const exporter = fileURLToPath(new URL('./export-checkpoint-metadata.mjs', import.meta.url));
    stage = 'export';
    const exported = JSON.parse(execFileSync(process.execPath, [exporter, '--repo', repo, '--repo-id', range.repositoryId,
      '--base', range.checkpointBase, '--commit', range.checkpointHead, '--out', join(out, 'metadata.bundle')],
      { encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] }));
    const bytes = await readFile(join(out, 'metadata.bundle'));
    stage = 'pack-audit';
    const audit = await auditProofPack(repo, bytes, exported.nativeTip, exported.checkpointIds);
    const scope = { schemaVersion: 'tabellio-checkpoint-handoff-scope/v1', ...range, nativeTip: exported.nativeTip,
      checkpointIds: exported.checkpointIds, bundleSha256: proofDigest(bytes), bundleBytes: bytes.length,
      ...audit, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
    const transport = proofTransport(scope, bytes);
    for (const [name, value] of Object.entries({ 'scope.json': JSON.stringify(scope, null, 2), 'envelope.json': transport.text,
      'part-1.txt': transport.parts[0], 'part-2.txt': transport.parts[1] })) {
      await writeFile(join(out, name), value, { mode: 0o600, flag: 'wx' });
    }
    const current = await scopeNow(scope.repositoryId, scope.event, scope.candidate, scope.pullRequest);
    if (JSON.stringify(current) !== JSON.stringify(range) || git('rev-parse', 'refs/heads/entire/checkpoints/v1') !== scope.nativeTip) throw new Error('Evidence changed during preparation.');
    ownedOutput = null;
    console.log(JSON.stringify({ ok: true, ...range, scopeSha256: scopeDigest(scope), bundleSha256: scope.bundleSha256,
      bundleBytes: scope.bundleBytes, metadataBlobs: audit.metadataBlobs, expiresAt: scope.expiresAt, uploaded: false }));
  } else {
    stage = 'check';
    const prepared = await readPreparedProof(out);
    verifyPreparedProof(prepared.scope, options.scopeSha256, prepared.bytes, prepared.text, prepared.parts);
    const current = await scopeNow(prepared.scope.repositoryId, prepared.scope.event, prepared.scope.candidate, prepared.scope.pullRequest);
    for (const [key, value] of Object.entries(current)) if (prepared.scope[key] !== value) throw new Error('Candidate range changed.');
    await auditProofPack(repo, prepared.bytes, prepared.scope.nativeTip, prepared.scope.checkpointIds);
    console.log(JSON.stringify({ ok: true, scopeSha256: options.scopeSha256, uploaded: false }));
  }
} catch {
  if (ownedOutput) await rm(ownedOutput, { recursive: true, force: true });
  console.error(JSON.stringify({ ok: false, stage, reason: 'Private proof preparation/check blocked. Verify exact Git scope, pinned Entire, GitHub read access, private metadata and transport limits locally.' }));
  process.exitCode = 1;
}
