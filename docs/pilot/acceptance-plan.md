# Core pilot hardening and acceptance

Status: proposed execution gates. This is not an enterprise certification or a
replacement for explicit merge/release authority. SSO, billing, multi-tenant
hosting, and the historical PR-less merge UI are outside this pilot.

## Establish the baseline

Record the exact source commit, clean/dirty runner identity, package version,
Node/Git/PostgreSQL/scanner versions, host platform, commands, outcomes, and skipped
checks. A passing unit suite with skipped integration checks is partial evidence.
Keep machine-specific receipts outside the repository. Never commit credentials,
raw provider payloads, private transcripts, or customer code in benchmark reports.

Supported pilot prerequisites are Node >=20, Git, PostgreSQL server/client tools,
and the pinned Gitleaks/ast-grep versions in the security-tool installer. Local
PostgreSQL fixtures use a disposable private socket/cluster, not a production DB.

From an exact source checkout:

```sh
npm run check
node scripts/demo-provenance.mjs --verify-storage-tests true
npm run tabellio:provenance:security:check
npm run benchmark:provenance -- --iterations 25
npm run quality:changed-code
npm pack --dry-run --json --ignore-scripts
```

The security check requires actual scanners and PostgreSQL; absence is blocked,
not a pass. Quality coverage also requires PostgreSQL. Run `npm pack` and install
the candidate tarball with `--ignore-scripts` in a clean external project, then
invoke its `tabellio-version` and `tabellio-provenance-demo` binaries. A tarball
check is not proof of registry publication. Do not publish to test installation.

## Reproducible policy benchmark

`npm run benchmark:provenance -- --iterations 25` writes JSON to stdout and exits
nonzero on any expectation mismatch. Redirect output only to a new artifact path
outside source inputs. The report records fixture digest, runner identity and
fingerprint, runtime, each expected decision, actual counts, and nearest-rank
p50/p95/max elapsed milliseconds. It makes no network calls or provider writes.

The 30 cases cover valid evidence, ordering and duplicate delivery, all eight
required evidence categories missing, failed/unexecuted required checks, moved
head/base/merge-base/repository/project, expiration/future timestamps, conflicting
observations, provider outage, inferred/dangling links, mismatched candidate facts,
and tampering. Only the specific integrity rejection expected by the tamper case
counts as correct; unexpected exceptions fail the benchmark. Tests verify that
always-pass and always-block evaluators cannot pass the harness.

The timed section is **only in-process lineage evaluation**, including integrity
verification. Fixture construction, cloning, Git, database operations, scanners,
network, publication, and presentation are excluded. No warm-up is discarded.
Fixtures are synthetic and reused; 750 evaluations are 30 scenarios repeated 25
times, not 750 independent security trials. No statistical security reliability or
GitHub superiority follows. Peak memory and infrastructure costs are unmeasured.
Digest integrity does not authenticate a malicious evidence producer.

## Gate matrix

| Gate | Required evidence | Current scope/status |
| --- | --- | --- |
| Policy regression | Full unit suite plus benchmark with zero mismatches | Runnable locally; record each candidate's actual result |
| Persistence/recovery | Demo with storage tests, restart, fresh-store replay, unchanged sources and cleanup | Implemented fixture workflow; run explicitly |
| Bounded scanners | Required scanner fixtures and immutable-tree demo | Limited rule coverage; no comprehensive security guarantee |
| Distribution | External tarball install, identity and installed demo | Must be independently executed per candidate |
| Runtime isolation | Disposable untrusted-code worker, resource limits, approved egress and scoped identity | Unqualified; worktrees are not sandboxes |
| Live integrations | Real authorized provider journey, permissions/outages/retries, duplicate/concurrent publication | Not proved by synthetic demo; requires chosen environment and scoped access |
| Operations | Control-repository backup/restore drill, monitoring, durable artifact retrieval, incident runbook | Requires operator-owned infrastructure and acceptance |
| Comparative benefit | Matched GitHub/CI pilot and reviewer measurements | Unmeasured; protocol below |
| Release | Fresh independent review, exact-head CI, approved merge, tag/package publication and public-install verification | Separate approval; draft PR is not release |

## Matched comparison protocol

A is the team's properly configured GitHub/CI and review stack. B is exactly A plus
Tabellio. Keep source revisions, required checks, expected check providers, stale
approval policy, validators, reviewers and permissions equivalent. Do not weaken
GitHub to create an artificial advantage. Record where both systems already block
invalid evidence; measure only incremental coverage or effort reduction.

Start with 20–30 representative PRs across at least three repositories. Use a
held-out fault set authored before running the comparison; rotate reviewer order
to reduce learning effects. Include wrong provider/repository/run, tampering,
policy changes, unavailable evidence, duplicate/out-of-order events, concurrent
changes, restart and uncertain publication. Preserve every failure and denominator.
A model of GitHub behavior is not an executed GitHub baseline.

Measure invalid-policy approvals, valid-case rejection, availability delay, active
reviewer minutes, setup/maintenance hours, reconstruction completeness, incremental
p50/p95 latency, provider calls, CPU/memory/storage and known/unknown cost. An
intentional fail-closed outage is availability burden, not a false block under an
evidence-required policy. Gate correctness is not code correctness.

Proposed decision thresholds: zero invalid passes in the critical declared fault
suite, no baseline protection regression, every decision reconstructable, and a
customer-agreed improvement in reviewer effort within predeclared cost/latency
limits. Select numeric customer thresholds before collecting outcomes. These are
pilot goals, not achieved results or industry standards.

## Execution and cleanup

One integration owner; bounded branches with failure fixtures before fixes. Track
each finding to its invariant, test, exact commit and reviewed outcome. Update this
matrix and the active work list when evidence changes. Mark historical plans as
superseded instead of treating their dates as active commitments. No deletion of
history, branch cleanup, merge, deployment, paid workloads, credential changes or
security-setting changes is implied by this document.
