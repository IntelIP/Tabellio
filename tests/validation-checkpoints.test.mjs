import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { ValidationRunner, latestValidationResult, validateValidationResult } from "../scripts/lib/validation-runner.mjs";
import { digestObject } from "../scripts/lib/stack-operation.mjs";
import { NativeGitStore } from "../scripts/providers/native-git-store.mjs";
import { GitJsonLedger } from "../scripts/lib/git-json-ledger.mjs";
import { runGit } from "../scripts/lib/git-process.mjs";
import { createFeatureFixture, identityEnv } from "./helpers/git-fixture.mjs";
import { installEntireFixture, fixtureCheckpoint } from "./helpers/entire-fixture.mjs";

// Every checkpoint and executable below is an explicitly synthetic fixture.
test("synthetic metadata fixture: required gate resolves complete checkpoint evidence before commands", async t => {
  const fixture = await createFeatureFixture(t);
  const { metadataPath } = await installEntireFixture(t, fixture.root);
  const id = "abcdef123456";
  const marker = join(fixture.root, "command-ran");
  const manifest = { schemaVersion: "tabellio-validation/v0.1", id: "checkpoint-test", failFast: true, requireEntireCheckpoint: true, commands: [{ id: "pass", argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran')`], cwd: ".", timeoutMs: 1000, required: true }] };
  await writeFile(join(fixture.seed, "tabellio.validation.json"), JSON.stringify(manifest));
  await runGit({ cwd: fixture.seed, args: ["add", "tabellio.validation.json"] });
  await runGit({ cwd: fixture.seed, args: ["commit", "-m", "Synthetic checkpoint claim", "-m", `Entire-Checkpoint: ${id}`], env: identityEnv() });
  const store = await NativeGitStore.open(fixture.seed);
  const ledger = await GitJsonLedger.open({ repoPath: fixture.seed, ref: "refs/tabellio/validations" });
  const runner = new ValidationRunner({ store, ledger });
  const options = { repositoryId: "example/repository", commit: "HEAD", base: "main" };
  for (const [label, entries] of [
    ["missing", {}],
    ["partial", { [id]: { ...fixtureCheckpoint(id), partial: true } }],
    ["wrong-ID", { [id]: fixtureCheckpoint("123456abcdef") }],
    ["empty sessions", { [id]: { checkpoint_id: id, session_count: 0, sessions: [] } }],
    ["session error without partial flag", { [id]: { checkpoint_id: id, session_count: 1, sessions: [{ session_id: "synthetic", error: "missing" }] } }],
  ]) {
    await t.test(label, async () => {
      await writeFile(metadataPath, JSON.stringify(entries));
      await assert.rejects(runner.run(options));
      assert.equal((await ledger.list()).paths.length, 0);
      assert.equal(await stat(marker).catch(error => error.code), "ENOENT");
    });
  }
  await t.test("malformed trailer", async () => {
    await runGit({ cwd: fixture.seed, args: ["commit", "--amend", "-m", "Synthetic malformed trailer", "-m", "Entire-Checkpoint: not-a-checkpoint"], env: identityEnv() });
    await assert.rejects(runner.run(options), /Invalid Entire checkpoint trailer ID/);
    await runGit({ cwd: fixture.seed, args: ["commit", "--amend", "-m", "Synthetic checkpoint claim", "-m", `Entire-Checkpoint: ${id}`], env: identityEnv() });
  });
  await writeFile(metadataPath, JSON.stringify({ [id]: fixtureCheckpoint(id) }));
  const valid = await runner.run(options);
  assert.equal(valid.result.status, "passed");
  assert.equal(valid.result.checkpointEvidence.provider.version, "0.7.7");
  assert.equal(valid.result.checkpointEvidence.checkpoints[0].commits[0], valid.result.revision.headCommit);
  assert.equal((await latestValidationResult(ledger, valid.result.revision.headCommit)).runId, valid.result.runId);
  // Wrong-commit here means corrupted stored Git association, not a nonexistent
  // independent commit field in Entire's metadata export.
  const wrongCommit = structuredClone(valid.result);
  wrongCommit.checkpointEvidence.checkpoints[0].commits = [fixture.mainCommit];
  resign(wrongCommit);
  await ledger.write(valid.path, wrongCommit, { expectedVersion: await ledger.version() });
  assert.equal(await latestValidationResult(ledger, valid.result.revision.headCommit), null);
  const legacy = structuredClone(valid.result);
  legacy.schemaVersion = "tabellio-validation-result/v0.2";
  delete legacy.kind;
  delete legacy.checkpointEvidence;
  legacy.runner = { id: legacy.runner.id, runtime: legacy.runner.runtime };
  resign(legacy);
  validateValidationResult(legacy); // Still readable for history, not eligible.
  await ledger.write(valid.path, legacy, { expectedVersion: await ledger.version() });
  assert.equal(await latestValidationResult(ledger, valid.result.revision.headCommit), null);
});

function resign(result) {
  const { integrity: _integrity, ...unsigned } = result;
  result.integrity.digest = digestObject(unsigned);
}
