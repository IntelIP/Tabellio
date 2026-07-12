export class JobWorker {
  constructor({ queue, handlers, workerId, leaseMs = 60_000, maxAttempts = 3, clock = () => new Date() }) {
    requiredMethod(queue, "claim");
    requiredMethod(queue, "heartbeat");
    requiredMethod(queue, "complete");
    requiredMethod(queue, "fail");
    if (typeof handlers !== "object" || handlers === null || Array.isArray(handlers)) throw new TypeError("handlers must be an object.");
    requiredString(workerId, "workerId");
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) throw new TypeError("leaseMs must be between 1000 and 3600000.");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new TypeError("maxAttempts must be between 1 and 100.");
    this.queue = queue;
    this.handlers = handlers;
    this.workerId = workerId;
    this.leaseMs = leaseMs;
    this.maxAttempts = maxAttempts;
    this.clock = clock;
  }

  async runOnce() {
    const types = Object.keys(this.handlers);
    const job = await this.queue.claim({ workerId: this.workerId, leaseMs: this.leaseMs, now: this.clock(), types });
    if (!job) return null;
    const handler = this.handlers[job.type];
    if (typeof handler !== "function") {
      return this.queue.fail({
        tenantId: job.tenantId,
        jobId: job.id,
        workerId: this.workerId,
        error: `No handler registered for ${job.type}.`,
        retry: false,
        now: this.clock(),
      });
    }
    try {
      const result = await handler(structuredClone(job), {
        heartbeat: () => this.queue.heartbeat({
          tenantId: job.tenantId,
          jobId: job.id,
          workerId: this.workerId,
          leaseMs: this.leaseMs,
          now: this.clock(),
        }),
      });
      return await this.queue.complete({
        tenantId: job.tenantId,
        jobId: job.id,
        workerId: this.workerId,
        result,
        now: this.clock(),
      });
    } catch (error) {
      return this.queue.fail({
        tenantId: job.tenantId,
        jobId: job.id,
        workerId: this.workerId,
        error: error instanceof Error ? error.message : String(error),
        retry: job.attempt < this.maxAttempts,
        now: this.clock(),
      });
    }
  }
}

function requiredMethod(value, method) {
  if (!value || typeof value[method] !== "function") throw new TypeError(`${method} must be implemented.`);
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${path} must be a non-empty string.`);
}
