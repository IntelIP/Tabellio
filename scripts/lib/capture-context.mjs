import { createHash } from "node:crypto";

import { createContextPacket } from "./context-packet.mjs";
export { localRepositoryId } from "./repository-identity.mjs";

export async function captureContext({
  store,
  baseRevision,
  headRevision,
  baseName = baseRevision,
  headName = headRevision,
  notesRef = "refs/notes/tabellio/context",
  runId,
  repositoryId,
  actor,
  taskSummary,
  createdAt,
  checkpointCommits = [],
  ledgerProvider = null,
  requireLedger = false,
}) {
  const [baseCommit, headCommit, ...frozenCheckpointCommits] = await Promise.all([
    store.resolveRef(baseRevision),
    store.resolveRef(headRevision),
    ...checkpointCommits.map((commit) => store.resolveRef(commit)),
  ]);
  const mergePreview = await store.previewMerge({ base: baseCommit, head: headCommit });
  if (mergePreview.baseCommit !== baseCommit || mergePreview.headCommit !== headCommit) {
    throw new Error("Merge preview did not use the frozen base and head commits.");
  }
  const diff = await store.getDiff(mergePreview.mergeBase, headCommit);
  if (diff.baseCommit !== mergePreview.mergeBase || diff.headCommit !== headCommit) {
    throw new Error("Change set did not use merge-base and the frozen head commit.");
  }

  let checkpoints;
  if (ledgerProvider) {
    const ledger = await ledgerProvider.snapshot({
      repositoryId,
      baseRevision: mergePreview.mergeBase,
      headRevision: headCommit,
      capturedAt: createdAt,
    });
    checkpoints = ledgerProvider.contextReferences(ledger);
  } else {
    const noteCommits = [...new Set([...frozenCheckpointCommits, headCommit])];
    const notes = await Promise.all(noteCommits.map(async (commit) => ({
      commit,
      note: await store.readNote(commit, { notesRef }),
    })));
    checkpoints = notes
      .filter(({ note }) => note !== null)
      .map(({ note, commit }) => checkpointFromNote({ note, notesRef, commit }));
  }
  if (requireLedger && checkpoints.length === 0) {
    throw new Error("Entire checkpoint required: no checkpoint trailers were found between merge-base and head.");
  }

  return createContextPacket({
    runId,
    repository: {
      id: repositoryId,
      storage: "native-git",
    },
    actor,
    task: {
      summary: taskSummary,
    },
    refs: {
      base: { name: baseName, commit: baseCommit },
      head: { name: headName, commit: headCommit },
      mergeBase: { name: "merge-base", commit: mergePreview.mergeBase },
    },
    changeSet: {
      files: diff.files,
    },
    checkpoints,
    mergePreview: {
      clean: mergePreview.clean,
      tree: mergePreview.tree,
      conflictFiles: mergePreview.conflictFiles,
    },
    createdAt,
  });
}

function checkpointFromNote({ note, notesRef, commit }) {
  const checkpoint = {
    ref: notesRef,
    commit,
    digest: createHash("sha256").update(note).digest("hex"),
  };
  try {
    const parsed = JSON.parse(note);
    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      checkpoint.summary = parsed.summary.trim().slice(0, 500);
    }
  } catch {
    // Note content stays private; only its digest is captured.
  }
  return checkpoint;
}
