import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import { createContextPacket, validateContextPacket } from "../scripts/lib/context-packet.mjs";
import { createFixture } from "./helpers/git-fixture.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = new URL("../", import.meta.url).pathname;

test("context integrity rejects tampering", () => {
  const oid = "a".repeat(40);
  const packet = createContextPacket({
    runId: "run-1",
    repository: { id: "example/repository", storage: "native-git" },
    actor: { type: "agent", id: "codex" },
    task: { summary: "test context" },
    refs: {
      base: { name: "main", commit: oid },
      head: { name: "feature", commit: oid },
      mergeBase: { name: "merge-base", commit: oid },
    },
    changeSet: { files: [] },
    mergePreview: { clean: true, tree: oid, conflictFiles: [] },
  });
  validateContextPacket(packet);
  packet.task.summary = "tampered";
  assert.throws(() => validateContextPacket(packet), /does not match/);
  assert.throws(
    () => createContextPacket({
      ...packet,
      repository: { id: "/private/repository.git", storage: "native-git" },
    }),
    /must not expose a local filesystem path/,
  );
});

test("capture CLI binds native Git context into evidence", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const contextPath = `${fixture.root}/context.json`;
  const evidencePath = `${fixture.root}/evidence.json`;

  await runNode("scripts/capture-tabellio-context.mjs", [
    "--repo", fixture.bare,
    "--repo-id", "example/native-repository",
    "--base", "refs/heads/main",
    "--head", "refs/heads/feature",
    "--run-id", "run-context-1",
    "--task-summary", "prove native Git binding",
    "--out", contextPath,
  ]);
  const contextCheck = await runNode("scripts/check-tabellio-context.mjs", ["--context", contextPath]);
  assert.equal(JSON.parse(contextCheck.stdout).ok, true);

  await runNode("scripts/write-tabellio-evidence-envelope.mjs", [
    "--context", contextPath,
    "--out", evidencePath,
  ]);
  const evidenceCheck = await runNode("scripts/check-tabellio-evidence-envelope.mjs", ["--evidence", evidencePath]);
  assert.equal(JSON.parse(evidenceCheck.stdout).ok, true);

  const context = JSON.parse(await readFile(contextPath, "utf8"));
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(evidence.repo, "example/native-repository");
  assert.equal(evidence.git.sha, context.refs.head.commit);
  assert.equal(evidence.context.digest, context.integrity.digest);
  assert.deepEqual(evidence.changedFiles, ["README.md"]);
});

test("policy checks reject omitted approval booleans", async (t) => {
  const fixturePath = `${projectRoot}/examples/tabellio-evidence/minimal-evidence.json`;
  const evidence = JSON.parse(await readFile(fixturePath, "utf8"));
  delete evidence.externalActionPolicy.actionClasses[0].approved;
  const path = `${projectRoot}/.tmp-invalid-policy-${process.pid}.json`;
  t.after(() => rm(path, { force: true }));
  await writeFile(path, JSON.stringify(evidence));

  await assert.rejects(
    runNode("scripts/check-tabellio-evidence-envelope.mjs", ["--evidence", path]),
    (error) => {
      const output = JSON.parse(error.stdout);
      return output.blockers.some((blocker) => blocker.includes(".approved must be a boolean"));
    },
  );
});

async function runNode(script, args) {
  return execFileAsync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, USER: "tabellio-test" },
  });
}
