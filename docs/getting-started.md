# Getting Started

Tabellio captures GitHub-bound context and can attach a machine-readable evidence packet to pull requests. Humans, CI, and coding agents use the same contract.

## Requirements

- Git repository
- Node.js 20 or later
- Git 2.38 or later with `merge-tree --write-tree`
- git-spice 0.18 or later for optional stack snapshots
- Entire CLI 0.7.7 or later for mandatory checkpoint metadata export

## Install

Install the published package on a trusted worker:

```bash
npm install --save-dev @intelip/tabellio@0.7.0
npx tabellio-version --expect-version 0.7.0
```

The public install command becomes a release check only after the npm registry
returns version `0.7.0`. Before publication, use a clean source checkout or the
candidate tarball produced by `npm pack`.

GitHub is the canonical code store through the `origin` remote. Tabellio does not use it for private agent transcripts, validation results, review ledgers, or control refs. No hosted workflow runtime is required.

Enable Entire for Codex before creating agent commits:

```bash
entire enable --agent codex --project --skip-push-sessions
```

Entire stores genuine checkpoints locally on `refs/heads/entire/checkpoints/v1`. The default v0.4 local platform requires `strategy_options.push_sessions: false` ; any previously configured remote stays inactive and is not contacted. Do not push this private branch to public `origin`. Preflight checks native metadata; missing release evidence remains blocking. Explicit legacy private-remote mode retains destination and privacy checks.

Every agent change range must contain at least one `Entire-Checkpoint` commit trailer. Context capture fails closed when no checkpoint exists. Use `--ledger git-note` only while migrating an older repository.

## Capture A Stack

Initialize git-spice in a normal working repository, then capture its local stack graph without contacting GitHub:

```bash
git-spice repo init
node scripts/tabellio-stack.mjs \
  --repo . \
  --repo-id example/repository \
  --out tabellio-stack.json
node scripts/check-tabellio-stack.mjs --stack tabellio-stack.json
```

The snapshot adapter uses documented JSON output and disables change-request status and comment queries. Approved write operations use the separate flow in [Approved stack operations](stack-operations.md).

## Configure The Platform

`tabellio.platform.json` v0.4 defaults to GitHub code storage, git-spice stacks and customer-owned local checkpoint, validation and review refs. No control repository or private GitHub credential is required for local review. v0.3 remains the legacy explicit private-remote configuration.

```bash
npm run tabellio:platform:check
```

Run `tabellio-validate` from any trusted worker. The runner checks out the exact revision in an isolated worktree, executes only argv arrays committed in `tabellio.validation.json`, bounds captured output, and writes the result to `refs/tabellio/validations`.

```bash
node scripts/tabellio-validate.mjs run \
  --repo . \
  --repo-id github.com/example/repository \
  --commit HEAD \
  --manifest tabellio.validation.json
```

The worker can be a local agent or an operator-managed scheduled service. Tabellio's contract stays identical.

## Optional Sharing Of Control State

Review cycles, validation results, and Entire checkpoints use standard Git refs. Publishing or fetching them requires an integrity-bound plan and short-lived approval:

```bash
node scripts/tabellio-control-ref.mjs plan \
  --operation publish \
  --remote "$TABELLIO_CONTROL_REMOTE" \
  --repo-id example/repository \
  --out /tmp/control-ref-intent.json
```

`TABELLIO_CONTROL_REMOTE` must name a separately configured private GitHub repository remote. It cannot be `origin`. Create a matching `tabellio-control-ref-approval/v0.1` document after reviewing the exact local and remote OIDs, then execute it once with `tabellio-control-ref.mjs execute`. Multi-ref publication is atomic. Non-fast-forward publication, divergence, changed refs, expired approvals, and reused approvals fail closed.

## Preflight And Release

Inspect the local runner identity before trusting a version claim:

```bash
npm run tabellio:version -- \
  --expect-version 0.7.0 \
  --expect-ref HEAD
```

Add `--require-clean` for an immutable candidate and `--require-release-tag` only after the approved, non-draft GitHub Release exists. The release check requires an annotated `origin` tag at the exact source commit; a local-only tag is insufficient.

Run preflight before agent work and again from clean merged `main`:

```bash
node scripts/tabellio-preflight.mjs --profile agent
node scripts/tabellio-preflight.mjs --profile release
```

Preflight performs read-only checks of Entire enablement and Codex hook-trust state. When trust is missing, open `/hooks` in Codex and approve the four repository hooks. Run `entire doctor` separately only when an operator explicitly intends to diagnose and repair Entire state.

After terminal review and exact-head validation, record durable readiness before merge:

```bash
node scripts/tabellio-review.mjs gate \
  --repo . \
  --repo-id github.com/example/repository \
  --owner example \
  --remote-repo repository \
  --number 42 \
  --token-file /secure/path/github-token \
  --actor pre-merge-gate
```

