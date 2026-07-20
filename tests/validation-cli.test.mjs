import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { runGit } from "../scripts/lib/git-process.mjs";
import { createFeatureFixture, identityEnv } from "./helpers/git-fixture.mjs";

const execFileAsync = promisify(execFile);

test("validation gate exits zero only for a passed exact-head result", async (t) => {
  const fixture = await createFeatureFixture(t);
  const workspaceRoot = join(fixture.root, "ValidationRoot");
  await mkdir(workspaceRoot);

  await commitManifest(fixture.seed, manifest([process.execPath, "-e", "process.exit(0)"]), "passing gate");
  const passed = await runGate(fixture.seed, "refs/tabellio/cli-pass", workspaceRoot);
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.output.result.status, "passed");
  assert.deepEqual(await readdir(workspaceRoot), []);

  await commitManifest(fixture.seed, manifest([process.execPath, "-e", "process.exit(3)"]), "failing gate");
  const failed = await runGate(fixture.seed, "refs/tabellio/cli-fail", workspaceRoot);
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.output.result.status, "failed");
  assert.deepEqual(await readdir(workspaceRoot), []);
});

async function commitManifest(repo, value, message) {
  await writeFile(`${repo}/tabellio.validation.json`, `${JSON.stringify(value, null, 2)}\n`);
  await runGit({ args: ["add", "tabellio.validation.json"], cwd: repo });
  await runGit({ args: ["commit", "-m", message], cwd: repo, env: identityEnv() });
}

async function runGate(repo, ledgerRef, workspaceRoot) {
  const args = [
    "scripts/tabellio-validate.mjs",
    "gate",
    "--repo", repo,
    "--repo-id", "example/repository",
    "--base", "main",
    "--commit", "HEAD",
    "--manifest", "tabellio.validation.json",
    "--ledger-ref", ledgerRef,
    "--workspace-root", workspaceRoot,
  ];
  try {
    const result = await execFileAsync(process.execPath, args, { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    return { exitCode: 0, output: JSON.parse(result.stdout) };
  } catch (error) {
    return { exitCode: error.code, output: JSON.parse(error.stdout) };
  }
}

function manifest(argv) {
  return {
    schemaVersion: "tabellio-validation/v0.1",
    id: "cli-gate",
    failFast: true,
    requireEntireCheckpoint: false,
    commands: [
      {
        id: "gate-command",
        argv,
        cwd: ".",
        timeoutMs: 30_000,
        required: true,
      },
    ],
  };
}
