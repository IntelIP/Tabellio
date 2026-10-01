import { GitJsonLedger } from "../scripts/lib/git-json-ledger.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createFeatureFixture } from "./helpers/git-fixture.mjs";
import { runGit } from "../scripts/lib/git-process.mjs";
import { assembleLineage, captureCandidate } from "../scripts/lib/provenance-ledger.mjs";
import { createProvenanceStatusIntent, publishProvenanceStatuses, verifyPrivateControl } from "../scripts/lib/provenance-review-publication.mjs";
import { sampleObservations } from "../examples/provenance/sample.mjs";
import { digestObject } from "../scripts/lib/stack-operation.mjs";

const now = "2026-09-12T12:00:02Z";
function approval(intent, id = "test-status") {
  return { schemaVersion: "tabellio-provenance-status-approval/v0.1", id, intentDigest: intent.integrity.digest, approved: true, approvedBy: "Synthetic test", approvedAt: now, expiresAt: "2026-09-12T12:01:02Z", reason: "Synthetic publisher only." };
}
async function setup(t, change = () => {}) {
  const fixture = await createFeatureFixture(t);
  const repo = fixture.seed;
  await runGit({ cwd: repo, args: ["remote", "add", "control", fixture.bare] });
  await runGit({ cwd: repo, args: ["update-ref", "refs/tabellio/provenance-statuses", "HEAD"] });
  await runGit({ cwd: repo, args: ["remote", "set-url", "origin", "https://github.com/example/tabellio.git"] });
  const candidate = await captureCandidate({ repo, projectKey: "SAMPLE", repositoryId: "github.com/example/tabellio" });
  const observations = sampleObservations(candidate);
  change(observations);
  const lineage = assembleLineage({ candidate, observations });
  const intent = createProvenanceStatusIntent(lineage, { now, reservationRemote: "control" });
  const calls = [];
  const publisher = { publish: async (request) => { calls.push(request); return { ...request, id: calls.length }; } };
  const controlVerifier = async ({ repo: path }) => {
    for (const mode of [[], ["--push"]]) {
      const url = await runGit({ cwd: path, args: ["remote", "get-url", ...mode, "control"] });
      assert.equal(url.stdout.trim(), fixture.bare);
    }
    return "synthetic-private-control";
  };
  return { repo, lineage, intent, now, publisher, calls, approval: approval(intent), control: fixture.bare, controlVerifier };
}

async function clonePublicationRepo(input, suffix) {
  const second = input.repo + suffix;
  await runGit({ cwd: input.repo, args: ["clone", input.repo, second] });
  await runGit({ cwd: second, args: ["branch", "main", "origin/main"] });
  await runGit({ cwd: second, args: ["remote", "set-url", "origin", "https://github.com/example/tabellio.git"] });
  await runGit({ cwd: second, args: ["remote", "add", "control", input.control] });
  return second;
}

function interruptReceiptSync(input, message) {
  const verifier = input.controlVerifier;
  let reads = 0;
  input.controlVerifier = async options => {
    if (++reads === 3) throw new Error(message);
    return verifier(options);
  };
  return verifier;
}

test("published GitHub statuses match the CLI intent and approval replay sends nothing", async (t) => {
  const input = await setup(t);
  const first = await publishProvenanceStatuses(input);
  assert.equal(first.status, "published");
  assert.deepEqual(input.calls, input.intent.statuses);
  assert.deepEqual(await publishProvenanceStatuses(input), first);
  assert.equal(input.calls.length, 2);
});

test("failed review and blocked security publish distinct non-green states", async (t) => {
  const input = await setup(t, (items) => {
    items.find((item) => item.kind === "review").status = "failed";
    items.find((item) => item.kind === "security").status = "blocked";
  });
  const receipt = await publishProvenanceStatuses(input);
  assert.equal(receipt.status, "published");
  assert.deepEqual(input.calls.map((item) => item.state), ["failure", "error"]);
});

test("expired approval, forged green state, and wrong origin are rejected before publication", async (t) => {
  const input = await setup(t, (items) => { items.find((item) => item.kind === "review").status = "failed"; });
  await assert.rejects(publishProvenanceStatuses({ ...input, now: "2026-09-12T12:02:00Z" }));
  const forged = structuredClone(input.intent);
  forged.statuses[0].state = "success";
  const { integrity: _integrity, ...unsigned } = forged;
  forged.integrity.digest = digestObject(unsigned);
  await assert.rejects(publishProvenanceStatuses({ ...input, intent: forged, approval: approval(forged) }));
  await runGit({ cwd: input.repo, args: ["remote", "set-url", "origin", "https://github.com/example/other.git"] });
  await assert.rejects(publishProvenanceStatuses(input));
  assert.equal(input.calls.length, 0);
});

