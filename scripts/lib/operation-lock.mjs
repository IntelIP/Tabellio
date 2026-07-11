import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

import { runGit } from "./git-process.mjs";

const MAX_ACQUIRE_ATTEMPTS = 5;

export async function withOperationLock({ repoPath, stateRoot, lockName, label }, action) {
  if (typeof action !== "function") throw new TypeError("action must be a function.");
  if (typeof label !== "string" || label.trim() === "") throw new TypeError("label must be a non-empty string.");
  if (typeof lockName !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(lockName)) throw new TypeError("lockName must be a safe lowercase name.");
  await mkdir(stateRoot, { recursive: true });
  const lockRef = `refs/tabellio/locks/${lockName}`;
  const owner = {
    schemaVersion: "tabellio-operation-lock/v0.1",
    nonce: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    label,
    createdAt: new Date().toISOString(),
  };
  const ownerOid = await writeOwnerBlob(repoPath, stateRoot, owner);
  const zeroOid = "0".repeat(ownerOid.length);
  let acquired = false;
  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS && !acquired; attempt += 1) {
    if (await updateLockRef(repoPath, lockRef, ownerOid, zeroOid)) {
      acquired = true;
      break;
    }
    const currentOid = await readLockOid(repoPath, lockRef);
    if (currentOid === null) continue;
    const currentOwner = await readOwnerBlob(repoPath, currentOid);
    if (!staleOwner(currentOwner)) throw new Error(`Another ${label} is active.`);
    await deleteLockRef(repoPath, lockRef, currentOid);
  }
  if (!acquired) throw new Error(`Unable to acquire ${label} lock after stale-lock recovery.`);
  try {
    return await action();
  } finally {
    await deleteLockRef(repoPath, lockRef, ownerOid);
  }
}

async function writeOwnerBlob(repoPath, stateRoot, owner) {
  const path = join(stateRoot, `.lock-owner-${owner.nonce}.json`);
  await writeFile(path, `${JSON.stringify(owner)}\n`, { flag: "wx", mode: 0o600 });
  try {
    const result = await runGit({ args: ["hash-object", "-w", path], cwd: repoPath });
    const oid = result.stdout.trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid)) throw new Error("Git returned an invalid operation-lock object ID.");
    return oid;
  } finally {
    await rm(path, { force: true });
  }
}

async function readOwnerBlob(repoPath, oid) {
  const result = await runGit({ args: ["cat-file", "blob", oid], cwd: repoPath, acceptableExitCodes: [0, 128] });
  if (result.exitCode !== 0) throw new Error("Operation lock points to an unreadable owner object.");
  try {
    const owner = JSON.parse(result.stdout);
    if (typeof owner !== "object" || owner === null) throw new Error();
    return owner;
  } catch {
    throw new Error("Operation lock points to invalid owner metadata.");
  }
}

function staleOwner(owner) {
  if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.hostname !== "string" || owner.hostname === "") return false;
  if (owner.hostname !== hostname()) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    if (error?.code === "ESRCH") return true;
    throw error;
  }
}

async function readLockOid(repoPath, lockRef) {
  const result = await runGit({
    args: ["rev-parse", "--verify", "--end-of-options", lockRef],
    cwd: repoPath,
    acceptableExitCodes: [0, 1, 128],
  });
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function updateLockRef(repoPath, lockRef, newOid, expectedOldOid) {
  const result = await runGit({
    args: ["update-ref", "-m", "tabellio: acquire operation lock", lockRef, newOid, expectedOldOid],
    cwd: repoPath,
    acceptableExitCodes: [0, 1, 128],
  });
  return result.exitCode === 0;
}

async function deleteLockRef(repoPath, lockRef, expectedOid) {
  const result = await runGit({
    args: ["update-ref", "-d", "-m", "tabellio: release operation lock", lockRef, expectedOid],
    cwd: repoPath,
    acceptableExitCodes: [0, 1, 128],
  });
  return result.exitCode === 0;
}
