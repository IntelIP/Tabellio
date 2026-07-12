export function validatePlatformConfig(value) {
  object(value, "platform");
  if (value.schemaVersion === "tabellio-platform/v0.1") return validateV01(value);
  if (value.schemaVersion === "tabellio-platform/v0.2") return validateV02(value);
  throw new Error("platform.schemaVersion must be tabellio-platform/v0.1 or tabellio-platform/v0.2.");
}

export function platformRemoteRepository(value) {
  validatePlatformConfig(value);
  if (value.schemaVersion === "tabellio-platform/v0.2") return value.remoteRepository;
  return {
    provider: value.canonicalForge.provider,
    remoteName: "forgejo",
    publicSurface: "forge-compatibility",
    gitUrlEnv: value.canonicalForge.urlEnv,
    apiUrlEnv: value.canonicalForge.apiUrlEnv,
    credentialFileEnv: value.canonicalForge.tokenFileEnv,
  };
}

function validateV01(value) {
  exact(value, ["schemaVersion", "canonicalForge", "git", "ledger", "validation", "reviews", "transition"], "platform");
  exactObject(value.canonicalForge, {
    provider: "forgejo",
    urlEnv: "TABELLIO_FORGE_URL",
    apiUrlEnv: "TABELLIO_FORGE_API_URL",
    tokenFileEnv: "TABELLIO_FORGE_TOKEN_FILE",
  }, "platform.canonicalForge");
  validateSharedConfig(value);
  exactObject(value.reviews, { provider: "forgejo", stateRef: "refs/tabellio/reviews" }, "platform.reviews");
  object(value.transition, "platform.transition");
  exact(value.transition, ["codeStorage", "runtimeRequired"], "platform.transition");
  string(value.transition.codeStorage, "platform.transition.codeStorage");
  equals(value.transition.runtimeRequired, false, "platform.transition.runtimeRequired");
  return value;
}

function validateV02(value) {
  exact(value, ["schemaVersion", "remoteRepository", "git", "ledger", "validation", "reviews"], "platform");
  object(value.remoteRepository, "platform.remoteRepository");
  exact(value.remoteRepository, ["provider", "remoteName", "publicSurface", "gitUrlEnv", "apiUrlEnv", "credentialFileEnv"], "platform.remoteRepository");
  identifier(value.remoteRepository.provider, "platform.remoteRepository.provider");
  remoteName(value.remoteRepository.remoteName, "platform.remoteRepository.remoteName");
  equals(value.remoteRepository.publicSurface, "git-only", "platform.remoteRepository.publicSurface");
  string(value.remoteRepository.gitUrlEnv, "platform.remoteRepository.gitUrlEnv");
  string(value.remoteRepository.apiUrlEnv, "platform.remoteRepository.apiUrlEnv");
  string(value.remoteRepository.credentialFileEnv, "platform.remoteRepository.credentialFileEnv");
  validateSharedConfig(value);
  exactObject(value.reviews, { provider: "tabellio", stateRef: "refs/tabellio/reviews" }, "platform.reviews");
  return value;
}

function validateSharedConfig(value) {
  object(value.git, "platform.git");
  exact(value.git, ["stackManager", "codeRef", "controlRefs"], "platform.git");
  equals(value.git.stackManager, "git-spice", "platform.git.stackManager");
  equals(value.git.codeRef, "refs/heads/main", "platform.git.codeRef");
  array(value.git.controlRefs, "platform.git.controlRefs");
  const requiredRefs = ["refs/tabellio/reviews", "refs/tabellio/validations", "refs/heads/entire/checkpoints/v1"];
  if (new Set(value.git.controlRefs).size !== value.git.controlRefs.length || requiredRefs.some((ref) => !value.git.controlRefs.includes(ref))) {
    throw new Error(`platform.git.controlRefs must contain each canonical control ref exactly once: ${requiredRefs.join(", ")}.`);
  }
  if (value.git.controlRefs.some((ref) => !requiredRefs.includes(ref))) throw new Error("platform.git.controlRefs contains an unsupported ref.");
  exactObject(value.ledger, { provider: "entire", checkpointRef: "refs/heads/entire/checkpoints/v1" }, "platform.ledger");
  object(value.validation, "platform.validation");
  exact(value.validation, ["runner", "manifest", "resultRef"], "platform.validation");
  equals(value.validation.runner, "tabellio-validate", "platform.validation.runner");
  string(value.validation.manifest, "platform.validation.manifest");
  equals(value.validation.resultRef, "refs/tabellio/validations", "platform.validation.resultRef");
}

function exactObject(value, expected, path) {
  object(value, path);
  exact(value, Object.keys(expected), path);
  for (const [key, wanted] of Object.entries(expected)) equals(value[key], wanted, `${path}.${key}`);
}

function exact(value, keys, path) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${path} must contain exactly: ${expected.join(", ")}.`);
}

function object(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object.`);
}

function array(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
}

function string(value, path) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string.`);
}

function identifier(value, path) {
  string(value, path);
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new Error(`${path} must be a lowercase provider identifier.`);
}

function remoteName(value, path) {
  string(value, path);
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error(`${path} must be a valid Git remote name.`);
}

function equals(value, expected, path) {
  if (value !== expected) throw new Error(`${path} must be ${JSON.stringify(expected)}.`);
}