test("changed head and stale evidence cannot publish an earlier green result", async (t) => {
  const input = await setup(t);
  const later = "2026-09-13T12:00:03Z";
  const active = { ...input.approval, approvedAt: later, expiresAt: "2026-09-13T12:01:03Z" };
  await assert.rejects(publishProvenanceStatuses({ ...input, approval: active, now: later }));
  await runGit({ cwd: input.repo, args: ["switch", "main"] });
  await assert.rejects(publishProvenanceStatuses(input));
  assert.equal(input.calls.length, 0);
});

test("partial provider failure stays blocked and consumed approval never retries", async (t) => {
  const input = await setup(t);
  let count = 0;
  input.publisher = { publish: async (request) => {
    count += 1;
    if (count === 2) throw new Error("private provider response");
    return { ...request, id: count };
  } };
  const receipt = await publishProvenanceStatuses(input);
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.published.length, 1);
  assert.ok(!JSON.stringify(receipt).includes("private provider response"));
  assert.deepEqual(await publishProvenanceStatuses(input), receipt);
  assert.equal(count, 2);
});

test("mismatched provider response cannot upgrade blocked evidence", async (t) => {
  const input = await setup(t, (items) => { items.find((item) => item.kind === "validation").status = "blocked"; });
  input.publisher = { publish: async (request) => ({ ...request, id: 1, state: "success" }) };
  const receipt = await publishProvenanceStatuses(input);
  assert.equal(receipt.status, "blocked");
  assert.deepEqual(receipt.published, []);
});

test("duplicate provider status IDs stay blocked and replay sends nothing", async (t) => {
  const input = await setup(t);
  let calls = 0;
  input.publisher = { publish: async request => {
    calls += 1;
    return { ...request, id: "123" };
  } };
  const receipt = await publishProvenanceStatuses(input);
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.published.length, 1);
  assert.deepEqual(await publishProvenanceStatuses(input), receipt);
  assert.equal(calls, 2);
});

test("candidate movement between statuses stops the second publication", async (t) => {
  const input = await setup(t);
  let count = 0;
  input.publisher = { publish: async (request) => {
    count += 1;
    await runGit({ cwd: input.repo, args: ["switch", "main"] });
    return { ...request, id: count };
  } };
  const receipt = await publishProvenanceStatuses(input);
  assert.equal(receipt.status, "blocked");
  assert.equal(count, 1);
  assert.equal(receipt.published.length, 1);
});

test("concurrent consumers cannot publish twice under one approval", async (t) => {
  const input = await setup(t);
  const results = await Promise.allSettled([publishProvenanceStatuses(input), publishProvenanceStatuses(input)]);
  assert.ok(results.some((item) => item.status === "fulfilled" && item.value.status === "published"));
  assert.equal(input.calls.length, 2);
});


