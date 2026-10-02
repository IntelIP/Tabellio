import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLineage } from "../scripts/lib/provenance-ledger.mjs";
import { provenanceBenchmarkCases } from "../scripts/benchmarks/provenance-cases.mjs";
import { runProvenanceBenchmark } from "../scripts/benchmarks/provenance-benchmark.mjs";

const execute = promisify(execFile);

test("benchmark matches declared fault expectations and reports bounded timings", () => {
  const report = runProvenanceBenchmark({ iterations: 2 });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.totals, { cases: 30, evaluations: 60, mismatches: 0, invalidPasses: 0, validCaseRejections: 0 });
  assert.equal(new Set(report.results.map((item) => item.id)).size, 30);
  for (const item of report.results) {
    assert.equal(Object.values(item.outcomes).reduce((sum, count) => sum + count, 0), 2);
    assert.ok(Number.isFinite(item.latencyMs.p50) && item.latencyMs.p50 >= 0);
    assert.ok(item.latencyMs.p95 >= item.latencyMs.p50);
    assert.ok(item.latencyMs.max >= item.latencyMs.p95);
  }
});

test("benchmark fails when the gate always passes or always blocks", () => {
  const unsafe = runProvenanceBenchmark({ iterations: 1, evaluate: () => ({ status: "passed" }) });
  assert.equal(unsafe.status, "failed");
  assert.equal(unsafe.totals.invalidPasses, 27);
  const unavailable = runProvenanceBenchmark({ iterations: 1, evaluate: () => ({ status: "blocked" }) });
  assert.equal(unavailable.status, "failed");
  assert.equal(unavailable.totals.validCaseRejections, 3);
});

test("unexpected exceptions and unknown output never count as correct rejection", () => {
  for (const evaluate of [() => { throw new Error("unexpected failure"); }, () => { throw null; }, () => ({ status: "unknown" }), () => undefined]) {
    const report = runProvenanceBenchmark({ iterations: 1, evaluate });
    assert.equal(report.status, "failed");
    assert.equal(report.totals.mismatches, 30);
    assert.ok(report.results.every((item) => item.outcomes.error === 1));
  }
});

test("fixture identities are reproducible and evaluator mutation cannot leak between trials", () => {
  const first = runProvenanceBenchmark({ iterations: 1 });
  const second = runProvenanceBenchmark({ iterations: 2, evaluate: (lineage, options) => {
    const result = evaluateLineage(lineage, options);
    lineage.observations.length = 0;
    return result;
  } });
  assert.equal(first.fixtureDigest, second.fixtureDigest);
  assert.equal(second.status, "passed");
  const fixtures = provenanceBenchmarkCases();
  fixtures[0].lineage.observations.length = 0;
  assert.equal(provenanceBenchmarkCases()[0].lineage.observations.length, 8);
});

test("benchmark rejects invalid or unbounded iteration counts", () => {
  for (const iterations of [0, -1, 0.5, NaN, Infinity, 201, "2"]) assert.throws(() => runProvenanceBenchmark({ iterations }), /Iterations/);
});

test("benchmark CLI emits a standalone report and rejects unsupported arguments", async () => {
  const script = fileURLToPath(new URL("../scripts/benchmark-provenance.mjs", import.meta.url));
  const { stdout } = await execute(process.execPath, [script, "--iterations", "1"]);
  assert.equal(JSON.parse(stdout).totals.evaluations, 30);
  for (const args of [["--out", "unused.json"], ["--iterations", "201"], ["--iterations", "1", "--iterations", "2"]]) {
    await assert.rejects(execute(process.execPath, [script, ...args]), (error) => error.code === 1 && JSON.parse(error.stderr).ok === false);
  }
});
