import assert from "node:assert/strict";
import test from "node:test";

import { canonicalChangeRequest, canonicalChangeRequestId } from "../scripts/lib/change-request.mjs";

test("canonical change request identity is stable and backend-neutral", () => {
  const input = {
    repositoryId: "acme/project",
    providerId: "forgejo",
    value: {
      id: "42",
      number: 7,
      title: "Agent change",
      state: "open",
      draft: false,
      mergeable: true,
      source: { branch: "agent/change", commit: "b".repeat(40) },
      target: { branch: "main", commit: "a".repeat(40) },
      webUrl: "https://git.example.test/acme/project/pulls/7",
      updatedAt: "2026-07-12T12:00:00.000Z",
    },
  };
  const record = canonicalChangeRequest(input);
  assert.match(record.id, /^cr_[0-9a-f]{24}$/);
  assert.equal(record.id, canonicalChangeRequestId({ repositoryId: "acme/project", providerId: "forgejo", backendId: "42" }));
  assert.deepEqual(record.backend, {
    provider: "forgejo",
    id: "42",
    number: 7,
    url: "https://git.example.test/acme/project/pulls/7",
  });
  assert.notEqual(
    record.id,
    canonicalChangeRequestId({ repositoryId: "acme/project", providerId: "code-storage", backendId: "42" }),
  );
  assert.throws(
    () => canonicalChangeRequest({ ...input, value: { ...input.value, draft: "false" } }),
    /draft must be a boolean/,
  );
  assert.equal(
    canonicalChangeRequestId({ repositoryId: " acme/project ", providerId: "forgejo", backendId: " 42 " }),
    record.id,
  );
});