test("shared control reservation prevents duplicate delivery across independent clones", { timeout: 20000 }, async (t) => {
  const input = await setup(t);
  for (const key of ["GIT_AUTHOR_DATE", "GIT_COMMITTER_DATE"]) {
    const before = process.env[key];
    process.env[key] = "2026-09-12T12:00:00Z";
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const second = await clonePublicationRepo(input, "-second");
  const verifier = input.controlVerifier;
  const callsByClone = new Map();
  let waiting = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  input.controlVerifier = async options => {
    const result = await verifier(options);
    const count = (callsByClone.get(options.repo) ?? 0) + 1;
    callsByClone.set(options.repo, count);
    if (count === 2) {
      if (++waiting === 2) release();
      await barrier;
    }
    return result;
  };
  const outcomes = await Promise.allSettled([publishProvenanceStatuses(input), publishProvenanceStatuses({ ...input, repo: second })]);
  const ref = `refs/tabellio/provenance-status-reservations/${digestObject({ approvalId: input.approval.id })}`;
  const localReceipts = await Promise.all([input.repo, second].map(async repoPath => (await (await GitJsonLedger.open({ repoPath, ref })).read("receipt.json")).value));
  assert.notEqual(localReceipts[0].reservationId, localReceipts[1].reservationId);
  assert.ok(outcomes.some(outcome => outcome.status === "fulfilled" && outcome.value.status === "published"));
  assert.equal(input.calls.length, 2);
  const replay = await publishProvenanceStatuses({ ...input, repo: second });
  assert.equal(replay.status, "published");
  assert.equal(input.calls.length, 2);
});


test("missing shared control remote prevents all GitHub writes", async (t) => {
  const input = await setup(t);
  await runGit({ cwd: input.repo, args: ["remote", "remove", "control"] });
  await assert.rejects(publishProvenanceStatuses(input));
  assert.equal(input.calls.length, 0);
});


test("malformed cached receipts cannot claim publication", async (t) => {
  const input = await setup(t);
  const ref = `refs/tabellio/provenance-status-reservations/${digestObject({ approvalId: input.approval.id })}`;
  const ledger = await GitJsonLedger.open({ repoPath: input.repo, ref });
  await ledger.write("receipt.json", { intentDigest: input.intent.integrity.digest, status: "published" }, { expectedVersion: null });
  await assert.rejects(publishProvenanceStatuses(input));
  assert.equal(input.calls.length, 0);
});

test("shared receipts validate complete approval and status bindings", async (t) => {
  const input = await setup(t);
  const valid = await publishProvenanceStatuses(input);
  const ref = `refs/tabellio/provenance-status-reservations/${digestObject({ approvalId: input.approval.id })}`;
  const ledger = await GitJsonLedger.open({ repoPath: input.repo, ref });
  for (const mutate of [
    value => { value.schemaVersion = "unknown"; },
    value => { value.approvalId = "other"; },
    value => { value.reservationId = "invalid"; },
    value => { value.candidateId = "a".repeat(64); },
    value => { value.published.pop(); },
    value => { value.published[0].commit = "a".repeat(40); },
    value => { value.published[0].state = "error"; },
    value => { value.published[0].context = "unrelated"; },
    value => { value.published[0].id = "invalid"; },
    value => { value.published[0].id = "01"; },
    value => { value.published[0].id = "0"; },
    value => { value.published[1].id = value.published[0].id; },
    value => { value.attemptedAt = "2026-09-12T13:00:00Z"; },
    value => { value.extra = "untrusted"; },
  ]) {
    const corrupted = structuredClone(valid);
    mutate(corrupted);
    const before = await ledger.version();
    const next = await ledger.write("receipt.json", corrupted, { expectedVersion: before });
    await runGit({ cwd: input.repo, args: ["push", `--force-with-lease=${ref}:${before}`, "control", `${next.version}:${ref}`] });
    await assert.rejects(publishProvenanceStatuses(input));
    assert.equal(input.calls.length, 2);
  }
});


test("control validation rejects origin aliases, public repositories, and split push URLs", async (t) => {
  const input = await setup(t);
  const setControl = url => runGit({ cwd: input.repo, args: ["remote", "set-url", "control", url] });
  const metadata = async ({args}) => {
    assert.equal(args[2], "https://github.com/example/control");
    return { stdout: JSON.stringify({ nameWithOwner: "example/control", isPrivate: true }) };
  };
  await setControl("https://github.com/example/tabellio.git");
  await assert.rejects(verifyPrivateControl({ repo: input.repo, commandRunner: metadata }), /separate/);
  await setControl("https://github.com/example/control.git");
  await assert.rejects(verifyPrivateControl({ repo: input.repo, commandRunner: async () => ({ stdout: JSON.stringify({ nameWithOwner: "example/control", isPrivate: false }) }) }), /private visibility/);
  await assert.rejects(verifyPrivateControl({ repo: input.repo, commandRunner: async () => ({ stdout: JSON.stringify({ nameWithOwner: "example/other", isPrivate: true }) }) }), /identity/);
  assert.equal(await verifyPrivateControl({ repo: input.repo, commandRunner: metadata }), "example/control");
  await runGit({ cwd: input.repo, args: ["remote", "set-url", "--push", "control", "https://github.com/example/public.git"] });
  await assert.rejects(verifyPrivateControl({ repo: input.repo, commandRunner: metadata }), /different/);
  assert.equal(input.calls.length, 0);
});

test("changed control identity stops reservation before any GitHub write", async (t) => {
  const input = await setup(t);
  let reads = 0;
  await assert.rejects(publishProvenanceStatuses({ ...input, controlVerifier: async () => ++reads === 1 ? "private/original" : "private/changed" }), /reservation failed/);
  assert.equal(input.calls.length, 0);
  const refs = await runGit({ cwd: input.repo, args: ["ls-remote", "--refs", "control", "refs/tabellio/provenance-status-reservations/*"] });
  assert.equal(refs.stdout, "");
});

test("interrupted receipt synchronization keeps remote pending and prevents redelivery", async (t) => {
  const input = await setup(t);
  const verifier = interruptReceiptSync(input, "synthetic control outage after delivery");
  const receipt = await publishProvenanceStatuses(input);
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.published.length, 2);
  assert.match(receipt.reason, /synchronization is uncertain/);
  input.controlVerifier = verifier;
  const replay = await publishProvenanceStatuses(input);
  assert.equal(replay.status, "blocked");
  assert.match(replay.reason, /earlier attempt is unresolved/);
  assert.deepEqual(replay.published, []);
  assert.equal(input.calls.length, 2);
});

