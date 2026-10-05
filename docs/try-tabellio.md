# Try Tabellio

Run the published package in a new directory to see how a code review can retain
its source evidence and reject stale or missing proof. This sample needs no
provider account or credentials.

## Requirements

Use macOS or Linux as a regular user, Node.js 20 or later, npm, and Git 2.38 or later.
Put PostgreSQL client **and server** binaries on `PATH`: `psql`, `createdb`, `initdb`, and
`pg_ctl`. The documented macOS run used PostgreSQL 14.15 and Node.js 26.3.1;
repository CI uses Node.js 22.23.1. A client-only installation is insufficient.

For a Homebrew PostgreSQL installation on macOS or a packaged PostgreSQL
installation on Linux, locate its binary directory with `pg_config --bindir`.
If it is missing from your path, add it in this shell:

```bash
export PATH="$(pg_config --bindir):$PATH"
```

Internet access is required for installation. No existing database is used.
Entire and git-spice are integration tools, not prerequisites for this sample.

## Installed-package workflow

In a new directory, run:

```bash
npm install --save-dev @intelip/tabellio@0.7.0
npx tabellio-version --expect-version 0.7.0
npx tabellio-provenance-demo
```

The version receipt identifies `@intelip/tabellio` and `packageVersion: "0.7.0"`.
The demo receipt ends with `status: "passed"` and `cleanup: "passed"`. Its failure
matrix lists expected and actual decisions. A moved base, missing independent
security evidence, and changed replay inputs must remain blocked.

To retain the full receipt in this consumer directory:

```bash
npx tabellio-provenance-demo --out demo-receipt.json
```

Git operations and the temporary local database are real. Plane, Entire, GitHub,
Buildkite, and security records are synthetic. The GitHub publisher uses a fake
local status transport. This proves no live-provider access, adoption, or security
scanner effectiveness. Zero model/cloud calls describe this sample only.

## Cleanup and failures

The demo stops its server and removes the temporary repository, cluster, and
socket directory after success or failure. It leaves your installed package and
any receipt requested with `--out` in the consumer directory.

If setup fails, read the receipt's failure and cleanup fields. Check the named
binary and its `PATH`; do not supply credentials or point the sample at an
application database. PostgreSQL refuses to initialize a cluster as root.
If cleanup reports a failure, preserve the named task-owned directory for recovery
and stop its server before removing it. Never remove another project's files.

## Next routes

- [Connect a real repository](getting-started.md) for genuine checkpoints and contracts.
- [Contribute](../CONTRIBUTING.md) for source-checkout setup and required checks.
- [Operate and release](operate-and-release.md) for sharing and protected actions.
- [Documentation home](README.md) for all current guides.
