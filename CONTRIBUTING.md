# Contributing

Help teams try WritSet, connect one repository, and understand their coding agents' context.
Keep changes Git-native, agent-agnostic, dependency-light, deterministic before
AI-assisted, and default-deny for protected external actions.

## Source-checkout setup

Use Node.js 20 or later, npm, Git 2.38 or later, and Entire 0.7.7 or later.
CI uses Node.js 22.23.1. PostgreSQL client/server binaries are required for the
provenance integration suite; git-spice 0.18 or later is needed for stack work.
The package has no runtime npm dependencies. Named npm scripts below belong to
this checkout; installed users start at [Try WritSet](docs/try-tabellio.md).
The published package and CLI commands still use the earlier Tabellio name.

```bash
git clone https://github.com/IntelIP/WritSet.git
cd WritSet
entire enable --agent codex --project --skip-push-sessions
node scripts/tabellio-preflight.mjs --profile agent
```

Preflight is read-only. Review missing Codex hook trust through `/hooks`.
Run `entire doctor` only with explicit operator approval for repair.
Preserve any existing edits and use an isolated task branch when needed.

## Establish a baseline and verify

Use the same pinned scanner setup and shared checks as CI:

The scanner installer supports Apple silicon macOS (`Darwin-arm64`) and
x86-64 Linux (`Linux-x86_64`). On Intel macOS or another platform, run this
baseline in an x86-64 Linux development environment, such as a virtual machine.
The required GitHub Actions checks also run on x86-64 Linux. Use the pinned
versions in `.buildkite/scripts/security-tools.sh`; keep the security checks enabled.

```bash
. .buildkite/scripts/security-tools.sh
npm run docs:check
npm run check
npm run quality:changed-code
npm pack --dry-run
```

The scanner installer verifies its download and uses a temporary tool directory.
`quality:changed-code` includes real PostgreSQL coverage; put `psql`, `initdb`,
and `pg_ctl` on `PATH`. Run focused tests for changed behavior and `node --check`
on changed JavaScript. After JavaScript removals, run `npm run quality:dead-code`.
For cross-file removals, refresh Graphify, inspect callers, and verify registrations.

`docs:check` checks local links, required entry documents, current installation
versions, entry-file limits, and identical native/packaged PR templates. It does
not contact websites or score prose. Historical release versions remain valid.
Both GitHub Actions and Buildkite enforce it through `npm run check`.

Generate safe review evidence when applicable:

```bash
node scripts/write-tabellio-evidence-envelope.mjs --out /tmp/tabellio-pr-evidence.json
node scripts/check-tabellio-evidence-envelope.mjs --evidence /tmp/tabellio-pr-evidence.json
node scripts/check-tabellio-external-actions.mjs --evidence /tmp/tabellio-pr-evidence.json
```

The [validation manifest](tabellio.validation.json), validation refs, and
[durable review cycle](docs/review-loop.md) decide passing state for an exact code
version. Command output or a handoff note does not replace those records.
Before review, run the committed [exact-head validation](docs/validation-runner.md)
and confirm the required hosted checks. Fresh hosted workers need
[genuine private checkpoint proof](docs/checkpoint-proof-handoff.md).

## One work-plan and handoff format

Follow **initialize → select one task → implement → verify → review → human decision**.
Keep one active task. Save the plan beside the task's existing acceptance or review
record, using safe repository-relative paths or authorized private artifact references.
Update the same note when handing off; do not create a second approval system.

```markdown
Objective: Who benefits and what problem this solves.
Scope: Allowed behavior and files; exclusions and dependencies.
Expected behavior: Observable completion criteria, including failure cases.
Verification commands: Required commands and pass/fail/blocked/skipped results.
Code version: Repository, branch, full commit ID, base, and dirty state.
Evidence references: Existing manifest, validation/review record, and safe artifacts.
Blockers: Missing access or unresolved failures; attempts and their results.
Decisions: Tradeoffs and the source of any explicit authority.
Next step: One action, responsible person/role, and human decision if required.
```

If a check fails, return to the relevant implementation, setup, or scope fix.
If access is missing, save the exact blocker and hand off the access decision.
After three consecutive failed attempts without material progress, stop blind
retries and hand off the cause, attempted fixes, and next useful action.
A changed commit, moved base, or changed input requires fresh applicable evidence.
Remove only task-owned temporary files; preserve unrelated edits and private refs.

## Pull requests and review

Use the [packaged PR template](templates/pull_request_template.md).
GitHub loads the identical `.github/pull_request_template.md` copy for this repository.
State the expected behavior, changed files, commands, exact code version, evidence,
external-action authority, and remaining blockers. An agent's claim does not grant readiness.

Request extra review for changes to evidence fields, action classes, default-deny
behavior, approvals, control-ref allow lists, credentials, or worker isolation.
Keep secrets, raw transcripts, private provider/account data, and local machine
paths out of public reports. Use [private security reporting](SECURITY.md) for vulnerabilities.
Review clearance and human approval remain separate from passing checks.

## Documentation and release work

Use short current-state sections, comparisons where useful, and working commands.
Clearly label synthetic fixtures and unsupported claims. Keep operator procedures
out of the main README and completed ticket records in [history](docs/historical/README.md).

Release operators follow [Operate and release](docs/operate-and-release.md), the
[platform check](docs/github-code-storage-boundary.md), and
[product validation](docs/product-validation.md). Tag, publish, merge, and deployment
authority remain separate decisions. Keep Apache-2.0 unchanged.
