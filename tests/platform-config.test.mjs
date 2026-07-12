import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { platformRemoteRepository, validatePlatformConfig } from "../scripts/lib/platform-config.mjs";
import { repositoryIdentity } from "../scripts/lib/repository-identity.mjs";

const projectRoot = new URL("../", import.meta.url).pathname;

test("v0.2 platform exposes a headless provider-neutral remote contract", async () => {
  const config = JSON.parse(await readFile(`${projectRoot}/tabellio.platform.json`, "utf8"));
  assert.equal(validatePlatformConfig(config), config);
  assert.deepEqual(platformRemoteRepository(config), {
    provider: "forgejo",
    remoteName: "forgejo",
    publicSurface: "git-only",
    gitUrlEnv: "TABELLIO_REMOTE_URL",
    apiUrlEnv: "TABELLIO_REMOTE_API_URL",
    credentialFileEnv: "TABELLIO_REMOTE_CREDENTIAL_FILE",
  });
  assert.equal(config.reviews.provider, "tabellio");
  assert.equal("transition" in config, false);
  assert.equal("canonicalForge" in config, false);
});

test("v0.1 platform remains readable during migration", () => {
  const legacy = {
    schemaVersion: "tabellio-platform/v0.1",
    canonicalForge: {
      provider: "forgejo",
      urlEnv: "TABELLIO_FORGE_URL",
      apiUrlEnv: "TABELLIO_FORGE_API_URL",
      tokenFileEnv: "TABELLIO_FORGE_TOKEN_FILE",
    },
    git: sharedGit(),
    ledger: { provider: "entire", checkpointRef: "refs/heads/entire/checkpoints/v1" },
    validation: { runner: "tabellio-validate", manifest: "tabellio.validation.json", resultRef: "refs/tabellio/validations" },
    reviews: { provider: "forgejo", stateRef: "refs/tabellio/reviews" },
    transition: { codeStorage: "current-origin", runtimeRequired: false },
  };
  assert.equal(validatePlatformConfig(legacy), legacy);
  assert.equal(platformRemoteRepository(legacy).publicSurface, "forge-compatibility");
});

test("repository identity uses canonical remote instead of GitHub-style origin", async () => {
  const requested = [];
  const store = {
    repoPath: "/tmp/repository",
    async gitConfig(key) {
      requested.push(key);
      return key === "remote.forgejo.url" ? "ssh://git@git.example.test/acme/project.git" : null;
    },
  };
  assert.equal(await repositoryIdentity(store), "git.example.test/acme/project");
  assert.deepEqual(requested, ["remote.forgejo.url"]);
  assert.equal(await repositoryIdentity(store, "stable/repository"), "stable/repository");
});

function sharedGit() {
  return {
    stackManager: "git-spice",
    codeRef: "refs/heads/main",
    controlRefs: [
      "refs/tabellio/reviews",
      "refs/tabellio/validations",
      "refs/heads/entire/checkpoints/v1",
    ],
  };
}
