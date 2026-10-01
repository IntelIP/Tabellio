#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
// Never forward checkpoint metadata, errors, command output or arbitrary fields.
let status = 'blocked';
try {
  const value = JSON.parse(await readFile(process.argv[2], 'utf8'));
  if (value.ok === true && ['passed', 'failed', 'blocked'].includes(value.result?.status)) status = value.result.status;
} catch {}
await writeFile(process.argv[3], JSON.stringify({ status }) + '\n', { mode: 0o600 });
