import { createHash, randomUUID } from "node:crypto";

const JOB_TYPES = new Set([
  "repository.provision",
  "change-request.create",
  "validation.run",
  "merge.intent.create",
  "merge.approval.record",
  "merge.execute",
]);
const GIT_SCOPES = new Set(["git:read", "git:write"]);

export class HeadlessApi {
  constructor({ store, credentialBroker, authorizer, clock = () => new Date() }) {
    requiredMethod(store, "repository");
    requiredMethod(store, "job");
    requiredMethod(store, "enqueue");
    requiredMethod(credentialBroker, "issue");
    requiredMethod(authorizer, "authorize");
    this.store = store;
    this.credentialBroker = credentialBroker;
    this.authorizer = authorizer;
    this.clock = clock;
  }

  async handle(request) {
    const requestId = header(request.headers, "x-request-id") ?? `req_${randomUUID()}`;
    try {
      const method = requiredString(request.method, "method").toUpperCase();
      const url = new URL(requiredString(request.path, "path"), "https://api.tabellio.invalid");
      if (url.search) throw new ApiError(400, "unsupported_query", "Query parameters are not supported.");
      const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
      if (method === "GET" && equalSegments(segments, ["v1", "health"])) {
        return response(200, { ok: true, service: "tabellio-control-plane" }, requestId);
      }
      if (method === "POST" && equalSegments(segments, ["v1", "repositories"])) {
        const principal = await this.#authorize(request, "repository:write");
        const body = repositoryProvisionInput(request.body);
        const repositoryId = repositoryRequestId(principal.tenantId, body.owner, body.name);
        return await this.#enqueue({ request, requestId, principal, type: "repository.provision", repositoryId, payload: { ...body, repositoryId } });
      }
      if (method === "GET" && segments.length === 3 && segments[0] === "v1" && segments[1] === "repositories") {
        const repositoryId = identifier(segments[2], "repositoryId");
        const principal = await this.#authorize(request, "repository:read", repositoryId);
        const repository = await this.store.repository({ tenantId: principal.tenantId, repositoryId });
        if (!repository) throw new ApiError(404, "repository_not_found", "Repository was not found.");
        return response(200, repository, requestId);
      }
      if (method === "POST" && segments.length === 4 && segments[0] === "v1" && segments[1] === "repositories" && segments[3] === "credentials") {
        const repositoryId = identifier(segments[2], "repositoryId");
        const principal = await this.#authorize(request, "credential:issue", repositoryId);
        const repository = await this.store.repository({ tenantId: principal.tenantId, repositoryId });
        if (!repository) throw new ApiError(404, "repository_not_found", "Repository was not found.");
        const input = credentialInput(request.body);
        const credential = await this.credentialBroker.issue({
          tenantId: principal.tenantId,
          agentId: principal.agentId,
          repository,
          scopes: input.scopes,
          ttlSeconds: input.ttlSeconds,
          now: this.clock(),
        });
        return response(201, credential, requestId, { "cache-control": "no-store" });
      }
      if (method === "POST" && equalSegments(segments, ["v1", "change-requests"])) {
        const body = changeRequestInput(request.body);
        const principal = await this.#authorize(request, "change-request:write", body.repositoryId);
        await this.#requireRepository(principal, body.repositoryId);
        return await this.#enqueue({ request, requestId, principal, type: "change-request.create", repositoryId: body.repositoryId, payload: body });
      }
      if (method === "POST" && equalSegments(segments, ["v1", "validations"])) {
        const body = validationInput(request.body);
        const principal = await this.#authorize(request, "validation:run", body.repositoryId);
        await this.#requireRepository(principal, body.repositoryId);
        return await this.#enqueue({ request, requestId, principal, type: "validation.run", repositoryId: body.repositoryId, payload: body });
      }
      if (method === "POST" && equalSegments(segments, ["v1", "merge-intents"])) {
        const body = mergeIntentInput(request.body);
        const principal = await this.#authorize(request, "merge:intent", body.repositoryId);
        await this.#requireRepository(principal, body.repositoryId);
        return await this.#enqueue({ request, requestId, principal, type: "merge.intent.create", repositoryId: body.repositoryId, payload: body });
      }
      if (method === "POST" && segments.length === 4 && segments[0] === "v1" && segments[1] === "merge-intents" && segments[3] === "approvals") {
        const intentId = identifier(segments[2], "intentId");
        const body = mergeApprovalInput(request.body, this.clock());
        const principal = await this.#authorize(request, "merge:approve", body.repositoryId);
        await this.#requireRepository(principal, body.repositoryId);
        return await this.#enqueue({
          request,
          requestId,
          principal,
          type: "merge.approval.record",
          repositoryId: body.repositoryId,
          payload: { ...body, intentId, approvedBy: principal.agentId },
        });
      }
      if (method === "POST" && segments.length === 4 && segments[0] === "v1" && segments[1] === "merge-intents" && segments[3] === "executions") {
        const intentId = identifier(segments[2], "intentId");
        const body = mergeExecutionInput(request.body);
        const principal = await this.#authorize(request, "merge:execute", body.repositoryId);
        await this.#requireRepository(principal, body.repositoryId);
        return await this.#enqueue({
          request,
          requestId,
          principal,
          type: "merge.execute",
          repositoryId: body.repositoryId,
          payload: { ...body, intentId },
        });
      }
      if (method === "GET" && segments.length === 3 && segments[0] === "v1" && segments[1] === "jobs") {
        const jobId = identifier(segments[2], "jobId");
        const principal = await this.#authorize(request, "job:read");
        const job = await this.store.job({ tenantId: principal.tenantId, jobId });
        if (!job) throw new ApiError(404, "job_not_found", "Job was not found.");
        return response(200, job, requestId);
      }
      throw new ApiError(404, "route_not_found", "Route was not found.");
    } catch (error) {
      const apiError = error instanceof ApiError
        ? error
        : new ApiError(500, "internal_error", "Request failed.");
      return response(apiError.status, { error: { code: apiError.code, message: apiError.message } }, requestId);
    }
  }

  async #authorize(request, scope, repositoryId = null) {
    const authorization = header(request.headers, "authorization");
    if (!authorization) throw new ApiError(401, "missing_authorization", "Authorization header is required.");
    const principal = await this.authorizer.authorize({ authorization, scope, repositoryId });
    if (!principal) throw new ApiError(403, "forbidden", "Credential does not grant required scope.");
    requiredString(principal.tenantId, "principal.tenantId");
    requiredString(principal.agentId, "principal.agentId");
    return principal;
  }

  async #requireRepository(principal, repositoryId) {
    const repository = await this.store.repository({ tenantId: principal.tenantId, repositoryId });
    if (!repository) throw new ApiError(404, "repository_not_found", "Repository was not found.");
    return repository;
  }

  async #enqueue({ request, requestId, principal, type, repositoryId, payload }) {
    const idempotencyKey = header(request.headers, "idempotency-key");
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key header is required and must contain at most 200 characters.");
    }
    const job = await this.store.enqueue({
      tenantId: principal.tenantId,
      agentId: principal.agentId,
      type,
      repositoryId,
      payload,
      idempotencyKey,
      now: this.clock(),
    });
    return response(202, job, requestId, { location: `/v1/jobs/${job.id}` });
  }
}

