import { createHash } from "node:crypto";

export const CHANGE_REQUEST_SCHEMA_VERSION = "tabellio-change-request/v0.1";

export function canonicalChangeRequestId({ repositoryId, providerId, backendId }) {
  const normalizedRepositoryId = requiredString(repositoryId, "repositoryId");
  const normalizedProviderId = providerIdentifier(providerId, "providerId");
  const normalizedBackendId = requiredString(backendId, "backendId");
  const digest = createHash("sha256")
    .update(`${normalizedRepositoryId}\0${normalizedProviderId}\0${normalizedBackendId}`)
    .digest("hex")
    .slice(0, 24);
  return `cr_${digest}`;
}

export function canonicalChangeRequest({ repositoryId, providerId, value }) {
  object(value, "change request");
  const backendId = String(value.id ?? "");
  return {
    schemaVersion: CHANGE_REQUEST_SCHEMA_VERSION,
    id: canonicalChangeRequestId({ repositoryId, providerId, backendId }),
    repository: { id: requiredString(repositoryId, "repositoryId") },
    backend: {
      provider: providerIdentifier(providerId, "providerId"),
      id: requiredString(backendId, "change request.id"),
      number: positiveInteger(value.number, "change request.number"),
      url: httpUrl(value.webUrl, "change request.webUrl"),
    },
    title: requiredString(value.title, "change request.title"),
    state: member(value.state, ["open", "closed", "merged"], "change request.state"),
    draft: boolean(value.draft, "change request.draft"),
    mergeable: nullableBoolean(value.mergeable, "change request.mergeable"),
    source: branch(value.source, "change request.source"),
    target: branch(value.target, "change request.target"),
    updatedAt: isoDate(value.updatedAt, "change request.updatedAt"),
  };
}

function branch(value, path) {
  object(value, path);
  return {
    branch: requiredString(value.branch, `${path}.branch`),
    commit: oid(value.commit, `${path}.commit`),
  };
}

function object(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  return value;
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${path} must be a non-empty string.`);
  return value.trim();
}

function providerIdentifier(value, path) {
  requiredString(value, path);
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new TypeError(`${path} must be a lowercase provider identifier.`);
  return value;
}

function positiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${path} must be a positive integer.`);
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean.`);
  return value;
}

function nullableBoolean(value, path) {
  if (value === null || typeof value === "boolean") return value;
  throw new TypeError(`${path} must be a boolean or null.`);
}

function member(value, values, path) {
  if (!values.includes(value)) throw new TypeError(`${path} must be one of: ${values.join(", ")}.`);
  return value;
}

function oid(value, path) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) throw new TypeError(`${path} must be a Git object ID.`);
  return value;
}

function httpUrl(value, path) {
  requiredString(value, path);
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new TypeError(`${path} must be an HTTP URL.`);
  return value;
}

function isoDate(value, path) {
  requiredString(value, path);
  if (Number.isNaN(Date.parse(value))) throw new TypeError(`${path} must be an ISO date-time.`);
  return value;
}
