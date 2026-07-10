import { resolve } from "node:path";

import { readContextPacket } from "./lib/context-packet.mjs";

const args = parseArgs(process.argv.slice(2));
const contextPath = resolve(args.context ?? "tabellio-context.json");
const blockers = [];
let packet = null;

try {
  packet = await readContextPacket(contextPath);
} catch (error) {
  blockers.push(error instanceof Error ? error.message : String(error));
}

const result = {
  ok: blockers.length === 0,
  status: blockers.length === 0 ? "tabellio_context_ready" : "blocked",
  checkedAt: new Date().toISOString(),
  contextPath,
  schemaPath: "schemas/context-packet.schema.json",
  summary: packet ? {
    schemaVersion: packet.schemaVersion,
    runId: packet.runId,
    repository: packet.repository.id,
    baseCommit: packet.refs.base.commit,
    headCommit: packet.refs.head.commit,
    changedFileCount: packet.changeSet.files.length,
    mergeClean: packet.mergePreview.clean,
  } : null,
  blockers,
};

if (!result.ok) process.exitCode = 1;
console.log(JSON.stringify(result, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--context") throw new Error(`Unknown argument: ${argv[index]}`);
    parsed.context = argv[++index];
  }
  return parsed;
}
