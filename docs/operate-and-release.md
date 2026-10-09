# Operate and release

Use a trusted **source checkout** for the `node scripts/...` and `npm run ...`
commands below. Installed-package users can invoke the named public CLIs with
`npx writset-...` and the same arguments; repository npm scripts belong to this
source checkout. Start with [Connect a repository](getting-started.md).

Passing evidence is tied to its code version. Sharing private evidence, publishing
statuses, merging, tagging, releasing, and deploying remain separate human decisions.
Never infer permission from a passing check or an earlier release.

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
  --expect-version 0.7.1 \
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
  --version 0.7.1 \
  --notes docs/releases/v0.7.1.md \
  --out /tmp/tabellio-release-intent.json
```

Review the intent and create a short-lived `tabellio-release-approval/v0.1` bound to `integrity.digest`. Then execute:

```bash
node scripts/tabellio-release.mjs execute \
  --intent /tmp/tabellio-release-intent.json \
  --approval /secure/tabellio-release-approval.json
```

Local release plans bind the exact three local evidence-ref tips and recheck them before execution; they do not claim remote publication. Legacy remote release plans retain approved publication. Planning accepts only the validation manifest named by `tabellio.platform.json`. It runs commands on the exact merged commit and binds checkpoint evidence to the pre-merge pull-request head, so a squash merge does not erase proof. Execution accepts canonical HTTPS, SCP-style SSH, and `ssh://git@github.com/...` remotes, resolves Git fetch/push URL rewrites, rechecks the distinct repository identities and current private control visibility, then publishes exact private control refs, a deterministic annotated tag, and the GitHub release. Merge stays outside this command because the final squash commit must exist before release approval can bind it.


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

## Current operating guides

- [Provenance and scanner operations](provenance.md).
- [Exact-commit validation](validation-runner.md) and [product validation](product-validation.md).
- [Durable review loop](review-loop.md) and [exact-head status](merge-ready-status.md).
- [Private checkpoint proof handoff](checkpoint-proof-handoff.md).
- [Worker isolation, backups, and monitoring](operations-hardening.md).
- [Release notes](releases/) and [changelog](../CHANGELOG.md).

A fresh hosted runner needs genuine private checkpoint proof. Save missing access
as a blocker; never replace it with a synthetic fixture or bypass a protected job.