Do not merge until this command passes. The gate refuses to create readiness evidence after a pull request is merged or closed.

After explicit PR merge, create the exact release plan:

```bash
node scripts/tabellio-release.mjs plan \
  --owner example \
  --remote-repo repository \
  --number 42 \
  --version 0.7.0 \
  --notes docs/releases/v0.7.0.md \
  --out /tmp/tabellio-release-intent.json
```

Review the intent and create a short-lived `tabellio-release-approval/v0.1` bound to `integrity.digest`. Then execute:

```bash
node scripts/tabellio-release.mjs execute \
  --intent /tmp/tabellio-release-intent.json \
  --approval /secure/tabellio-release-approval.json
```

Local release plans bind the exact three local evidence-ref tips and recheck them before execution; they do not claim remote publication. Legacy remote release plans retain approved publication. Planning accepts only the validation manifest named by `tabellio.platform.json`. It runs commands on the exact merged commit and binds checkpoint evidence to the pre-merge pull-request head, so a squash merge does not erase proof. Execution accepts canonical HTTPS, SCP-style SSH, and `ssh://git@github.com/...` remotes, resolves Git fetch/push URL rewrites, rechecks the distinct repository identities and current private control visibility, then publishes exact private control refs, a deterministic annotated tag, and the GitHub release. Merge stays outside this command because the final squash commit must exist before release approval can bind it.

## Local Validation

From this repository:

```bash
npm run check
node scripts/check-tabellio-stack.mjs --stack examples/tabellio-stack/minimal-stack.json
node scripts/check-tabellio-ledger.mjs --ledger examples/tabellio-ledger/minimal-ledger.json
node scripts/capture-tabellio-context.mjs --repo . --repo-id example/repository --base main --head HEAD --out /tmp/tabellio-context.json
node scripts/check-tabellio-context.mjs --context /tmp/tabellio-context.json
node scripts/write-tabellio-evidence-envelope.mjs --context /tmp/tabellio-context.json --out /tmp/tabellio-pr-evidence.json
node scripts/check-tabellio-evidence-envelope.mjs --evidence /tmp/tabellio-pr-evidence.json
node scripts/check-tabellio-external-actions.mjs --evidence /tmp/tabellio-pr-evidence.json
```

From a repository that does not vendor Tabellio, install the package on the trusted worker and run the same commands there.

## Change Request Copy

Add the Tabellio checklist to the repository PR template:

```markdown
## Tabellio Evidence

- [ ] Evidence envelope generated
- [ ] Evidence envelope validated
- [ ] Required commands listed with pass/fail/skipped status
- [ ] Changed files listed
- [ ] External action policy present
- [ ] No protected side effect attempted without explicit approval
```

The full GitHub pull-request template lives at `templates/pull_request_template.md`.

## Protected Side Effects

These action classes are default-deny:

- deployment
- database migration
- infrastructure change
- DNS or hosting change
- billing or live-money action
- credentialed provider read
- secret-value read
- destructive workspace action

If any class is marked `attempted: true`, it must also be marked `approved: true`.

## First Adoption Change

Keep the first PR small:

1. Add `tabellio.platform.json` and `tabellio.validation.json`.
2. Enable Entire and initialize git-spice.
3. Push a code branch to `origin` and open a thin pull request.
4. Run exact-head validation and sync the durable review cycle.
5. Back up the customer-owned local evidence refs. If optional remote mode is explicitly selected, publish them to its configured private destination with an approved one-use operation.

Before production deployment, apply the concurrency, worker isolation, backup, and monitoring guidance in [Operations hardening](operations-hardening.md).

## Local publication authority

Read-only packets and reviews need no publication authority. To publish GitHub
statuses, first create one private bare Git repository on a trusted worker:

```bash
git init --bare /absolute/private/tabellio-publication.git
```

Pass `--publication-store /absolute/private/tabellio-publication.git` to
`tabellio-provenance review-intent`, or set `TABELLIO_PUBLICATION_STORE`. All
publishers must share this same authority. The approved intent binds its path.
Keep this store outside the code checkout, protect it with ordinary account
permissions, and back it up. Independent clones with separate stores cannot
coordinate approval consumption. No token is needed until explicitly publishing
GitHub statuses. Pending delivery after a crash is unresolved, not retryable.

A fresh hosted runner must receive genuine customer-owned checkpoint evidence.
On a trusted worker, retain the native checkpoint ref or set
`TABELLIO_CHECKPOINT_BUNDLE` to the path of a privately provisioned native Git
bundle advertising `refs/heads/entire/checkpoints/v1`. The repository CI importer
verifies the bundle and rejects divergent history without overwriting it; the
product gate still verifies metadata and exact-candidate association. Default
ephemeral GitHub runners remain blocked until this private input is provisioned.
No download credential or storage integration is supplied automatically. Never
upload the bundle to public CI artifacts. A synthetic fixture cannot replace a
real session checkpoint.
