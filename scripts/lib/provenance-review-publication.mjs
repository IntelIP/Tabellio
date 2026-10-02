import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { runExternalCommand } from "./external-command.mjs";
import { runGit } from "./git-process.mjs";
import { assertExternalStateRoot } from "./external-state-root.mjs";
import { contract } from "./contract-checks.mjs";
import { digestObject } from "./stack-operation.mjs";
import { validateOperationApproval } from "./approval-validation.mjs";
import { captureCandidate, candidateIdentity } from "./provenance-ledger.mjs";
import { buildProvenanceReviewResult } from "./provenance-review-result.mjs";
import { GitJsonLedger } from "./git-json-ledger.mjs";
import { effectiveGitHubRepository } from "./github-repository.mjs";
import { NativeGitStore } from "../providers/native-git-store.mjs";

const INTENT = "tabellio-provenance-status-intent/v0.1";
const APPROVAL = "tabellio-provenance-status-approval/v0.1";
const FAILED_DELIVERY = "Publication failed or became uncertain. Inspect GitHub statuses and the stored receipt before authorizing another attempt.";

export function createProvenanceStatusIntent(lineage, options) {
  const result = buildProvenanceReviewResult(lineage, options);
  if (result.github.length !== 2) throw new Error("A GitHub repository identity is required.");
  const unsigned = { schemaVersion: INTENT, createdAt: result.evaluatedAt, candidate: result.currentCandidate, lineageDigest: lineage.digest, reportUrl: options.reportUrl ?? null, reservationRemote: reservationAuthority(options), statuses: result.github };
  return { ...unsigned, integrity: { algorithm: "sha256", digest: digestObject(unsigned) } };
}

// The authority is part of the approval-bound intent: approval cannot be moved to a
// fresh per-clone store after an uncertain publication. All publishing clones
// must use the same customer-owned authority; local storage is not distributed.
function reservationAuthority(options) {
  const path = options.publicationStore ?? process.env.TABELLIO_PUBLICATION_STORE;
  if (path !== undefined) {
    if (typeof path !== "string" || !isAbsolute(path)) throw new Error("Publication store must be an existing absolute path to a customer-owned bare Git repository.");
    return `local:${realpathSync(path)}`;
  }
  const authority = options.reservationRemote ?? "local";
  validateReservationAuthority(authority);
  return authority;
}

function validateReservationAuthority(authority) {
  if (authority === "control" || authority === "local") return;
  if (typeof authority !== "string" || !authority.startsWith("local:") || !isAbsolute(authority.slice(6)) || /[\0-\x1f]/.test(authority)) {
    throw new Error("Reservation authority must be local, an absolute local store, or the explicitly selected control remote.");
  }
}

async function localReservationLedger(repo, authority, ref) {
  if (authority === "local") throw new Error("Configure TABELLIO_PUBLICATION_STORE to an existing customer-owned bare Git repository shared by every publishing process before approving publication.");
  const path = authority.slice(6);
  if (realpathSync(path) !== path) throw new Error("Publication authority path changed; create and approve a new intent.");
  const bare = await runGit({ cwd: path, args: ["rev-parse", "--is-bare-repository"] });
  if (bare.stdout.trim() !== "true") throw new Error("Publication authority must be a separate bare Git repository, not the public code checkout or its .git directory.");
  const codeCommon = await runGit({ cwd: repo, args: ["rev-parse", "--path-format=absolute", "--git-common-dir"] });
  if (realpathSync(codeCommon.stdout.trim()) === path) throw new Error("Publication authority must be separate from the public code repository.");
  assertExternalStateRoot(realpathSync(repo), path, "Publication authority");
  assertExternalStateRoot(realpathSync(codeCommon.stdout.trim()), path, "Publication authority");
  return GitJsonLedger.open({ repoPath: path, ref });
}

function validateIntent(value) {
  contract.object(value, "intent");
  contract.exactKeys(value, ["schemaVersion", "createdAt", "candidate", "lineageDigest", "reportUrl", "reservationRemote", "statuses", "integrity"], "intent");
  contract.equals(value.schemaVersion, INTENT, "intent.schemaVersion");
  validateReservationAuthority(value.reservationRemote);
  contract.date(value.createdAt, "intent.createdAt");
  contract.sha256(value.lineageDigest, "intent.lineageDigest");
  contract.equals(digestObject(value.candidate), digestObject(candidateIdentity(value.candidate)), "intent.candidate");
  contract.object(value.integrity, "intent.integrity");
  contract.exactKeys(value.integrity, ["algorithm", "digest"], "intent.integrity");
  contract.equals(value.integrity.algorithm, "sha256", "intent.integrity.algorithm");
  const { integrity, ...unsigned } = value;
  contract.equals(integrity.digest, digestObject(unsigned), "intent.integrity.digest");
  return value;
}

