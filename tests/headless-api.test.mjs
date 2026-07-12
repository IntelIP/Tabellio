import assert from "node:assert/strict";
import test from "node:test";

import { HeadlessApi, InMemoryControlPlaneStore } from "../scripts/lib/headless-api.mjs";

const now = new Date("2026-07-12T18:00:00.000Z");
const token = "Bearer agent-token";

test("headless API exposes health without exposing forge UI semantics", async () => {
  const { api } = fixture();
  const result = await api.handle({ method: "GET", path: "/v1/health", headers: {} });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, service: "tabellio-control-plane" });
  assert.match(result.headers["x-request-id"], /^req_/);

  const missing = await api.handle({ method: "GET", path: "/", headers: {} });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "route_not_found");
});

test("repository provisioning is asynchronous and idempotent", async () => {
  const { api } = fixture();
  const request = {
    method: "POST",
    path: "/v1/repositories",
    headers: { authorization: token, "idempotency-key": "repo-create-1" },
    body: { owner: "acme", name: "project", private: true, defaultBranch: "main" },
  };
  const first = await api.handle(request);
  const replay = await api.handle(structuredClone(request));
  assert.equal(first.status, 202);
  assert.equal(replay.status, 202);
  assert.equal(replay.body.id, first.body.id);
  assert.equal(first.body.type, "repository.provision");
  assert.match(first.body.repositoryId, /^repo_[0-9a-f]{24}$/);
  assert.equal(first.headers.location, `/v1/jobs/${first.body.id}`);

  const changed = structuredClone(request);
  changed.body.name = "different";
  const conflict = await api.handle(changed);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "idempotency_conflict");
});

test("repository reads stay tenant-bound and credential responses are non-cacheable", async () => {
  const { api, store } = fixture();
  store.putRepository(repository());
  const found = await api.handle({
    method: "GET",
    path: "/v1/repositories/repo_example",
    headers: { authorization: token },
  });
  assert.equal(found.status, 200);
  assert.equal(found.body.backend.provider, "forgejo");

  const credential = await api.handle({
    method: "POST",
    path: "/v1/repositories/repo_example/credentials",
    headers: { authorization: token },
    body: { scopes: ["git:write", "git:read"], ttlSeconds: 300 },
  });
  assert.equal(credential.status, 201);
  assert.equal(credential.headers["cache-control"], "no-store");
  assert.equal(credential.body.secret, "one-use-secret");
  assert.deepEqual(credential.body.scopes, ["git:read", "git:write"]);

  const missingAuth = await api.handle({
    method: "GET",
    path: "/v1/repositories/repo_example",
    headers: {},
  });
  assert.equal(missingAuth.status, 401);
});

test("workflow jobs bind validation and merge to exact commits", async () => {
  const { api, store } = fixture();
  store.putRepository(repository());
  const common = { authorization: token, "idempotency-key": "job-1" };
  const validation = await api.handle({
    method: "POST",
    path: "/v1/validations",
    headers: common,
    body: { repositoryId: "repo_example", baseCommit: "a".repeat(40), headCommit: "b".repeat(40) },
  });
  assert.equal(validation.status, 202);
  assert.equal(validation.body.type, "validation.run");
  assert.equal(validation.body.payload.headCommit, "b".repeat(40));

  const mergeIntent = await api.handle({
    method: "POST",
    path: "/v1/merge-intents",
    headers: { ...common, "idempotency-key": "merge-1" },
    body: { repositoryId: "repo_example", changeRequestId: "cr_example", headCommit: "b".repeat(40) },
  });
  assert.equal(mergeIntent.status, 202);
  assert.equal(mergeIntent.body.type, "merge.intent.create");

  const approval = await api.handle({
    method: "POST",
    path: "/v1/merge-intents/intent_example/approvals",
    headers: { ...common, "idempotency-key": "approval-1" },
    body: { repositoryId: "repo_example", headCommit: "b".repeat(40), expiresAt: "2026-07-12T18:10:00.000Z" },
  });
  assert.equal(approval.status, 202);
  assert.equal(approval.body.type, "merge.approval.record");
  assert.equal(approval.body.payload.approvedBy, "codex");

  const merge = await api.handle({
    method: "POST",
    path: "/v1/merge-intents/intent_example/executions",
    headers: { ...common, "idempotency-key": "execute-1" },
    body: { repositoryId: "repo_example", headCommit: "b".repeat(40), approvalId: "approval_example" },
  });
  assert.equal(merge.status, 202);
  assert.equal(merge.body.type, "merge.execute");

  const changeRequest = await api.handle({
    method: "POST",
    path: "/v1/change-requests",
    headers: { ...common, "idempotency-key": "change-1" },
    body: { repositoryId: "repo_example", sourceBranch: "agent/change", targetBranch: "main", title: "Agent change", draft: true },
  });
  assert.equal(changeRequest.status, 202);
  assert.equal(changeRequest.body.type, "change-request.create");

  const status = await api.handle({ method: "GET", path: `/v1/jobs/${merge.body.id}`, headers: { authorization: token } });
  assert.equal(status.status, 200);
  assert.equal(status.body.id, merge.body.id);

  const invalid = await api.handle({
    method: "POST",
    path: "/v1/validations",
    headers: { ...common, "idempotency-key": "invalid-1" },
    body: { repositoryId: "repo_example", baseCommit: "main", headCommit: "HEAD" },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error.message, /Git object ID/);
});

function fixture() {
  const store = new InMemoryControlPlaneStore();
  const allowed = new Set([
    "repository:write",
    "repository:read",
    "credential:issue",
    "change-request:write",
    "validation:run",
    "merge:intent",
    "merge:approve",
    "merge:execute",
    "job:read",
  ]);
  const authorizer = {
    async authorize({ authorization, scope }) {
      return authorization === token && allowed.has(scope)
        ? { tenantId: "tenant-acme", agentId: "codex" }
        : null;
    },
  };
  const credentialBroker = {
    async issue({ repository, scopes, ttlSeconds, now: issuedAt }) {
      return {
        schemaVersion: "tabellio-git-credential/v0.1",
        repositoryId: repository.id,
        username: "tabellio-agent",
        secret: "one-use-secret",
        cloneUrl: repository.git.cloneUrl,
        scopes,
        expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
      };
    },
  };
  return {
    store,
    api: new HeadlessApi({ store, credentialBroker, authorizer, clock: () => new Date(now) }),
  };
}

function repository() {
  return {
    schemaVersion: "tabellio-repository/v0.1",
    id: "repo_example",
    tenantId: "tenant-acme",
    slug: "acme/project",
    backend: { provider: "forgejo", id: "17" },
    git: { cloneUrl: "https://git.example.test/acme/project.git", defaultBranch: "main" },
    state: "active",
  };
}