export class ControlPlaneStore {
  async repository(_options) { throw new Error("ControlPlaneStore.repository must be implemented."); }
  async job(_options) { throw new Error("ControlPlaneStore.job must be implemented."); }
  async enqueue(_options) { throw new Error("ControlPlaneStore.enqueue must be implemented."); }
  async claim(_options) { throw new Error("ControlPlaneStore.claim must be implemented."); }
  async heartbeat(_options) { throw new Error("ControlPlaneStore.heartbeat must be implemented."); }
  async complete(_options) { throw new Error("ControlPlaneStore.complete must be implemented."); }
  async fail(_options) { throw new Error("ControlPlaneStore.fail must be implemented."); }
}

export class CredentialBroker {
  async issue(_options) { throw new Error("CredentialBroker.issue must be implemented."); }
}

export class InMemoryControlPlaneStore extends ControlPlaneStore {
  #repositories = new Map();
  #jobs = new Map();
  #idempotency = new Map();

  putRepository(record) {
    object(record, "repository");
    const tenantId = requiredString(record.tenantId, "repository.tenantId");
    const id = identifier(record.id, "repository.id");
    this.#repositories.set(`${tenantId}\0${id}`, structuredClone(record));
    return structuredClone(record);
  }

  async repository({ tenantId, repositoryId }) {
    const value = this.#repositories.get(`${tenantId}\0${repositoryId}`);
    return value ? structuredClone(value) : null;
  }

  async job({ tenantId, jobId }) {
    const value = this.#jobs.get(`${tenantId}\0${jobId}`);
    return value ? structuredClone(value) : null;
  }

