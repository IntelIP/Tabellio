import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { provenanceDemoFailure } from "../scripts/lib/provenance-demo-failure.mjs";

const execute = promisify(execFile);
const postgresAvailable = spawnSync("initdb", ["--version"]).status === 0;

test("sample PostgreSQL demo works under a long isolated temporary path", { skip: !postgresAvailable }, async () => {
  const root = await mkdtemp(join(tmpdir(), "tabellio-long-tmp-"));
  const nested = join(root, "isolated-validation-home-".repeat(5), "tmp");
  await mkdir(nested, { recursive: true });
  const script = fileURLToPath(new URL("../scripts/demo-provenance.mjs", import.meta.url));
  const result = await execute(process.execPath, [script], {
    env: { ...process.env, TMPDIR: nested }, timeout: 60000, maxBuffer: 1024 * 1024,
  });
  const receipt = JSON.parse(result.stdout);
  // Preserve recovery data if the child could not establish safe cleanup.
  assert.equal(receipt.cleanup, "passed");
  await rm(root, { recursive: true, force: true });
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.checks.postgresServerRestart, "passed");
});


test("demo setup failures are actionable without exposing raw logs", () => {
  const cases = [
    [{ code: "ENOENT", message: "private diagnostic" }, "", "required_tool_missing"],
    [{ code: 1 }, 'could not create Unix socket for address "/private/path": Operation not permitted', "socket_permission_denied"],
    [{ code: 1 }, 'could not create Unix socket for address "/private/path": Permission denied', "socket_permission_denied"],
    [{ code: 1 }, 'Unix-domain socket path "/private/path" is too long', "socket_path_too_long"],
    [null, "private unrelated diagnostic", "local_command_failed"],
  ];
  for (const [error, log, expected] of cases) {
    const result = provenanceDemoFailure(error, log);
    assert.equal(result.failureClass, expected);
    assert.ok(!JSON.stringify(result).includes("private"));
    assert.deepEqual(Object.keys(result).sort(), ["failureClass", "reason"]);
  }
});

test("demo missing prerequisites produce blocked evidence and successful cleanup", async () => {
  const script = fileURLToPath(new URL("../scripts/demo-provenance.mjs", import.meta.url));
  await assert.rejects(execute(process.execPath, [script], {
    env: { ...process.env, PATH: "" }, timeout: 15000,
  }), (error) => {
    assert.equal(error.code, 1);
    const receipt = JSON.parse(error.stdout);
    assert.equal(receipt.status, "blocked");
    assert.equal(receipt.failureClass, "required_tool_missing");
    assert.equal(receipt.cleanup, "passed");
    assert.deepEqual(receipt.failureMatrix, []);
    return true;
  });
});
