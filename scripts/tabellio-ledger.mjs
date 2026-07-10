#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { repositoryIdentity } from "./lib/repository-identity.mjs";
import { EntireLedgerProvider } from "./providers/entire-ledger-provider.mjs";
import { NativeGitStore } from "./providers/native-git-store.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  const repoPath = resolve(options.repo ?? process.cwd());
  const store = await NativeGitStore.open(repoPath);
  const provider = await EntireLedgerProvider.open(store.repoPath, {
    binary: options.binary ?? process.env.TABELLIO_ENTIRE_BIN ?? "entire",
  });
  const snapshot = await provider.snapshot({
    repositoryId: await repositoryIdentity(store, options.repoId),
    baseRevision: options.base ?? "main",
    headRevision: options.head ?? "HEAD",
  });
  const output = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
  }
  process.stdout.write(output);
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
  }, null, 2));
}

function parseArgs(argv) {
  const parsed = {};
  const aliases = new Map([
    ["--repo", "repo"], ["--repo-id", "repoId"], ["--base", "base"],
    ["--head", "head"], ["--out", "out"], ["--binary", "binary"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = aliases.get(argv[index]);
    if (!key) throw new Error(`Unknown argument: ${argv[index]}`);
    const value = argv[++index];
    if (!value) throw new Error(`${argv[index - 1]} requires a value.`);
    parsed[key] = value;
  }
  return parsed;
}
