import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryControlPlaneStore } from "../scripts/lib/headless-api.mjs";
import { JobWorker } from "../scripts/lib/job-worker.mjs";

test("worker leases, heartbeats, and completes exact queued job", async () => {
  const queue = new InMemoryControlPlaneStore();
  const job = await enqueue(queue, "success-1");
  let currentTime = new Date("2026-07-12T18:00:00.000Z");
  const worker = new JobWorker({
    queue,
    workerId: "worker-1",
    clock: () => new Date(currentTime),
    handlers: {
      "validation.run": async (claimed, { heartbeat }) => {
        assert.equal(claimed.id, job.id);
        currentTime = new Date("2026-07-12T18:00:10.000Z");
        const renewed = await heartbeat();
        assert.equal(renewed.lease.workerId, "worker-1");
        return { validatedCommit: claimed.payload.headCommit };
      },
    },
  });
  const result = await worker.runOnce();
  assert.equal(result.state, "succeeded");
  assert.equal(result.attempt, 1);
  assert.equal(result.lease, null);
  assert.equal(result.result.validatedCommit, "b".repeat(40));
});

test("worker retries bounded failures then records terminal failure", async () => {
  const queue = new InMemoryControlPlaneStore();
  await enqueue(queue, "failure-1");
  const worker = new JobWorker({
    queue,
    workerId: "worker-1",
    maxAttempts: 2,
    clock: () => new Date("2026-07-12T18:00:00.000Z"),
    handlers: { "validation.run": async () => { throw new Error("sandbox failed"); } },
  });
  const first = await worker.runOnce();
  assert.equal(first.state, "queued");
  assert.equal(first.error.retryable, true);
  const second = await worker.runOnce();
  assert.equal(second.state, "failed");
  assert.equal(second.attempt, 2);
  assert.equal(second.error.retryable, false);
  assert.equal(await worker.runOnce(), null);
});

test("expired lease can be reclaimed without concurrent ownership", async () => {
  const queue = new InMemoryControlPlaneStore();
  const job = await enqueue(queue, "lease-1");
  const first = await queue.claim({
    workerId: "dead-worker",
    leaseMs: 1_000,
    now: new Date("2026-07-12T18:00:00.000Z"),
    types: ["validation.run"],
  });
  assert.equal(first.id, job.id);
  const early = await queue.claim({
    workerId: "recovery-worker",
    leaseMs: 1_000,
    now: new Date("2026-07-12T18:00:00.500Z"),
    types: ["validation.run"],
  });
  assert.equal(early, null);
  const recovered = await queue.claim({
    workerId: "recovery-worker",
    leaseMs: 1_000,
    now: new Date("2026-07-12T18:00:01.001Z"),
    types: ["validation.run"],
  });
  assert.equal(recovered.id, job.id);
  assert.equal(recovered.attempt, 2);
  assert.equal(recovered.lease.workerId, "recovery-worker");
});

function enqueue(queue, idempotencyKey) {
  return queue.enqueue({
    tenantId: "tenant-acme",
    agentId: "codex",
    type: "validation.run",
    repositoryId: "repo_example",
    payload: { headCommit: "b".repeat(40) },
    idempotencyKey,
    now: new Date("2026-07-12T18:00:00.000Z"),
  });
}
