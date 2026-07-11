import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runGit } from "../scripts/lib/git-process.mjs";
import { withOperationLock } from "../scripts/lib/operation-lock.mjs";

const lockRef = "refs/tabellio/locks/test-operation";

test("operation lock blocks a live owner and releases after completion", async (t) => {
  const fixture = await createFixture(t);
  let release;
  const held = lock(fixture, () => new Promise((resolve) => { release = resolve; }));
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(lock(fixture, async () => {}), /Another test operation is active/);
  release("done");
  assert.equal(await held, "done");
  assert.equal(await currentLock(fixture.repo), null);
});

test("operation lock recovers a dead process owner", async (t) => {
  const fixture = await createFixture(t);
  await installLock(fixture, deadOwner());
  assert.equal(await lock(fixture, async () => "recovered"), "recovered");
  assert.equal(await currentLock(fixture.repo), null);
});

test("concurrent stale-lock recovery produces one owner", async (t) => {
  const fixture = await createFixture(t);
  await installLock(fixture, deadOwner());
  let release;
  const statuses = ["pending", "pending"];
  const reasons = [null, null];
  const attempts = [0, 1].map((index) => lock(
    fixture,
    () => new Promise((resolve) => { release = resolve; }),
  ).then(
    () => { statuses[index] = "fulfilled"; },
    (error) => { statuses[index] = "rejected"; reasons[index] = error; },
  ));
  while (!release || !statuses.includes("rejected")) await new Promise((resolve) => setImmediate(resolve));
  assert.match(reasons[statuses.indexOf("rejected")].message, /Another test operation/);
  release("winner");
  await Promise.all(attempts);
  assert.deepEqual(statuses.sort(), ["fulfilled", "rejected"].sort());
});

test("operation lock recovers repeatedly without a secondary recovery gate", async (t) => {
  const fixture = await createFixture(t);
  await installLock(fixture, deadOwner());
  await lock(fixture, async () => {});
  await installLock(fixture, deadOwner());
  await lock(fixture, async () => {});
  assert.equal(await currentLock(fixture.repo), null);
});

test("operation lock never steals a valid owner from another host", async (t) => {
  const fixture = await createFixture(t);
  await installLock(fixture, { ...deadOwner(), hostname: `${hostname()}-other` });
  await assert.rejects(lock(fixture, async () => {}), /Another test operation is active/);
});

test("operation lock release never removes a replacement owner", async (t) => {
  const fixture = await createFixture(t);
  let replacementOid;
  await lock(fixture, async () => {
    replacementOid = await writeOwner(fixture, { ...deadOwner(), nonce: "replacement" });
    const current = await currentLock(fixture.repo);
    await runGit({ args: ["update-ref", lockRef, replacementOid, current], cwd: fixture.repo });
  });
  assert.equal(await currentLock(fixture.repo), replacementOid);
});

function lock(fixture, action) {
  return withOperationLock({
    repoPath: fixture.repo,
    stateRoot: fixture.state,
    lockName: "test-operation",
    label: "test operation",
  }, action);
}

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "tabellio-operation-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const state = join(root, "state");
  await mkdir(repo);
  await runGit({ args: ["init", "--quiet"], cwd: repo });
  return { root, repo, state };
}

function deadOwner() {
  return {
    schemaVersion: "tabellio-operation-lock/v0.1",
    nonce: "dead-owner",
    pid: 2_147_483_647,
    hostname: hostname(),
    label: "test operation",
    createdAt: "2026-07-10T00:00:00.000Z",
  };
}

async function installLock(fixture, owner) {
  const oid = await writeOwner(fixture, owner);
  await runGit({ args: ["update-ref", lockRef, oid], cwd: fixture.repo });
  return oid;
}

async function writeOwner(fixture, owner) {
  const path = join(fixture.root, `owner-${owner.nonce}-${Math.random()}.json`);
  await writeFile(path, `${JSON.stringify(owner)}\n`);
  return (await runGit({ args: ["hash-object", "-w", path], cwd: fixture.repo })).stdout.trim();
}

async function currentLock(repo) {
  const result = await runGit({
    args: ["rev-parse", "--verify", "--end-of-options", lockRef],
    cwd: repo,
    acceptableExitCodes: [0, 1, 128],
  });
  return result.exitCode === 0 ? result.stdout.trim() : null;
}