async function assertCurrent(repo, intent, base, head) {
  const actual = await captureCandidate({ repo, projectKey: intent.candidate.projectKey, repositoryId: intent.candidate.repositoryId, base, head });
  contract.equals(actual.id, intent.candidate.id, "current candidate");
  return actual;
}

function checkedResponse(response, expected) {
  for (const key of ["commit", "state", "context", "description", "targetUrl"]) contract.equals(response[key], expected[key], `published.${key}`);
  if ((typeof response.id !== "string" && !Number.isSafeInteger(response.id)) || !/^[1-9][0-9]{0,19}$/.test(String(response.id))) throw new Error("Invalid published status ID.");
  return { id: String(response.id), commit: response.commit, state: response.state, context: response.context };
}

async function sendStatuses({ repo, intent, base, head, publisher }) {
  const published = [];
  try {
    for (const expected of intent.statuses) {
      await assertCurrent(repo, intent, base, head);
      const response = checkedResponse(await publisher.publish(expected), expected);
      if (published.some(item => item.id === response.id)) throw new Error("Duplicate published status ID.");
      published.push(response);
    }
    await assertCurrent(repo, intent, base, head);
    return { status: "published", published };
  } catch {
    return { status: "blocked", published, reason: FAILED_DELIVERY };
  }
}

