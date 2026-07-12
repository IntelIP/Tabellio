import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  ForgejoHttpError,
  ForgejoProvider,
} from "../scripts/providers/forgejo-provider.mjs";

const timestamp = "2026-07-10T20:00:00Z";
const commit = "a".repeat(40);

test("Forgejo provider normalizes repositories, change requests, reviews, comments, and checks", async (t) => {
  const requests = [];
  const fixture = await startServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), authorization: request.headers.authorization });
    if (url.pathname === "/api/v1/version") return json(response, { version: "15.0.3+gitea-1.22.0" });
    if (url.pathname === "/api/v1/repos/acme/project") return json(response, repository());
    if (url.pathname === "/api/v1/repos/acme/project/pulls") return json(response, [pullRequest()]);
    if (url.pathname === "/api/v1/repos/acme/project/pulls/7") return json(response, pullRequest());
    if (url.pathname === "/api/v1/repos/acme/project/pulls/7/reviews") return json(response, [review()]);
    if (url.pathname === "/api/v1/repos/acme/project/pulls/7/reviews/31/comments") return json(response, [reviewComment()]);
    if (url.pathname === "/api/v1/repos/acme/project/issues/7/comments") return json(response, [issueComment()]);
    if (url.pathname === `/api/v1/repos/acme/project/commits/${commit}/status`) return json(response, combinedStatus());
    return json(response, { message: "not found" }, 404);
  });
  t.after(fixture.close);

  const provider = new ForgejoProvider({ baseUrl: fixture.baseUrl, token: "secret-token" });
  assert.ok(!JSON.stringify(provider).includes("secret-token"));
  assert.equal(await provider.version(), "15.0.3+gitea-1.22.0");
  assert.deepEqual(await provider.repository({ owner: "acme", repo: "project" }), {
    id: "11",
    owner: "acme",
    name: "project",
    fullName: "acme/project",
    private: true,
    archived: false,
    defaultBranch: "main",
    webUrl: `${fixture.baseUrl}/acme/project`,
    cloneUrl: `${fixture.baseUrl}/acme/project.git`,
  });
  const pulls = await provider.listChangeRequests({ owner: "acme", repo: "project" });
  assert.equal(pulls.length, 1);
  assert.deepEqual(pulls[0], {
    id: "21",
    number: 7,
    title: "Agent change",
    state: "open",
    draft: false,
    mergeable: true,
    source: { branch: "agent/change", commit },
    target: { branch: "main", commit: "b".repeat(40) },
    author: "agent",
    webUrl: `${fixture.baseUrl}/acme/project/pulls/7`,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  assert.deepEqual(await provider.changeRequest({ owner: "acme", repo: "project", number: 7 }), pulls[0]);
  assert.deepEqual(await provider.listReviews({ owner: "acme", repo: "project", number: 7 }), [{
    id: "31",
    state: "approved",
    body: "Looks good.",
    commit,
    dismissed: false,
    stale: false,
    author: "reviewer",
    submittedAt: timestamp,
    updatedAt: timestamp,
    webUrl: `${fixture.baseUrl}/acme/project/pulls/7#issuecomment-31`,
  }]);
  assert.equal((await provider.listReviewComments({ owner: "acme", repo: "project", number: 7 }))[0].path, "src/index.js");
  assert.equal((await provider.listIssueComments({ owner: "acme", repo: "project", number: 7 }))[0].body, "Run the checks.");
  assert.deepEqual(await provider.commitStatus({ owner: "acme", repo: "project", commit }), {
    commit,
    state: "success",
    total: 1,
    statuses: [{
      id: "51",
      context: "tests",
      state: "success",
      description: "All checks passed",
      targetUrl: `${fixture.baseUrl}/checks/51`,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  });
  assert.ok(requests.every((request) => request.authorization === "token secret-token"));
  assert.equal(requests.find((request) => request.path.endsWith("/pulls")).query.limit, "50");

  const apiUrlProvider = new ForgejoProvider({ baseUrl: `${fixture.baseUrl}/api/v1`, token: "secret-token" });
  assert.equal(await apiUrlProvider.version(), "15.0.3+gitea-1.22.0");
});

test("Forgejo provider rejects credential-bearing URLs and redacts tokens from failures", async (t) => {
  assert.throws(
    () => new ForgejoProvider({ baseUrl: "https://user:password@example.com", token: "token" }),
    /must not contain credentials/,
  );
  assert.throws(
    () => new ForgejoProvider({ baseUrl: "https://example.com?token=secret", token: "token" }),
    /must not contain a query or fragment/,
  );
  const fixture = await startServer((_request, response) => json(response, { message: "bad secret-token" }, 500));
  t.after(fixture.close);
  const provider = new ForgejoProvider({ baseUrl: fixture.baseUrl, token: "secret-token" });
  await assert.rejects(
    () => provider.version(),
    (error) => error instanceof ForgejoHttpError
      && error.status === 500
      && !error.message.includes("secret-token")
      && error.message.includes("[REDACTED]"),
  );
});

test("Forgejo remote provider provisions, archives, and exposes standard Git remotes", async (t) => {
  const requests = [];
  const fixture = await startServer(async (request, response) => {
    const body = await requestJson(request);
    requests.push({ method: request.method, path: request.url, body });
    if (request.method === "POST" && request.url === "/api/v1/orgs/acme/repos") {
      return json(response, repository());
    }
    if (request.method === "PATCH" && request.url === "/api/v1/repos/acme/project") {
      return json(response, repository({ archived: true }));
    }
    if (request.method === "GET" && request.url === "/api/v1/repos/acme/project") {
      return json(response, repository());
    }
    return json(response, { message: "not found" }, 404);
  });
  t.after(fixture.close);
  const provider = new ForgejoProvider({ baseUrl: fixture.baseUrl, token: "secret-token" });
  assert.equal(provider.providerId, "forgejo");

  const created = await provider.createRepository({ owner: "acme", name: "project", private: true, defaultBranch: "main" });
  assert.equal(created.fullName, "acme/project");
  const createRequest = requests.find((request) => request.method === "POST");
  assert.deepEqual(createRequest.body, { name: "project", private: true, default_branch: "main", auto_init: false });

  const remote = await provider.gitRemote({ owner: "acme", repo: "project" });
  assert.deepEqual(remote, {
    provider: "forgejo",
    repositoryId: "11",
    cloneUrl: `${fixture.baseUrl}/acme/project.git`,
    defaultBranch: "main",
  });
  const archived = await provider.archiveRepository({ owner: "acme", repo: "project" });
  assert.equal(archived.archived, true);
  assert.deepEqual(requests.find((request) => request.method === "PATCH").body, { archived: true });
});

function repository({ archived = false } = {}) {
  return {
    id: 11,
    owner: { login: "acme" },
    name: "project",
    full_name: "acme/project",
    private: true,
    archived,
    default_branch: "main",
    html_url: "__BASE__/acme/project",
    clone_url: "__BASE__/acme/project.git",
  };
}

function pullRequest() {
  return {
    id: 21,
    number: 7,
    title: "Agent change",
    state: "open",
    draft: false,
    mergeable: true,
    head: { ref: "agent/change", sha: commit },
    base: { ref: "main", sha: "b".repeat(40) },
    user: { login: "agent" },
    html_url: "__BASE__/acme/project/pulls/7",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function review() {
  return {
    id: 31,
    state: "APPROVED",
    body: "Looks good.",
    commit_id: commit,
    dismissed: false,
    stale: false,
    user: { login: "reviewer" },
    submitted_at: timestamp,
    updated_at: timestamp,
    html_url: "__BASE__/acme/project/pulls/7#issuecomment-31",
  };
}

function reviewComment() {
  return {
    id: 41,
    pull_request_review_id: 31,
    body: "Prefer a constant.",
    path: "src/index.js",
    position: 4,
    commit_id: commit,
    user: { login: "reviewer" },
    resolver: null,
    created_at: timestamp,
    updated_at: timestamp,
    html_url: "__BASE__/acme/project/pulls/7#issuecomment-41",
  };
}

function issueComment() {
  return {
    id: 42,
    body: "Run the checks.",
    user: { login: "reviewer" },
    created_at: timestamp,
    updated_at: timestamp,
    html_url: "__BASE__/acme/project/pulls/7#issuecomment-42",
  };
}

function combinedStatus() {
  return {
    sha: commit,
    state: "success",
    total_count: 1,
    statuses: [{
      id: 51,
      context: "tests",
      status: "success",
      description: "All checks passed",
      target_url: "__BASE__/checks/51",
      created_at: timestamp,
      updated_at: timestamp,
    }],
  };
}

async function startServer(handler) {
  let baseUrl;
  const server = createServer((request, response) => {
    const originalEnd = response.end.bind(response);
    response.end = (chunk, ...args) => originalEnd(typeof chunk === "string" ? chunk.replaceAll("__BASE__", baseUrl) : chunk, ...args);
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function json(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function requestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