test("mixed numeric and string duplicate IDs block replay", async t => {
 const input = await setup(t);
 let count=0;
 input.publisher={publish:async request=>({...request,id:++count===1?123:"123"})};
 const result=await publishProvenanceStatuses(input);
 assert.equal(result.status,"blocked");
 assert.equal(result.published.length,1);
 assert.deepEqual(await publishProvenanceStatuses(input),result);
 assert.equal(count,2);
});
test("fresh clone cannot redeliver after interrupted receipt synchronization", async t => {
 const input=await setup(t);
 const verifier=interruptReceiptSync(input,"synthetic final receipt outage");
 assert.equal((await publishProvenanceStatuses(input)).status,"blocked");
 const second=await clonePublicationRepo(input,"-recovery");
 const ref=`refs/tabellio/provenance-status-reservations/${digestObject({approvalId:input.approval.id})}`;
 const ledger=await GitJsonLedger.open({repoPath:second,ref});
 assert.equal((await ledger.read("receipt.json")).value,null);
 const replay=await publishProvenanceStatuses({...input,repo:second,controlVerifier:verifier});
 assert.equal(replay.status,"blocked");
 assert.match(replay.reason,/earlier attempt is unresolved/);
 assert.equal(input.calls.length,2);
});

test("ambiguous provider IDs block and remain replayable", { concurrency: 2 }, async t => {
  await Promise.all(["0123", "0", 0, -1, Number.MAX_SAFE_INTEGER + 1, {}, 123n].map(id =>
    t.test(String(id), async t => {
      const input = await setup(t);
      let calls = 0;
      input.publisher = { publish: async request => { calls += 1; return { ...request, id }; } };
      const receipt = await publishProvenanceStatuses(input);
      assert.equal(receipt.status, "blocked");
      assert.deepEqual(receipt.published, []);
      assert.deepEqual(await publishProvenanceStatuses(input), receipt);
      assert.equal(calls, 1);
    })
  ));
});

async function localSetup(t) {
  const input = await setup(t);
  await runGit({ cwd: input.repo, args: ["remote", "remove", "control"] });
  input.intent = createProvenanceStatusIntent(input.lineage, { now, publicationStore: input.control });
  input.approval = approval(input.intent);
  input.controlVerifier = async () => { throw new Error("Local publication must never inspect private remote credentials."); };
  return input;
}

test("local customer-owned authority publishes without a control remote and replay sends nothing", async t => {
  const input = await localSetup(t);
  const first = await publishProvenanceStatuses(input);
  assert.equal(first.status, "published");
  assert.deepEqual(await publishProvenanceStatuses(input), first);
  assert.equal(input.calls.length, 2);
});

test("local publication without an explicit authority fails closed before delivery", async t => {
  const input = await localSetup(t);
  input.intent = createProvenanceStatusIntent(input.lineage, { now });
  input.approval = approval(input.intent);
  await assert.rejects(publishProvenanceStatuses(input), /Configure TABELLIO_PUBLICATION_STORE/);
  assert.equal(input.calls.length, 0);
});

async function assertRejectedLocalAuthority(input, publicationStore, reason, overrides = {}) {
  const intent = createProvenanceStatusIntent(input.lineage, { now, publicationStore });
  await assert.rejects(publishProvenanceStatuses({ ...input, ...overrides, intent, approval: approval(intent) }), reason);
  assert.equal(input.calls.length, 0);
}

test("public checkout and its git directory cannot serve as publication authority", async t => {
  const input = await localSetup(t);
  for (const publicationStore of [input.repo, `${input.repo}/.git`]) {
    await assertRejectedLocalAuthority(input, publicationStore, /separate bare Git/);
  }
  assert.equal(input.calls.length, 0);
});

test("nested bare publication stores cannot write private receipts inside public code", async t => {
  const input = await localSetup(t);
  for (const publicationStore of [`${input.repo}/private-store.git`, `${input.repo}/.git/private-store.git`]) {
    await runGit({ cwd: input.repo, args: ["init", "--bare", publicationStore] });
    await assertRejectedLocalAuthority(input, publicationStore, /outside the worktree/);
  }
  assert.equal(input.calls.length, 0);
});

