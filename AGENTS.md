# Agent entry point

WritSet helps teams understand and track context across coding-agent work.
Serve teams trying and connecting WritSet before adding operator detail.
The package is `@intelip/writset`; `writset-*` commands have compatible `tabellio-*` aliases.
Existing configuration names and stored formats remain compatible.

## Find the right guide

- [README](README.md): product, published demo, limits, and help.
- [Documentation home](docs/README.md): try, connect, contribute, or operate.
- [Contributing](CONTRIBUTING.md): setup, verification, work-plan and handoff format.
- [Harness workflow](docs/harness.md): task state, failure routes, and lesson mapping.
- `scripts/` and `scripts/lib/`: CLIs and shared implementation.
- `schemas/`, `migrations/`, `examples/`: contracts, storage changes, and fixtures.
- Root `tabellio.*.validation.json` and `.tabellio/`: acceptance and validator authority.
- `reports/`: bounded evidence; `docs/historical/`: previous plans and review snapshots.
- `.github/` and `.buildkite/`: hosted checks using shared scripts.

## Initialize before implementation

1. Read the request, nearest instructions, and the relevant current guide.
2. Inspect status, branch, remotes, worktrees, and diff names. Preserve existing edits.
3. Use one isolated task branch when the current checkout contains unrelated work.
4. Use Node.js 20+, npm, Git 2.38+, and Entire 0.7.7+. CI uses Node.js 22.23.1.
5. Check `node scripts/tabellio-preflight.mjs --profile agent` and `npm run check`.
6. Establish the passing baseline or save the specific missing-access blocker.

PostgreSQL client/server tools are needed for provenance integration checks.
Use the pinned scanner setup in [Contributing](CONTRIBUTING.md). git-spice 0.18+
is needed for stack work. Preflight is read-only; `entire doctor` requires explicit
operator repair approval. Trust Codex hooks through `/hooks` when preflight directs it.

## Select one task

Follow initialize → select one task → implement → verify → review → human decision.
Write its objective, allowed files/behavior, completion criteria, and required checks
using the contributor format. Keep one active task; finish or hand it off before
starting another. Avoid runtime, schema, migration, or manifest changes for docs-only work.

## Verify the change

| Change | Required checks |
| --- | --- |
| All changes | `npm run check`; `npm run quality:changed-code`; `npm pack --dry-run` |
| Docs, entry files, templates | `npm run docs:check`; inspect commands and rendered Markdown |
| Installation or first-use instructions | Clean consumer install and documented demo |
| JavaScript changes | Focused behavior tests and `node --check` on changed scripts |
| JavaScript removals | `npm run quality:dead-code`; inspect callers and registrations |
| Cross-file removals | Refresh Graphify for relationships, then verify current source |
| Product or acceptance changes | Committed exact-head validation and required hosted checks |
| Provenance/security changes | Existing PostgreSQL and pinned scanner checks; see current guides |

Failed checks return to the relevant fix. Never call skipped or blocked checks passed.
Use existing manifests, validation refs, and durable review records as the authority.
New code, base movement, or changed inputs can invalidate a previous passing result.

## Authority and data

Keep public `origin` limited to code branches and approved tags. Keep private
checkpoints, transcripts, validation, and review state on customer-owned storage.
Do not retain credentials, raw prompts, provider bodies, or private account data
in notes, packets, issues, logs, or PRs. Follow [data boundaries](tabellio.data-boundary.json).
Merge, publication, releases, deployment, migrations, infrastructure, DNS, hosting,
billing, live-money, credentialed reads, secret-value reads, and destructive actions
need explicit authority. Checks and notes grant no approval. Never bypass gates.
Plane is a legacy import capability. IntelIP uses AgentShift; no adapter is included.

## Recover and hand off

Resume from the task's saved code version, decisions, check artifacts, blockers,
and next step. Compare them with current Git and provider state before reusing readiness.
Reuse [agent-run state](docs/agent-run-lifecycle.md), [review records](docs/review-loop.md),
and [validation results](docs/validation-runner.md); notes are navigation, not approval.
Save missing access immediately. After three consecutive failed attempts without
material progress, stop retries and hand off the cause, attempted fixes, and next decision.
Remove only task-owned temporary files. Never reset others' changes or delete
private checkpoint history. Leave a clean scoped commit or an explicit unfinished-work
handoff using [Contributing](CONTRIBUTING.md).