  async enqueue({ tenantId, agentId, type, repositoryId, payload, idempotencyKey, now }) {
    if (!JOB_TYPES.has(type)) throw new TypeError(`Unsupported job type: ${type}.`);
    const digest = createHash("sha256").update(stableJson({ type, repositoryId, payload })).digest("hex");
    const idempotencyId = `${tenantId}\0${agentId}\0${idempotencyKey}`;
    const existing = this.#idempotency.get(idempotencyId);
    if (existing) {
      if (existing.digest !== digest) throw new ApiError(409, "idempotency_conflict", "Idempotency key was reused with different input.");
      return this.job({ tenantId, jobId: existing.jobId });
    }
    const timestamp = now.toISOString();
    const job = {
      schemaVersion: "tabellio-job/v0.1",
      id: `job_${randomUUID()}`,
      tenantId,
      repositoryId,
      type,
      state: "queued",
      requestedBy: agentId,
      payload: structuredClone(payload),
      attempt: 0,
      lease: null,
      result: null,
      error: null,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#jobs.set(`${tenantId}\0${job.id}`, job);
    this.#idempotency.set(idempotencyId, { digest, jobId: job.id });
    return structuredClone(job);
  }

  async claim({ workerId, leaseMs, now, types = null }) {
    requiredString(workerId, "workerId");
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) throw new TypeError("leaseMs must be between 1000 and 3600000.");
    const allowedTypes = types ? new Set(types) : null;
    const candidates = [...this.#jobs.entries()]
      .filter(([, job]) => (job.state === "queued" || leaseExpired(job, now)) && (!allowedTypes || allowedTypes.has(job.type)))
      .sort((left, right) => left[1].createdAt.localeCompare(right[1].createdAt) || left[1].id.localeCompare(right[1].id));
    if (candidates.length === 0) return null;
    const [key, job] = candidates[0];
    const timestamp = now.toISOString();
    job.state = "running";
    job.attempt += 1;
    job.lease = { workerId, expiresAt: new Date(now.getTime() + leaseMs).toISOString() };
    job.error = null;
    job.updatedAt = timestamp;
    this.#jobs.set(key, job);
    return structuredClone(job);
  }

  async heartbeat({ tenantId, jobId, workerId, leaseMs, now }) {
    const job = this.#leasedJob({ tenantId, jobId, workerId });
    job.lease.expiresAt = new Date(now.getTime() + leaseMs).toISOString();
    job.updatedAt = now.toISOString();
    return structuredClone(job);
  }

  async complete({ tenantId, jobId, workerId, result, now }) {
    const job = this.#leasedJob({ tenantId, jobId, workerId });
    job.state = "succeeded";
    job.lease = null;
    job.result = structuredClone(result ?? null);
    job.error = null;
    job.completedAt = now.toISOString();
    job.updatedAt = job.completedAt;
    return structuredClone(job);
  }

  async fail({ tenantId, jobId, workerId, error, retry, now }) {
    const job = this.#leasedJob({ tenantId, jobId, workerId });
    job.state = retry ? "queued" : "failed";
    job.lease = null;
    job.error = { message: String(error).slice(0, 2_000), retryable: retry };
    job.completedAt = retry ? null : now.toISOString();
    job.updatedAt = now.toISOString();
    return structuredClone(job);
  }

  #leasedJob({ tenantId, jobId, workerId }) {
    const job = this.#jobs.get(`${tenantId}\0${jobId}`);
    if (!job) throw new ApiError(404, "job_not_found", "Job was not found.");
    if (job.state !== "running" || job.lease?.workerId !== workerId) {
      throw new ApiError(409, "lease_conflict", "Worker does not own active job lease.");
    }
    return job;
  }
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function repositoryProvisionInput(value) {
  exactObject(value, ["owner", "name", "private", "defaultBranch"], "repository request");
  return {
    owner: slug(value.owner, "repository request.owner"),
    name: slug(value.name, "repository request.name"),
    private: boolean(value.private, "repository request.private"),
    defaultBranch: branchName(value.defaultBranch, "repository request.defaultBranch"),
  };
}

function credentialInput(value) {
  exactObject(value, ["scopes", "ttlSeconds"], "credential request");
  if (!Array.isArray(value.scopes) || value.scopes.length === 0 || new Set(value.scopes).size !== value.scopes.length) {
    throw new ApiError(400, "invalid_request", "credential request.scopes must be a non-empty unique array.");
  }
  for (const scope of value.scopes) if (!GIT_SCOPES.has(scope)) throw new ApiError(400, "invalid_request", `Unsupported Git scope: ${scope}.`);
  if (!Number.isInteger(value.ttlSeconds) || value.ttlSeconds < 60 || value.ttlSeconds > 3600) {
    throw new ApiError(400, "invalid_request", "credential request.ttlSeconds must be between 60 and 3600.");
  }
  return { scopes: [...value.scopes].sort(), ttlSeconds: value.ttlSeconds };
}

function changeRequestInput(value) {
  exactObject(value, ["repositoryId", "sourceBranch", "targetBranch", "title", "draft"], "change-request request");
  const title = requiredString(value.title, "change-request request.title");
  if (title.length > 500) throw new ApiError(400, "invalid_request", "change-request request.title must contain at most 500 characters.");
  return {
    repositoryId: identifier(value.repositoryId, "change-request request.repositoryId"),
    sourceBranch: branchName(value.sourceBranch, "change-request request.sourceBranch"),
    targetBranch: branchName(value.targetBranch, "change-request request.targetBranch"),
    title,
    draft: boolean(value.draft, "change-request request.draft"),
  };
}

function validationInput(value) {
  exactObject(value, ["repositoryId", "baseCommit", "headCommit"], "validation request");
  return {
    repositoryId: identifier(value.repositoryId, "validation request.repositoryId"),
    baseCommit: oid(value.baseCommit, "validation request.baseCommit"),
    headCommit: oid(value.headCommit, "validation request.headCommit"),
  };
}

function mergeIntentInput(value) {
  exactObject(value, ["repositoryId", "changeRequestId", "headCommit"], "merge request");
  return {
    repositoryId: identifier(value.repositoryId, "merge request.repositoryId"),
    changeRequestId: identifier(value.changeRequestId, "merge request.changeRequestId"),
    headCommit: oid(value.headCommit, "merge request.headCommit"),
  };
}

function mergeApprovalInput(value, now) {
  exactObject(value, ["repositoryId", "headCommit", "expiresAt"], "merge approval request");
  const expiresAt = isoDate(value.expiresAt, "merge approval request.expiresAt");
  const lifetimeMs = Date.parse(expiresAt) - now.getTime();
  if (lifetimeMs <= 0 || lifetimeMs > 15 * 60 * 1000) {
    throw new ApiError(400, "invalid_request", "merge approval request.expiresAt must be within the next 15 minutes.");
  }
  return {
    repositoryId: identifier(value.repositoryId, "merge approval request.repositoryId"),
    headCommit: oid(value.headCommit, "merge approval request.headCommit"),
    expiresAt,
  };
}

function mergeExecutionInput(value) {
  exactObject(value, ["repositoryId", "headCommit", "approvalId"], "merge execution request");
  return {
    repositoryId: identifier(value.repositoryId, "merge execution request.repositoryId"),
    headCommit: oid(value.headCommit, "merge execution request.headCommit"),
    approvalId: identifier(value.approvalId, "merge execution request.approvalId"),
  };
}

function repositoryRequestId(tenantId, owner, name) {
  const digest = createHash("sha256").update(`${tenantId}\0${owner}\0${name}`).digest("hex").slice(0, 24);
  return `repo_${digest}`;
}

function response(status, body, requestId, extraHeaders = {}) {
  return {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId, ...extraHeaders },
    body,
  };
}