function validateStoredReceipt(receipt, intent, approval, now) {
  contract.object(receipt, "receipt");
  contract.member(receipt.status, ["pending", "blocked", "published"], "receipt.status");
  contract.exactKeys(receipt, ["schemaVersion", "approvalId", "reservationId", "intentDigest", "candidateId", "attemptedAt", "status", "published", ...(receipt.status === "blocked" ? ["reason"] : [])], "receipt");
  contract.equals(receipt.schemaVersion, "tabellio-provenance-status-receipt/v0.1", "receipt.schemaVersion");
  contract.equals(receipt.approvalId, approval.id, "receipt.approvalId");
  contract.string(receipt.reservationId, "receipt.reservationId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(receipt.reservationId)) throw new Error("Invalid receipt reservation ID.");
  contract.equals(receipt.intentDigest, intent.integrity.digest, "receipt.intentDigest");
  contract.equals(receipt.candidateId, intent.candidate.id, "receipt.candidateId");
  contract.date(receipt.attemptedAt, "receipt.attemptedAt");
  const attemptedAt = Date.parse(receipt.attemptedAt);
  if (attemptedAt < Date.parse(approval.approvedAt) || attemptedAt > Date.parse(approval.expiresAt) || attemptedAt > Date.parse(now)) throw new Error("Receipt attempt is outside the approval window.");
  if (!Array.isArray(receipt.published) || receipt.published.length > intent.statuses.length) throw new Error("Invalid receipt status records.");
  if (receipt.status === "published") contract.equals(receipt.published.length, intent.statuses.length, "receipt.published count");
  if (receipt.status === "pending") contract.equals(receipt.published.length, 0, "pending receipt count");
  if (receipt.status === "blocked") contract.equals(receipt.reason, FAILED_DELIVERY, "receipt.reason");
  const ids = new Set();
  for (const [index, published] of receipt.published.entries()) {
    contract.object(published, "receipt.published");
    contract.exactKeys(published, ["id", "commit", "state", "context"], "receipt.published");
    if (typeof published.id !== "string" || !/^[1-9][0-9]{0,19}$/.test(published.id) || ids.has(published.id)) throw new Error("Invalid receipt status ID.");
    ids.add(published.id);
    for (const key of ["commit", "state", "context"]) contract.equals(published[key], intent.statuses[index][key], `receipt.published.${key}`);
  }
  return receipt;
}

export async function verifyPrivateControl({ repo, remote = "control", commandRunner = runExternalCommand }) {
  const store = await NativeGitStore.open(repo);
  const [origin, control] = await Promise.all([effectiveGitHubRepository(store, "origin"), effectiveGitHubRepository(store, remote)]);
  if (origin.key === control.key) throw new Error("Control state must use a separate private repository.");
  const response = await commandRunner({ binary: "gh", args: ["repo", "view", `https://github.com/${control.fullName}`, "--json", "nameWithOwner,isPrivate"], cwd: repo, timeoutMs: 30000 });
  const metadata = JSON.parse(response.stdout);
  if (metadata.isPrivate !== true || String(metadata.nameWithOwner).toLowerCase() !== control.key) throw new Error("Control repository identity and private visibility must be verified.");
  return control.key;
}

async function synchronizeReservation({ local, repo, remote, ref, version, expectedVersion, controlVerifier, controlKey }) {
  if (local) return true;
  try {
    contract.equals(await controlVerifier({ repo, remote }), controlKey, "control repository before push");
    await runGit({ cwd: repo, args: ["push", `--force-with-lease=${ref}:${expectedVersion}`, remote, `${version}:${ref}`] });
    return true;
  } catch {
    return false;
  }
}

export async function publishProvenanceStatuses({ repo, lineage, intent, approval, publisher, now, base = "main", head = "HEAD", controlVerifier = verifyPrivateControl }) {
  contract.date(now, "publication time");
  validateOperationApproval(approval, intent, { schemaVersion: APPROVAL, validateIntent, now: new Date(now) });
  if (Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt) > 3600000) throw new Error("Status approval must expire within one hour.");
  const candidate = await assertCurrent(repo, intent, base, head);
  contract.equals(lineage.digest, intent.lineageDigest, "lineage digest");
  const result = buildProvenanceReviewResult(lineage, { candidate, now, reportUrl: intent.reportUrl });
  contract.equals(digestObject(result.github), digestObject(intent.statuses), "current status representation");
  const store = await NativeGitStore.open(repo);
  const remote = await effectiveGitHubRepository(store, "origin");
  const target = `${intent.statuses[0].owner}/${intent.statuses[0].repo}`.toLowerCase();
  contract.equals(remote.key, target, "GitHub origin identity");
  const local = intent.reservationRemote !== "control";
  const controlKey = local ? null : await controlVerifier({ repo, remote: intent.reservationRemote });
  const ref = `refs/tabellio/provenance-status-reservations/${digestObject({ approvalId: approval.id })}`;
  const ledger = local ? await localReservationLedger(store.repoPath, intent.reservationRemote, `refs/tabellio/provenance-status-reservations/${digestObject({ repository: remote.key, approvalId: approval.id })}`) : await GitJsonLedger.open({ repoPath: repo, ref });
  const path = "receipt.json";
  const remoteVersion = local ? "" : (await runGit({ cwd: repo, args: ["ls-remote", "--refs", intent.reservationRemote, ref] })).stdout.trim().split(/\s+/)[0];
  let prior = await ledger.read(path);
  if (remoteVersion) {
    await runGit({ cwd: repo, args: ["fetch", "--no-write-fetch-head", intent.reservationRemote, ref] });
    const stored = await runGit({ cwd: repo, args: ["show", `${remoteVersion}:${path}`] });
    try { prior = { value: JSON.parse(stored.stdout), version: remoteVersion }; }
    catch { throw new Error("Invalid stored publication receipt JSON."); }
  }
  if (prior.value !== null) {
    validateStoredReceipt(prior.value, intent, approval, now);
    if (prior.value.status !== "pending") return prior.value;
    return { ...prior.value, status: "blocked", reason: "An earlier attempt is unresolved. Inspect GitHub before authorizing another attempt." };
  }
  // Git update-ref CAS reserves one publisher at the shared authority before
  // delivery. A pending receipt is durable and never automatically retried.
  // Remote mode additionally uses receive-side CAS across independent clones.
  const receipt = { schemaVersion: "tabellio-provenance-status-receipt/v0.1", approvalId: approval.id, reservationId: randomUUID(), intentDigest: intent.integrity.digest, candidateId: candidate.id, attemptedAt: now, status: "pending", published: [] };
  const attempt = await ledger.write(path, receipt, { expectedVersion: prior.version });
  const synchronization = { local, repo, remote: intent.reservationRemote, ref, controlVerifier, controlKey };
  if (!await synchronizeReservation({ ...synchronization, version: attempt.version, expectedVersion: "" })) {
    throw new Error("Approval reservation failed or is uncertain. Inspect the control remote before a new approval.");
  }
  const completed = { ...receipt, ...await sendStatuses({ repo, intent, base, head, publisher }) };
  const finished = await ledger.write(path, completed, { expectedVersion: attempt.version });
  if (!await synchronizeReservation({ ...synchronization, version: finished.version, expectedVersion: attempt.version })) {
    return { ...completed, status: "blocked", reason: "Delivery receipt synchronization is uncertain. Inspect GitHub and the control remote; do not retry." };
  }
  return completed;
}