test("subdirectory caller cannot put publication authority inside the public top-level", async t => {
  const input = await localSetup(t);
  const repo = `${input.repo}/src`;
  await mkdir(repo);
  const publicationStore = `${input.repo}/private-authority.git`;
  await runGit({ cwd: input.repo, args: ["init", "--bare", publicationStore] });
  await assertRejectedLocalAuthority(input, publicationStore, /outside the worktree/, { repo });
  assert.equal(input.calls.length, 0);
});

test("independent clones sharing one local authority cannot duplicate approved delivery", async t => {
  const input = await localSetup(t);
  const second = await clonePublicationRepo(input, "-local-second");
  const outcomes = await Promise.allSettled([publishProvenanceStatuses(input), publishProvenanceStatuses({ ...input, repo: second })]);
  assert.ok(outcomes.some(item => item.status === "fulfilled" && item.value.status === "published"));
  assert.equal(input.calls.length, 2);
  assert.equal((await publishProvenanceStatuses({ ...input, repo: second })).status, "published");
  assert.equal(input.calls.length, 2);
});

test("local interrupted delivery leaves approval consumed for another clone", async t => {
  const input = await localSetup(t);
  let attempts = 0;
  input.publisher = { publish: async () => { attempts += 1; throw new Error("uncertain transport"); } };
  assert.equal((await publishProvenanceStatuses(input)).status, "blocked");
  const second = await clonePublicationRepo(input, "-local-recovery");
  assert.equal((await publishProvenanceStatuses({ ...input, repo: second })).status, "blocked");
  assert.equal(attempts, 1);
});

test("crashed local publisher leaves pending receipt that another clone never retries", async t => {
  const input = await localSetup(t);
  const ref = `refs/tabellio/provenance-status-reservations/${digestObject({ repository: "example/tabellio", approvalId: input.approval.id })}`;
  const ledger = await GitJsonLedger.open({ repoPath: input.control, ref });
  await ledger.write("receipt.json", {
    schemaVersion: "tabellio-provenance-status-receipt/v0.1", approvalId: input.approval.id,
    reservationId: "12345678-1234-4234-8234-123456789abc", intentDigest: input.intent.integrity.digest,
    candidateId: input.intent.candidate.id, attemptedAt: now, status: "pending", published: [],
  }, { expectedVersion: null });
  const result = await publishProvenanceStatuses(input);
  assert.equal(result.status, "blocked");
  assert.match(result.reason, /earlier attempt is unresolved/);
  assert.equal(input.calls.length, 0);
});

test("approved local authority cannot be switched to a fresh store", async t => {
  const input = await localSetup(t);
  const modified = structuredClone(input.intent);
  modified.reservationRemote = `local:${input.repo}`;
  const { integrity: _integrity, ...unsigned } = modified;
  modified.integrity.digest = digestObject(unsigned);
  await assert.rejects(publishProvenanceStatuses({ ...input, intent: modified }));
  assert.equal(input.calls.length, 0);
});


test("separate publishing processes use one atomic local reservation", async t => {
  const input = await localSetup(t);
  const second = await clonePublicationRepo(input, "-local-process");
  const module = new URL("../scripts/lib/provenance-review-publication.mjs", import.meta.url).href;
  const script = `import { publishProvenanceStatuses } from ${JSON.stringify(module)};
    const input = JSON.parse(process.argv[1]);
    let delivered = 0;
    input.publisher = { publish: async request => ({ ...request, id: ++delivered }) };
    try { const result = await publishProvenanceStatuses(input); console.log(JSON.stringify({ status: result.status, delivered })); }
    catch { console.log(JSON.stringify({ status: "blocked", delivered })); }`;
  const run = repo => promisify(execFile)(process.execPath, ["--input-type=module", "-e", script, JSON.stringify({
    repo, lineage: input.lineage, intent: input.intent, approval: input.approval, now,
  })], { cwd: fileURLToPath(new URL("..", import.meta.url)), timeout: 30000 });
  const results = await Promise.all([run(input.repo), run(second)]);
  const outcomes = results.map(result => JSON.parse(result.stdout));
  assert.equal(outcomes.reduce((sum, result) => sum + result.delivered, 0), 2);
  assert.ok(outcomes.some(result => result.status === "published"));
  assert.equal((await publishProvenanceStatuses(input)).status, "published");
  assert.equal(input.calls.length, 0);
});