function header(headers = {}, name) {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) return typeof value === "string" ? value : null;
  }
  return null;
}

function equalSegments(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError(400, "invalid_path", "Path contains invalid encoding.");
  }
}

function exactObject(value, keys, path) {
  object(value, path);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new ApiError(400, "invalid_request", `${path} must contain exactly: ${expected.join(", ")}.`);
}

function object(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ApiError(400, "invalid_request", `${path} must be an object.`);
  return value;
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "") throw new ApiError(400, "invalid_request", `${path} must be a non-empty string.`);
  return value.trim();
}

function identifier(value, path) {
  const result = requiredString(value, path);
  if (!/^[A-Za-z0-9._-]+$/.test(result)) throw new ApiError(400, "invalid_request", `${path} contains unsupported characters.`);
  return result;
}

function slug(value, path) {
  const result = requiredString(value, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(result)) throw new ApiError(400, "invalid_request", `${path} must be a safe repository slug.`);
  return result;
}

function branchName(value, path) {
  const result = requiredString(value, path);
  if (result.length > 255 || result.startsWith("-") || result.includes("..") || /[\s~^:?*[\\]/.test(result)) {
    throw new ApiError(400, "invalid_request", `${path} must be a safe Git branch name.`);
  }
  return result;
}

function oid(value, path) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) throw new ApiError(400, "invalid_request", `${path} must be a Git object ID.`);
  return value;
}

function isoDate(value, path) {
  const result = requiredString(value, path);
  if (Number.isNaN(Date.parse(result))) throw new ApiError(400, "invalid_request", `${path} must be an ISO date-time.`);
  return result;
}

function boolean(value, path) {
  if (typeof value !== "boolean") throw new ApiError(400, "invalid_request", `${path} must be a boolean.`);
  return value;
}

function requiredMethod(value, method) {
  if (!value || typeof value[method] !== "function") throw new TypeError(`${method} must be implemented.`);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function leaseExpired(job, now) {
  return job.state === "running" && job.lease && Date.parse(job.lease.expiresAt) <= now.getTime();
}
