#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
const proofRoot = resolve(process.env.RUNNER_TEMP ?? '', 'tabellio-checkpoint-proof');
const objects = gitDir => {
  const root = join(gitDir, 'objects');
  return readdirSync(root).flatMap(name => name === 'pack' || /^[0-9a-f]{2}$/.test(name)
    ? readdirSync(join(root, name)).map(file => `${name}/${file}`) : []);
};
try {
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP || realpathSync(process.env.GITHUB_WORKSPACE ?? '') !== process.cwd()) throw new Error('Not an owned runner checkout.');
  if (process.argv[2] === 'cleanup') {
    if (existsSync(join(proofRoot, 'context.json'))) {
      const context = JSON.parse(readFileSync(join(proofRoot, 'context.json'), 'utf8'));
      if (context.gitDir !== resolve(git('rev-parse', '--git-dir'))) throw new Error('Cleanup ownership mismatch.');
      const refs = git('for-each-ref', '--format=%(refname)').split('\n');
      for (const ref of refs) if (!context.refs.includes(ref) && (ref === 'refs/heads/entire/checkpoints/v1' || ref.startsWith('refs/tabellio/'))) git('update-ref', '-d', ref);
      for (const file of objects(context.gitDir)) if (!context.objects.includes(file)) rmSync(join(context.gitDir, 'objects', file));
    }
    rmSync(proofRoot, { recursive: true, force: true });
    if (existsSync(proofRoot)) throw new Error('Cleanup incomplete.');
    console.log('Private checkpoint runner files removed.');
  } else if (process.argv[2] === 'load') {
    const text = (process.env.TABELLIO_CHECKPOINT_PROOF_1 ?? '') + (process.env.TABELLIO_CHECKPOINT_PROOF_2 ?? '');
    if (!text || text.length > 98000) throw new Error('Missing or oversized evidence.');
    const envelope = JSON.parse(text);
    if (Object.keys(envelope).sort().join(',') !== 'base,bundle,candidate,nativeTip,repositoryId,schemaVersion,sha256'
      || envelope.schemaVersion !== 'tabellio-private-checkpoint-proof/v1'
      || envelope.repositoryId !== `github.com/${process.env.GITHUB_REPOSITORY}`
      || envelope.candidate !== git('rev-parse', 'HEAD')
      || envelope.base !== git('merge-base', 'origin/main', 'HEAD')
      || !/^[0-9a-f]{40}$/.test(envelope.nativeTip)) throw new Error('Evidence scope mismatch.');
    const bytes = Buffer.from(envelope.bundle, 'base64');
    if (bytes.toString('base64') !== envelope.bundle || createHash('sha256').update(bytes).digest('hex') !== envelope.sha256) throw new Error('Evidence integrity mismatch.');
    const gitDir = resolve(git('rev-parse', '--git-dir'));
    const refs = git('for-each-ref', '--format=%(refname)').split('\n');
    if (refs.some(ref => ref === 'refs/heads/entire/checkpoints/v1' || ref.startsWith('refs/tabellio/'))) throw new Error('Private refs already exist; refuse to alter customer history.');
    mkdirSync(proofRoot, { mode: 0o700 });
    writeFileSync(join(proofRoot, 'context.json'), JSON.stringify({ gitDir, objects: objects(gitDir), refs }), { mode: 0o600, flag: 'wx' });
    const bundle = join(proofRoot, 'checkpoints.bundle');
    writeFileSync(bundle, bytes, { mode: 0o600, flag: 'wx' });
    execFileSync('bash', ['.buildkite/scripts/checkpoint-evidence.sh'], { env: { ...process.env, TABELLIO_CHECKPOINT_BUNDLE: bundle }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
    if (git('rev-parse', 'refs/heads/entire/checkpoints/v1') !== envelope.nativeTip) throw new Error('Native identity mismatch.');
    console.log('Genuine native checkpoint evidence imported for the exact candidate.');
  } else throw new Error('Unsupported operation.');
} catch {
  console.error('Private checkpoint proof blocked; inspect the approved private evidence locally.');
  process.exitCode = 1;
}
