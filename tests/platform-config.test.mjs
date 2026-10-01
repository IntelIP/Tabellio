import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { platformFixture, localPlatformFixture } from "./helpers/platform-fixture.mjs";

import { validatePlatformConfig } from "../scripts/lib/platform-config.mjs";

const projectRoot = new URL("../", import.meta.url).pathname;

test("platform v0.3 makes GitHub code-only storage and private GitHub control state explicit", async () => {
  const config = platformFixture();
  assert.equal(validatePlatformConfig(config), config);
  assert.deepEqual(config.codeStorage, {
    provider: "github",
    remoteName: "origin",
    publicSurface: "code-and-thin-pr",
    codeRef: "refs/heads/main",
    allowedRefPrefixes: ["refs/heads/", "refs/tags/"],
  });
  assert.equal(config.workflow.controlState, "external");
  assert.equal(config.workflow.controlProvider, "github");
  assert.equal(config.workflow.controlRemoteName, "control");
  assert.equal(config.workflow.publishControlRefsToCodeStorage, false);
  assert.equal(config.ledger.storage, "external");
  assert.equal(config.validation.storage, "external");
  assert.equal(config.reviews.storage, "external");
});

test("platform v0.3 rejects provider drift and private-state publication", async () => {
  const config = platformFixture();
  assert.throws(
    () => validatePlatformConfig({ ...config, codeStorage: { ...config.codeStorage, provider: "unsupported" } }),
    /platform.codeStorage.provider must be "github"/,
  );
  assert.throws(
    () => validatePlatformConfig({ ...config, workflow: { ...config.workflow, publishControlRefsToCodeStorage: true } }),
    /platform.workflow.publishControlRefsToCodeStorage must be false/,
  );
  assert.throws(
    () => validatePlatformConfig({ ...config, workflow: { ...config.workflow, controlProvider: "unsupported" } }),
    /platform.workflow.controlProvider must be "github"/,
  );
  assert.throws(
    () => validatePlatformConfig({ ...config, codeStorage: { ...config.codeStorage, allowedRefPrefixes: ["refs/heads/", "refs/tabellio/"] } }),
    /allowedRefPrefixes must contain each required value exactly once/,
  );
});

test("local v0.4 default retains privacy boundaries and legacy remote compatibility", async () => {
  const config = JSON.parse(await readFile(`${projectRoot}/tabellio.platform.json`, "utf8"));
  assert.deepEqual(config, localPlatformFixture());
  assert.equal(validatePlatformConfig(config), config);
  assert.equal(validatePlatformConfig(platformFixture()).schemaVersion, "tabellio-platform/v0.3");
  assert.throws(() => validatePlatformConfig({ ...config, workflow: { ...config.workflow, controlRemoteName: "origin" } }), /controlRemoteName/);
  assert.throws(() => validatePlatformConfig({ ...config, ledger: { ...config.ledger, storage: "external" } }), /storage/);
  const remote = platformFixture();
  remote.schemaVersion = "tabellio-platform/v0.4";
  remote.workflow.controlRemoteName = "customer-private";
  assert.throws(() => validatePlatformConfig(remote), /controlRemoteName must be "control"/);
  remote.workflow.controlRemoteName = "control";
  assert.equal(validatePlatformConfig(remote), remote);
});
