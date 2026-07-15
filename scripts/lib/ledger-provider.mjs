export const LEDGER_SCHEMA_VERSION = "tabellio-ledger/v0.1";

export class LedgerProvider {
  /** @returns {Promise<string>} */
  async toolVersion() {
    throw new Error("LedgerProvider.toolVersion must be implemented.");
  }

  /** @param {{repositoryId: string, baseRevision: string, headRevision: string, capturedAt?: string}} options */
  // fallow-ignore-next-line unused-class-member
  async snapshot(_options) {
    throw new Error("LedgerProvider.snapshot must be implemented.");
  }

  /** @param {unknown} snapshot */
  // fallow-ignore-next-line unused-class-member
  contextReferences(_snapshot) {
    throw new Error("LedgerProvider.contextReferences must be implemented.");
  }
}

export function validateLedgerSnapshot(value) {
  requireObject(value, "ledger snapshot");
  exactKeys(value, ["schemaVersion", "repository", "provider", "capturedAt", "range", "checkpoints"], "ledger snapshot");
  equals(value.schemaVersion, LEDGER_SCHEMA_VERSION, "schemaVersion");
  isoDate(value.capturedAt, "capturedAt");

  requireObject(value.repository, "repository");
  exactKeys(value.repository, ["id"], "repository");
  requiredString(value.repository.id, "repository.id");
  if (/^(?:\/|file:|[A-Za-z]:[\\/])/.test(value.repository.id) || value.repository.id.includes("\\")) {
    throw new Error("repository.id must not expose a local filesystem path.");
  }

  requireObject(value.provider, "provider");
  exactKeys(value.provider, ["id", "version"], "provider");
  equals(value.provider.id, "entire", "provider.id");
  requiredString(value.provider.version, "provider.version");

  requireObject(value.range, "range");
  exactKeys(value.range, ["baseCommit", "headCommit"], "range");
  oid(value.range.baseCommit, "range.baseCommit");
  oid(value.range.headCommit, "range.headCommit");
  if (value.range.baseCommit.length !== value.range.headCommit.length) {
    throw new Error("range commits must use the same Git object format.");
  }

  if (!Array.isArray(value.checkpoints)) throw new Error("checkpoints must be an array.");
  const ids = new Set();
  for (const [index, checkpoint] of value.checkpoints.entries()) {
    const path = `checkpoints[${index}]`;
    requireObject(checkpoint, path);
    exactKeys(checkpoint, [
      "id", "commits", "branch", "filesTouched", "hasReview", "hasInvestigation",
      "sessionCount", "sessions", "partial", "digest", "summary",
    ], path);
    checkpointId(checkpoint.id, `${path}.id`);
    if (ids.has(checkpoint.id)) throw new Error(`checkpoints contains duplicate id: ${checkpoint.id}.`);
    ids.add(checkpoint.id);
    oidArray(checkpoint.commits, `${path}.commits`, value.range.baseCommit.length);
    if (checkpoint.branch !== null) requiredString(checkpoint.branch, `${path}.branch`);
    stringArray(checkpoint.filesTouched, `${path}.filesTouched`);
    boolean(checkpoint.hasReview, `${path}.hasReview`);
    boolean(checkpoint.hasInvestigation, `${path}.hasInvestigation`);
    nonNegativeInteger(checkpoint.sessionCount, `${path}.sessionCount`);
    boolean(checkpoint.partial, `${path}.partial`);
    oid(checkpoint.digest, `${path}.digest`, 64);
    if (checkpoint.summary !== null) {
      requiredString(checkpoint.summary, `${path}.summary`);
      if (checkpoint.summary.length > 500) throw new Error(`${path}.summary must be at most 500 characters.`);
    }
    validateSessions(checkpoint.sessions, `${path}.sessions`);
    if (checkpoint.sessions.length !== checkpoint.sessionCount) {
      throw new Error(`${path}.sessionCount must match sessions length.`);
    }
  }
  return value;
}

function validateSessions(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  const indexes = new Set();
  for (const [position, session] of value.entries()) {
    const sessionPath = `${path}[${position}]`;
    requireObject(session, sessionPath);
    exactKeys(session, [
      "index", "id", "agent", "model", "kind", "createdAt", "filesTouched",
      "tokenUsage", "summary", "error",
    ], sessionPath);
    nonNegativeInteger(session.index, `${sessionPath}.index`);
    if (indexes.has(session.index)) throw new Error(`${path} contains duplicate session index: ${session.index}.`);
    indexes.add(session.index);
    for (const key of ["id", "agent", "model", "kind", "error"]) {
      if (session[key] !== null) requiredString(session[key], `${sessionPath}.${key}`);
    }
    if (session.createdAt !== null) isoDate(session.createdAt, `${sessionPath}.createdAt`);
    stringArray(session.filesTouched, `${sessionPath}.filesTouched`);
    validateTokenUsage(session.tokenUsage, `${sessionPath}.tokenUsage`);
    validateSummary(session.summary, `${sessionPath}.summary`);
  }
}

function validateTokenUsage(value, path) {
  if (value === null) return;
  requireObject(value, path);
  exactKeys(value, ["input", "output", "cacheRead", "cacheCreation"], path);
  for (const key of ["input", "output", "cacheRead", "cacheCreation"]) {
    nonNegativeInteger(value[key], `${path}.${key}`);
  }
}

function validateSummary(value, path) {
  if (value === null) return;
  requireObject(value, path);
  exactKeys(value, ["intent", "outcome"], path);
  for (const key of ["intent", "outcome"]) {
    if (value[key] !== null) requiredString(value[key], `${path}.${key}`);
  }
}

function exactKeys(value, allowed, path) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${path} contains unsupported properties: ${unexpected.join(", ")}.`);
  const undefinedKeys = Object.keys(value).filter((key) => value[key] === undefined);
  if (undefinedKeys.length > 0) throw new Error(`${path} properties must not be undefined: ${undefinedKeys.join(", ")}.`);
}

function requireObject(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object.`);
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string.`);
}

function stringArray(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    requiredString(item, `${path}[${index}]`);
    if (seen.has(item)) throw new Error(`${path} must contain unique values.`);
    seen.add(item);
  }
}

function oidArray(value, path, length) {
  stringArray(value, path);
  if (value.length === 0) throw new Error(`${path} must contain at least one commit.`);
  value.forEach((item, index) => oid(item, `${path}[${index}]`, length));
}

function checkpointId(value, path) {
  if (typeof value !== "string" || !/^[0-9a-f]{12}$/.test(value)) {
    throw new Error(`${path} must be a 12-character hexadecimal Entire checkpoint ID.`);
  }
}

function oid(value, path, length = null) {
  const expression = length ? new RegExp(`^[0-9a-f]{${length}}$`) : /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  if (typeof value !== "string" || !expression.test(value)) throw new Error(`${path} must be a hexadecimal object ID.`);
}

function nonNegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${path} must be a non-negative integer.`);
}

function boolean(value, path) {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean.`);
}

function isoDate(value, path) {
  requiredString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${path} must be an ISO date-time string.`);
  }
}

function equals(value, expected, path) {
  if (value !== expected) throw new Error(`${path} must be ${expected}.`);
}
