#!/usr/bin/env node
import { parseOptionPairs, assertAllowedOptions, positiveNumberOption, reportCliError } from "./lib/cli-options.mjs";
import { tabellioRunnerState } from "./lib/runner-identity.mjs";
import { runProvenanceBenchmark } from "./benchmarks/provenance-benchmark.mjs";

try {
  const options = parseOptionPairs(process.argv.slice(2));
  assertAllowedOptions(options, ["iterations"]);
  const iterations = options.iterations === undefined ? 25 : positiveNumberOption(options.iterations, "--iterations");
  const runner = await tabellioRunnerState();
  const report = { ...runProvenanceBenchmark({ iterations }), runner };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) {
  reportCliError(error);
}
