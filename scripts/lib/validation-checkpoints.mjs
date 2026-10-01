import { EntireLedgerProvider } from "../providers/entire-ledger-provider.mjs";
import { validateLedgerSnapshot } from "./ledger-provider.mjs";
import { runGit } from "./git-process.mjs";

export async function captureValidationCheckpoints(repoPath, repositoryId, revision, ids) {
  if (ids.some(id => !/^[0-9a-f]{12}$/.test(id))) throw new Error("Invalid Entire checkpoint trailer ID.");
  const provider = await EntireLedgerProvider.open(repoPath);
  const evidence = await provider.snapshot({ repositoryId, baseRevision: revision.mergeBase, headRevision: revision.headCommit });
  validateCheckpointEvidence(evidence, repositoryId, revision, ids);
  await verifyCheckpointBindings(repoPath, evidence);
  return evidence;
}

export function validateCheckpointEvidence(evidence, repositoryId, revision, ids) {
  validateLedgerSnapshot(evidence);
  if (evidence.provider.id !== "entire" || evidence.repository.id !== repositoryId
    || evidence.range.baseCommit !== revision.mergeBase || evidence.range.headCommit !== revision.headCommit) throw new Error("Checkpoint evidence scope mismatch.");
  const actual = evidence.checkpoints.map(item => item.id).sort();
  if (!actual.length || JSON.stringify(actual) !== JSON.stringify([...ids].sort())) throw new Error("Checkpoint evidence IDs mismatch.");
  evidence.checkpoints.forEach(validateCompleteCheckpoint);
}

function validateCompleteCheckpoint(checkpoint) {
  if (!/^[0-9a-f]{12}$/.test(checkpoint.id) || checkpoint.partial || !checkpoint.commits.length || !checkpoint.sessions.length) {
    throw new Error("Checkpoint metadata is incomplete.");
  }
  if (checkpoint.sessions.some(session => !session.id || session.error)) throw new Error("Checkpoint metadata is incomplete.");
}

// This verifies Git trailer associations, NOT independently authenticated capture.
// Entire v0.7.7 exports no commit binding; copying an existing ID is not detected.
export async function verifyCheckpointBindings(repoPath, evidence) {
  const expected = await checkpointTrailerAssociations(repoPath, evidence.range);
  if (expected.size !== evidence.checkpoints.length) throw new Error("Checkpoint evidence source IDs mismatch.");
  for (const checkpoint of evidence.checkpoints) {
    const commits = [...(expected.get(checkpoint.id) ?? [])].sort();
    if (JSON.stringify(commits) !== JSON.stringify([...checkpoint.commits].sort())) throw new Error("Checkpoint evidence commit trailer mismatch.");
  }
}

async function checkpointTrailerAssociations(repoPath, range) {
  const result = await runGit({ cwd: repoPath, args: ["rev-list", `${range.baseCommit}..${range.headCommit}`, "--"] });
  const expected = new Map();
  for (const commit of result.stdout.trim().split(/\s+/).filter(Boolean)) {
    const message = await runGit({ cwd: repoPath, args: ["show", "-s", "--format=%(trailers:key=Entire-Checkpoint,valueonly)", commit, "--"] });
    for (const id of message.stdout.split(/\s+/).filter(Boolean)) {
      const commits = expected.get(id) ?? new Set();
      commits.add(commit);
      expected.set(id, commits);
    }
  }
  return expected;
}
