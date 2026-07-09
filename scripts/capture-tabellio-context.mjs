import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createContextPacket } from "./lib/context-packet.mjs";
import { NativeGitStore } from "./providers/native-git-store.mjs";

const args = parseArgs(process.argv.slice(2));
const repoPath = resolve(args.repo ?? process.cwd());
const outPath = resolve(args.out ?? "tabellio-context.json");
const baseRef = args.base ?? "main";
const headRef = args.head ?? "HEAD";
const notesRef = args.notesRef ?? "refs/notes/tabellio/context";
const store = await NativeGitStore.open(repoPath);

const [diff, mergePreview, note] = await Promise.all([
  store.getDiff(baseRef, headRef),
  store.previewMerge({ base: baseRef, head: headRef }),
  store.readNote(headRef, { notesRef }),
]);

const packet = createContextPacket({
  runId: args.runId ?? `local-${randomUUID()}`,
  repository: {
    id: args.repoId ?? await repositoryId(store),
    storage: "native-git",
  },
  actor: {
    type: args.actorType ?? "agent",
    id: args.actor ?? process.env.USER ?? "local-agent",
  },
  task: {
    summary: args.taskSummary ?? "Context captured from native Git state.",
  },
  refs: {
    base: { name: baseRef, commit: diff.baseCommit },
    head: { name: headRef, commit: diff.headCommit },
    mergeBase: { name: "merge-base", commit: mergePreview.mergeBase },
  },
  changeSet: {
    files: diff.files,
  },
  checkpoints: note ? [checkpointFromNote({ note, notesRef, commit: diff.headCommit })] : [],
  mergePreview: {
    clean: mergePreview.clean,
    tree: mergePreview.tree,
    conflictFiles: mergePreview.conflictFiles,
  },
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(packet, null, 2)}\n`);
console.log(JSON.stringify(packet, null, 2));

async function repositoryId(nativeStore) {
  const remote = await nativeStore.gitConfig("remote.origin.url");
  if (remote) return normalizeRemote(remote);
  return `local/${nativeStore.repoPath.split("/").filter(Boolean).at(-1) ?? "repository"}`;
}

function normalizeRemote(remote) {
  if (remote.includes("://")) {
    try {
      const parsed = new URL(remote);
      if (parsed.protocol === "file:") return hashedRemote(remote);
      return `${parsed.host}${parsed.pathname}`.replace(/^\/+/, "").replace(/\.git$/, "");
    } catch {
      return hashedRemote(remote);
    }
  }
  const scpLike = remote.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  return scpLike ? `${scpLike[1]}/${scpLike[2]}`.replace(/\.git$/, "") : hashedRemote(remote);
}

function hashedRemote(remote) {
  return `remote/${createHash("sha256").update(remote).digest("hex").slice(0, 16)}`;
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

function parseArgs(argv) {
  const parsed = {};
  const aliases = new Map([
    ["--repo", "repo"],
    ["--repo-id", "repoId"],
    ["--base", "base"],
    ["--head", "head"],
    ["--out", "out"],
    ["--run-id", "runId"],
    ["--task-summary", "taskSummary"],
    ["--actor", "actor"],
    ["--actor-type", "actorType"],
    ["--notes-ref", "notesRef"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = aliases.get(argv[index]);
    if (!key) throw new Error(`Unknown argument: ${argv[index]}`);
    const value = argv[++index];
    if (!value) throw new Error(`${argv[index - 1]} requires a value.`);
    parsed[key] = value;
  }
  return parsed;
}
