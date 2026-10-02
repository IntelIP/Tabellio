import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { evaluateLineage } from "../lib/provenance-ledger.mjs";
import { provenanceBenchmarkCases } from "./provenance-cases.mjs";

function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function evaluateCase(scenario, evaluate) {
  try {
    const actual = evaluate(scenario.lineage, scenario.options)?.status;
    return ["passed", "failed", "blocked"].includes(actual) ? actual : "error";
  } catch (error) {
    return scenario.expectedError && error?.message === scenario.expectedError ? "rejected" : "error";
  }
}

function measureCase(scenario, iterations, evaluate) {
  const samples = [];
  const outcomes = {};
  for (let index = 0; index < iterations; index += 1) {
    // Keep mutation by the system under test from contaminating later trials.
    const input = structuredClone(scenario);
    const start = performance.now();
    const actual = evaluateCase(input, evaluate);
    samples.push(performance.now() - start);
    outcomes[actual] = (outcomes[actual] ?? 0) + 1;
  }
  const passed = outcomes.passed ?? 0;
  return {
    id: scenario.id, expected: scenario.expected,
    observations: scenario.lineage.observations.length, samples: iterations, outcomes,
    mismatches: iterations - (outcomes[scenario.expected] ?? 0),
    invalidPasses: scenario.expected === "passed" ? 0 : passed,
    validCaseRejections: scenario.expected === "passed" ? iterations - passed : 0,
    latencyMs: { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) },
  };
}

export function runProvenanceBenchmark({ iterations = 25, evaluate = evaluateLineage } = {}) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 200) throw new Error("Iterations must be an integer from 1 to 200.");
  const cases = provenanceBenchmarkCases();
  const fixtureDigest = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
  const results = cases.map((scenario) => measureCase(scenario, iterations, evaluate));
  const mismatches = results.reduce((sum, item) => sum + item.mismatches, 0);
  return {
    schemaVersion: "tabellio-provenance-benchmark/v0.1",
    status: mismatches ? "failed" : "passed",
    fixtureDigest,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    scope: "Synthetic in-process lineage policy evaluation; no provider, database, scanner, publication, or GitHub baseline execution.",
    limitations: ["Repeated fixtures are not independent security trials or customer outcomes.", "Latency excludes fixture construction, cloning, Git, PostgreSQL, network and presentation.", "No comparison or superiority claim; the matched GitHub/CI pilot remains unmeasured.", "Source authentication, signatures, sandbox isolation and security-scanner effectiveness are not tested."],
    totals: { cases: cases.length, evaluations: cases.length * iterations, mismatches, invalidPasses: results.reduce((sum, item) => sum + item.invalidPasses, 0), validCaseRejections: results.reduce((sum, item) => sum + item.validCaseRejections, 0) },
    results,
  };
}
