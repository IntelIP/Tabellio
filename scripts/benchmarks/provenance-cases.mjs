import { assembleLineage, candidateIdentity } from "../lib/provenance-ledger.mjs";
import { sampleObservations } from "../../examples/provenance/sample.mjs";

const BENCHMARK_TIME = "2026-09-12T12:00:02.000Z";
const observedAt = "2026-09-12T12:00:00.000Z";
const candidate = candidateIdentity({ projectKey: "SAMPLE", repositoryId: "github.com/example/tabellio", baseCommit: "a".repeat(40), headCommit: "b".repeat(40), mergeBase: "a".repeat(40) });
const kinds = ["task", "run", "commit", "checkpoint", "pull_request", "validation", "review", "security"];

// Expectations are declared independently of the evaluator under test. Each call
// constructs fresh data; repeats are measurements, not independent security trials.
export function provenanceBenchmarkCases() {
  const cases = [];
  const add = (id, expected, mutate = () => {}, options = {}) => {
    const observations = sampleObservations(candidate, observedAt);
    mutate(observations);
    cases.push({ id, expected, lineage: assembleLineage({ candidate, observations }), options: { now: BENCHMARK_TIME, ...options } });
  };
  add("valid", "passed");
  add("reordered", "passed", (items) => items.reverse());
  add("duplicate-delivery", "passed", (items) => items.push(structuredClone(items[0])));
  for (const kind of kinds) add(`missing-${kind}`, "blocked", (items) => items.splice(items.findIndex((item) => item.kind === kind), 1));
  for (const kind of ["validation", "review", "security"]) {
    add(`failed-${kind}`, "failed", (items) => { items.find((item) => item.kind === kind).status = "failed"; });
    add(`unexecuted-${kind}`, "blocked", (items) => { items.find((item) => item.kind === kind).status = "present"; });
  }
  for (const [key, value] of Object.entries({ headCommit: "c".repeat(40), baseCommit: "c".repeat(40), mergeBase: "c".repeat(40), repositoryId: "github.com/example/other", projectKey: "OTHER" })) {
    add(`changed-${key}`, "blocked", undefined, { candidate: candidateIdentity({ ...candidate, [key]: value }) });
  }
  add("expired", "blocked", undefined, { now: "2026-09-14T12:00:00Z" });
  add("future-observation", "blocked", (items) => { items[0].observedAt = "2026-09-13T12:00:00Z"; });
  add("conflicting-delivery", "blocked", (items) => items.push({ ...structuredClone(items[0]), observedAt: "2026-09-12T12:00:01Z" }));
  add("provider-outage", "blocked", (items) => {
    Object.assign(items.find((item) => item.kind === "validation"), { status: "blocked", metadata: { reason: "source_unavailable" } });
  });
  add("inferred-link", "blocked", (items) => { items.find((item) => item.kind === "validation").links[0].basis = "inferred"; });
  add("missing-linked-source", "blocked", (items) => { items.find((item) => item.kind === "validation").links[0].sourceId = "missing-build"; });
  add("wrong-evidence-candidate", "blocked", (items) => { items[0].candidate = candidateIdentity({ ...candidate, headCommit: "d".repeat(40) }); });
  add("tampered-lineage", "rejected");
  const tampered = cases.at(-1);
  tampered.lineage.observations[0].status = "failed";
  tampered.expectedError = "Lineage integrity mismatch.";
  return cases;
}
