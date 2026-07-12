import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { HeadlessApi, InMemoryControlPlaneStore } from "../scripts/lib/headless-api.mjs";
import { createHeadlessHttpHandler } from "../scripts/lib/headless-http.mjs";

test("HTTP adapter serves headless API and bounds JSON input", async (t) => {
  const store = new InMemoryControlPlaneStore();
  const api = new HeadlessApi({
    store,
    authorizer: {
      async authorize({ authorization }) {
        return authorization === "Bearer test" ? { tenantId: "tenant-acme", agentId: "codex" } : null;
      },
    },
    credentialBroker: { async issue() { throw new Error("not used"); } },
    clock: () => new Date("2026-07-12T18:00:00.000Z"),
  });
  const server = createServer(createHeadlessHttpHandler(api, { maxBodyBytes: 1_024 }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "tabellio-control-plane");

  const create = await fetch(`${baseUrl}/v1/repositories`, {
    method: "POST",
    headers: {
      authorization: "Bearer test",
      "content-type": "application/json",
      "idempotency-key": "create-1",
    },
    body: JSON.stringify({ owner: "acme", name: "project", private: true, defaultBranch: "main" }),
  });
  assert.equal(create.status, 202);
  assert.equal((await create.json()).type, "repository.provision");

  const invalid = await fetch(`${baseUrl}/v1/repositories`, {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "text/plain" },
    body: "not-json",
  });
  assert.equal(invalid.status, 415);
  assert.equal((await invalid.json()).error.code, "unsupported_media_type");

  const oversized = await fetch(`${baseUrl}/v1/repositories`, {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(2_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "body_too_large");
});
