#!/usr/bin/env node
import { chmod, open, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseOptionPairs } from './lib/cli-options.mjs';
import { runGit } from './lib/git-process.mjs';
import { captureValidationCheckpoints } from './lib/validation-checkpoints.mjs';

let ownedOutput;
try {
  const options = parseOptionPairs(process.argv.slice(2));
  if (Object.keys(options).some(key => !['repo', 'repoId', 'base', 'commit', 'out'].includes(key)) || !options.repoId || !options.base || !options.commit || !options.out) throw new Error('Required export options are missing or unsupported.');
  const repo = resolve(options.repo ?? '.');
  const git = async (...args) => (await runGit({ cwd: repo, args })).stdout.trim();
  const headCommit = await git('rev-parse', '--verify', '--end-of-options', `${options.commit}^{commit}`);
  const baseCommit = await git('rev-parse', '--verify', '--end-of-options', `${options.base}^{commit}`);
  const mergeBase = await git('merge-base', baseCommit, headCommit);
  const messages = await git('log', '--format=%B', `${mergeBase}..${headCommit}`, '--');
  const ids = [...new Set([...messages.matchAll(/^Entire-Checkpoint:\s*([0-9a-f]{12})\s*$/gim)].map(match => match[1].toLowerCase()))];
  const evidence = await captureValidationCheckpoints(repo, options.repoId, { mergeBase, headCommit }, ids);
  if (evidence.provider.version !== '0.7.7') throw new Error('Metadata export requires pinned Entire 0.7.7.');
  const nativeRef = 'refs/heads/entire/checkpoints/v1';
  const nativeTip = await git('rev-parse', '--verify', `${nativeRef}^{commit}`);
  const paths = evidence.checkpoints.flatMap(checkpoint => {
    const prefix = `${checkpoint.id.slice(0, 2)}/${checkpoint.id.slice(2)}`;
    return [`${prefix}/metadata.json`, ...checkpoint.sessions.map(session => `${prefix}/${session.index}/metadata.json`)];
  });
  // A native Git filter preserves commit/tree identities; no checkpoint is reconstructed.
  const pattern = `${paths.map(path => `/${path}`).join('\n')}\n`;
  const patternOid = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo, input: pattern, encoding: 'utf8', timeout: 30000 }).trim();
  const filter = `sparse:oid=${patternOid}`;
  const objects = (await git('rev-list', '--objects', `--filter=${filter}`, nativeTip)).split('\n');
  let metadataBlobs = 0;
  for (const object of objects) {
    const [oid, ...name] = object.split(' ');
    if (await git('cat-file', '-t', oid) === 'blob') {
      if (!paths.includes(name.join(' '))) throw new Error('Filtered export includes an unexpected blob.');
      metadataBlobs += 1;
    }
  }
  const out = resolve(options.out);
  const file = await open(out, 'wx', 0o600); await file.close(); ownedOutput = out;
  await git('bundle', 'create', out, `--filter=${filter}`, nativeRef);
  await chmod(out, 0o600);
  if (await git('rev-parse', nativeRef) !== nativeTip) throw new Error('Native checkpoint history changed during export.');
  await git('bundle', 'verify', out);
  const bytes = await readFile(out);
  console.log(JSON.stringify({ ok: true, nativeRef, nativeTip, headCommit, mergeBase, checkpointIds: ids.sort(), metadataBlobs, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), transcriptsIncluded: false, promptsIncluded: false }));
  ownedOutput = null;
} catch {
  if (ownedOutput) await rm(ownedOutput, { force: true });
  console.error(JSON.stringify({ ok: false, reason: 'Native metadata export failed; inspect private local evidence and pinned prerequisites.' }));
  process.exitCode = 1;
}
