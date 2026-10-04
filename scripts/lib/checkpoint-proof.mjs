import { mergedPullRequestForCommit } from './merged-pull-request.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

export const proofDigest = value => createHash('sha256').update(value).digest('hex');
export const scopeDigest = scope => proofDigest(JSON.stringify(scope));

export function createMetadataProofBundle(repo, nativeTip, paths) {
  if (!/^[0-9a-f]{40}$/.test(nativeTip) || !Array.isArray(paths) || paths.length === 0
    || paths.some(path => typeof path !== 'string' || !/^[0-9a-f]{2}\/[0-9a-f]{10}\/(?:(?:0|[1-9][0-9]*)\/)?metadata\.json$/.test(path))) throw new Error('Invalid native metadata scope.');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  // Keep every original commit, but only the trees and blobs needed for selected metadata.
  const objects = new Set(git('rev-list', '--objects', '--no-object-names', '--filter=tree:0', nativeTip).split('\n'));
  objects.add(git('rev-parse', '--verify', '--end-of-options', `${nativeTip}^{tree}`));
  const selectedPaths = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let length = 1; length <= parts.length; length++) selectedPaths.add(parts.slice(0, length).join('/'));
  }
  for (const path of selectedPaths) objects.add(git('rev-parse', '--verify', '--end-of-options', `${nativeTip}:${path}`));
  const pack = execFileSync('git', ['pack-objects', '--stdout', '--compression=9', '--window=250', '--depth=250', '--delta-base-offset', '--no-reuse-object', '--no-reuse-delta'], {
    cwd: repo, input: `${[...objects].join('\n')}\n`, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const header = Buffer.from(`# v3 git bundle\n@object-format=sha1\n@filter=tree:0\n${nativeTip} refs/heads/entire/checkpoints/v1\n\n`);
  return Buffer.concat([header, pack]);
}

export function proofTransport(scope, bytes) {
  const envelope = { schemaVersion: 'tabellio-private-checkpoint-proof/v1', repositoryId: scope.repositoryId,
    candidate: scope.candidate, base: scope.base, nativeTip: scope.nativeTip,
    sha256: proofDigest(bytes), bundle: bytes.toString('base64') };
  const text = JSON.stringify(envelope);
  const midpoint = Math.floor(text.length / 2);
  const parts = [text.slice(0, midpoint), text.slice(midpoint)];
  if (text.length > 98000 || parts.some(part => Buffer.byteLength(part) > 48000)) throw new Error('Proof exceeds the existing private transport limits.');
  return { text, parts };
}

export function verifyPreparedProof(scope, expectedDigest, bytes, text, parts, now = Date.now()) {
  if (scopeDigest(scope) !== expectedDigest || scope.bundleSha256 !== proofDigest(bytes)
    || !Number.isFinite(Date.parse(scope.expiresAt)) || Date.parse(scope.expiresAt) <= now) throw new Error('Proof scope changed or expired.');
  const transport = proofTransport(scope, bytes);
  if (transport.text !== text || parts.length !== 2 || parts.some((part, index) => part !== transport.parts[index])) throw new Error('Prepared transport changed.');
}

// Inspect the serialized pack, not only Git's proposed filter traversal. Never import it.
export async function auditProofPack(repo, bytes, nativeTip, checkpointIds) {
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const separator = bytes.indexOf(Buffer.from('\n\n'));
  if (separator < 0 || bytes.subarray(separator + 2, separator + 6).toString() !== 'PACK') throw new Error('Invalid native bundle.');
  const header = bytes.subarray(0, separator).toString();
  if (!header.startsWith('# v3 git bundle\n') || header.split('\n').filter(line => /^[0-9a-f]{40} /.test(line)).join('\n') !== `${nativeTip} refs/heads/entire/checkpoints/v1`
    || header.split('\n').some(line => line.startsWith('-'))) throw new Error('Unexpected bundle refs or prerequisites.');
  const expected = expectedMetadataBlobs(git, nativeTip, checkpointIds);
  const temporary = await mkdtemp(join(tmpdir(), 'tabellio-proof-audit-'));
  try {
    const pack = join(temporary, 'native.pack');
    const index = join(temporary, 'native.idx');
    await writeFile(pack, bytes.subarray(separator + 2), { mode: 0o600, flag: 'wx' });
    git('index-pack', '--index-version=2', '-o', index, pack);
    const actual = new Set(git('verify-pack', '-v', index).split('\n').filter(line => line.split(/\s+/)[1] === 'blob').map(line => line.split(' ')[0]));
    if (actual.size !== expected.size || [...actual].some(oid => !expected.has(oid))) throw new Error('Unexpected packed content.');
    return { metadataBlobs: actual.size, transcriptsIncluded: false, promptsIncluded: false };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function readPreparedProof(out) {
  const [scope, bytes, text, first, second] = await Promise.all([
    readFile(join(out, 'scope.json'), 'utf8'), readFile(join(out, 'metadata.bundle')),
    readFile(join(out, 'envelope.json'), 'utf8'), readFile(join(out, 'part-1.txt'), 'utf8'), readFile(join(out, 'part-2.txt'), 'utf8'),
  ]);
  return { scope: JSON.parse(scope), bytes, text, parts: [first, second] };
}

export function assertProofTarget(candidate, head, remoteHead) {
  if (candidate !== head || candidate !== remoteHead) throw new Error('Current target moved.');
}

export async function assertPrivateProofOutput(repo, gitDirectory, out) {
  const destination = join(await realpath(dirname(resolve(out))), resolve(out).split('/').at(-1));
  for (const root of [await realpath(repo), await realpath(gitDirectory)]) {
    const path = relative(root, destination);
    if (path === '' || (!path.startsWith('../') && path !== '..' && !path.startsWith('/'))) throw new Error('Proof output must stay outside source and Git directories.');
  }
}

function expectedMetadataBlobs(git, nativeTip, checkpointIds) {
  const expected = new Set();
  for (const id of checkpointIds) {
    if (!/^[0-9a-f]{12}$/.test(id)) throw new Error('Invalid checkpoint ID.');
    const prefix = `${id.slice(0, 2)}/${id.slice(2)}`;
    const metadata = JSON.parse(git('show', `${nativeTip}:${prefix}/metadata.json`));
    if (!Array.isArray(metadata.sessions) || metadata.sessions.length === 0) throw new Error('Missing session metadata.');
    const paths = [`${prefix}/metadata.json`];
    for (const session of metadata.sessions) {
      paths.push(sessionMetadataPath(prefix, session));
    }
    for (const path of paths) {
      const value = JSON.parse(git('show', `${nativeTip}:${path}`));
      assertMetadataFields(value);
      expected.add(git('rev-parse', `${nativeTip}:${path}`));
    }
  }
  if (expected.size === 0) throw new Error('Missing checkpoint metadata.');
  return expected;
}

function sessionMetadataPath(prefix, session) {
  const match = typeof session.metadata === 'string' && session.metadata.match(new RegExp(`^/${prefix}/(0|[1-9][0-9]*)/metadata\\.json$`));
  if (!match) throw new Error('Unsupported session path.');
  const directory = `/${prefix}/${match[1]}`;
  if ((session.prompt !== '' && session.prompt !== `${directory}/prompt.txt`) || session.transcript !== `${directory}/full.jsonl`
    || Object.keys(session).some(key => !['metadata', 'prompt', 'transcript', 'content_hash'].includes(key))) throw new Error('Inline session content is unsupported.');
  return session.metadata.slice(1);
}

function assertMetadataFields(value) {
  const allowed = ['cli_version', 'checkpoint_id', 'strategy', 'checkpoints_count', 'files_touched', 'sessions', 'token_usage', 'session_id', 'created_at', 'agent', 'model', 'branch', 'save_step_count', 'turn_id', 'session_metrics', 'initial_attribution', 'combined_attribution', 'prompt_attributions', 'checkpoint_transcript_start', 'transcript_lines_at_start', 'transcript_identifier_at_start', 'is_task', 'tool_use_id'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported metadata fields require private review.');
  assertNativeCounters(value);
}

export async function resolveProofScope(options, dependencies) {
  const { repositoryId, event, candidate, pullRequest } = options;
  const { repository, git, github, remote } = dependencies;
  assertScopeOptions(options, repository);
  const canonical = github(`repos/${repository.fullName}`);
  const canonicalId = `github.com/${canonical.full_name}`;
  if (canonicalId.toLowerCase() !== repositoryId.toLowerCase()) throw new Error('Canonical repository mismatch.');
  if (git('rev-parse', '--verify', `${candidate}^{commit}`) !== candidate) throw new Error('Candidate unavailable.');
  const targetRef = event === 'push' ? 'refs/heads/main' : `refs/pull/${pullRequest}/head`;
  assertProofTarget(candidate, git('rev-parse', 'HEAD'), await remote(targetRef));
  await assertFreshMain(event, git, remote);
  const base = event === 'push' ? git('rev-parse', `${candidate}^`) : git('merge-base', 'origin/main', candidate);
  const checkpointHead = checkpointSource(event, candidate, repository, git, github);
  return { repositoryId: canonicalId, event, candidate, targetRef, ...(pullRequest === undefined ? {} : { pullRequest }),
    base, checkpointHead, checkpointBase: git('merge-base', base, checkpointHead) };
}

function assertScopeOptions({ repositoryId, event, candidate, pullRequest }, repository) {
  if (!['pull_request', 'push'].includes(event) || !/^[0-9a-f]{40}$/.test(candidate)) throw new Error('Invalid candidate scope.');
  if (typeof repositoryId !== 'string' || repository.identity.toLowerCase() !== repositoryId.toLowerCase()) throw new Error('Repository mismatch.');
  if (event === 'pull_request' && !/^[1-9][0-9]*$/.test(pullRequest ?? '')) throw new Error('PR number required.');
  if (event === 'push' && pullRequest !== undefined) throw new Error('Push must not specify PR.');
}

async function assertFreshMain(event, git, remote) {
  if (event === 'pull_request' && await remote('refs/heads/main') !== git('rev-parse', 'origin/main')) throw new Error('Fetch current main before preparing proof.');
}

function checkpointSource(event, candidate, repository, git, github) {
  if (event !== 'push') return candidate;
  const records = github(`repos/${repository.fullName}/commits/${candidate}/pulls`);
  const source = mergedPullRequestForCommit(records, candidate)?.headCommit ?? candidate;
  if (git('rev-parse', `${source}^{tree}`) !== git('rev-parse', `${candidate}^{tree}`)) throw new Error('Merged source tree mismatch.');
  return source;
}

export async function resolveProofRepository(repo) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: resolve(repo), encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  return realpath(root);
}

// Pinned Entire 0.7.7 checkpoint.go: accept counters, never summaries/review prompts.
function assertNativeCounters(value) {
  if (value.branch !== undefined && (typeof value.branch !== 'string' || /\s/.test(value.branch))) throw new Error('Invalid branch metadata.');
  assertNativeReferences(value);
  assertCounterFields(value.session_metrics, ['duration_ms', 'turn_count', 'context_tokens', 'context_window_size']);
  const attributionFields = ['calculated_at', 'agent_lines', 'agent_removed', 'human_added', 'human_modified', 'human_removed', 'total_committed', 'total_lines_changed', 'agent_percentage', 'metric_version'];
  assertCounterFields(value.initial_attribution, attributionFields);
  assertCounterFields(value.combined_attribution, attributionFields);
  assertPromptCounters(value.prompt_attributions);
}

function assertCounterFields(value, allowed) {
  if (value === undefined) return;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native counter object.');
  for (const [key, counter] of Object.entries(value)) {
    if (!allowed.includes(key)) throw new Error('Unsupported native counter field.');
    if (key === 'calculated_at') {
      if (typeof counter !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(counter) || !Number.isFinite(Date.parse(counter))) throw new Error('Invalid attribution time.');
    } else if (typeof counter !== 'number' || !Number.isFinite(counter)) throw new Error('Native counters cannot contain text.');
  }
}

function assertPromptCounters(value) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error('Invalid prompt attribution counters.');
  for (const item of value) {
    const { user_added_per_file, user_removed_per_file, ...counters } = item;
    assertCounterFields(counters, ['checkpoint_number', 'user_lines_added', 'user_lines_removed', 'agent_lines_added', 'agent_lines_removed']);
    for (const files of [user_added_per_file, user_removed_per_file]) {
      assertFileCounters(files);
    }
  }
}

function assertFileCounters(value) {
  if (value === undefined) return;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native file counters.');
  if (Object.values(value).some(counter => typeof counter !== 'number' || !Number.isFinite(counter))) throw new Error('Native counters cannot contain text.');
}

function assertNativeReferences(value) {
  for (const key of ['turn_id', 'tool_use_id', 'transcript_identifier_at_start']) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !/^[A-Za-z0-9_.:-]{1,256}$/.test(value[key]))) throw new Error('Invalid native reference.');
  }
  for (const key of ['save_step_count', 'checkpoint_transcript_start', 'transcript_lines_at_start']) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] < 0)) throw new Error('Invalid native integer counter.');
  }
  if (value.is_task !== undefined && typeof value.is_task !== 'boolean') throw new Error('Invalid native task flag.');
}
