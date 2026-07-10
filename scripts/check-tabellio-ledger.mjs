#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateLedgerSnapshot } from "./lib/ledger-provider.mjs";

const args = parseArgs(process.argv.slice(2));
const ledgerPath = resolve(args.ledger ?? "tabellio-ledger.json");
const blockers = [];
let snapshot = null;
try {
  snapshot = JSON.parse(await readFile(ledgerPath, "utf8"));
  validateLedgerSnapshot(snapshot);
} catch (error) {
  blockers.push(error instanceof Error ? error.message : String(error));
}
const result = {
  ok: blockers.length === 0,
  status: blockers.length === 0 ? "tabellio_ledger_ready" : "blocked",
  checkedAt: new Date().toISOString(),
  ledgerPath,
  schemaPath: "schemas/ledger-snapshot.schema.json",
  summary: snapshot ? {
    schemaVersion: snapshot.schemaVersion ?? null,
    provider: snapshot.provider?.id ?? null,
    checkpointCount: Array.isArray(snapshot.checkpoints) ? snapshot.checkpoints.length : null,
  } : null,
  blockers,
};
if (!result.ok) process.exitCode = 1;
console.log(JSON.stringify(result, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--ledger") throw new Error(`Unknown argument: ${argv[index]}`);
    const value = argv[++index];
    if (!value) throw new Error("--ledger requires a value.");
    parsed.ledger = value;
  }
  return parsed;
}
