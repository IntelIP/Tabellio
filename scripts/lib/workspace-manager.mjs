import { resolve } from "node:path";

export class WorkspaceManager {
  constructor({ store, root }) {
    this.store = store;
    this.root = resolve(root);
  }

  async create({ runId, branch, startPoint }) {
    const safeRunId = validateSegment(runId, "runId");
    return this.store.createWorkspace({
      path: resolve(this.root, safeRunId),
      branch,
      startPoint,
    });
  }

  async remove({ runId, force = false }) {
    const safeRunId = validateSegment(runId, "runId");
    return this.store.removeWorkspace({ path: resolve(this.root, safeRunId), force });
  }
}

function validateSegment(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === "." || value === "..") {
    throw new Error(`${name} must be a safe path segment.`);
  }
  return value;
}
