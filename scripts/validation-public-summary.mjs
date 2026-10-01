#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
// Emit only public manifest IDs and closed status/reason values. Never forward private output.
let status = 'blocked';
const validators = [];
try {
  const value = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../tabellio.validation.json', import.meta.url), 'utf8'));
  if (value.ok === true && ['passed', 'failed', 'blocked'].includes(value.result?.status)) {
    status = value.result.status;
    for (const expected of manifest.validators) {
      const found = value.result.validators?.find(item => item?.id === expected.id);
      if (!found || !['passed', 'failed', 'blocked', 'skipped'].includes(found.status)) continue;
      const reasons = ['command_failed', 'validator_command_failed', 'command_error', 'command_timed_out', 'evidence_missing', 'evidence_invalid', 'evidence_reported_failed', 'evidence_reported_blocked', 'fail_fast'];
      const command = value.result.commands?.find(item => item?.id === expected.id);
      validators.push({ id: expected.id, status: found.status,
        reasons: Array.isArray(found.reasons) ? found.reasons.filter(reason => reasons.includes(reason)) : [],
        testFailures: typeof command?.stdout === 'string' ? (command.stdout.match(/^not ok \d+ /gm) ?? []).length : 0 });
    }
  }
} catch {}
await writeFile(process.argv[3], JSON.stringify({ status, validators }) + '\n', { mode: 0o600 });
