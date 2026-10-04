# Connect a repository

Connect one trusted repository so reviewers can identify the exact code version,
its checks, checkpoint evidence, and any unresolved work. Try the
[credential-free demo](try-tabellio.md) first if you are evaluating the package.

## Integration requirements

- Node.js 20 or later and npm; source CI uses Node.js 22.23.1.
- Git 2.38 or later with `merge-tree --write-tree` and a trusted GitHub `origin`.
- Entire CLI 0.7.7 or later for genuine checkpoint metadata.
- git-spice 0.18 or later when using stacked branches.
- PostgreSQL client/server binaries for local provenance storage; Git-ref workflows
  do not all need PostgreSQL. See [Provenance operations](provenance.md).
- Explicit access to any real provider inputs. A synthetic observation is not access proof.

## Installed-package setup

In the target repository, install the published package on a trusted worker:

```bash
npm install --save-dev @intelip/tabellio@0.7.0
npx tabellio-version --expect-version 0.7.0
```

Use installed CLIs with `npx`. Commands beginning `node scripts/` or `npm run`
in operator guides refer to a Tabellio source checkout. Source contributors use
[CONTRIBUTING.md](../CONTRIBUTING.md); do not copy Tabellio's development scripts
into an unrelated application.

GitHub is the canonical code store through `origin`. Private transcripts,
validation results, review ledgers, and control refs stay outside public code storage.
No hosted workflow runtime is required for local use.
The default v0.4 platform keeps checkpoint, validation, and review refs locally.
Existing v0.3 private-remote configurations remain an explicit legacy option.

Enable genuine checkpoints before making agent commits:

```bash
entire enable --agent codex --project --skip-push-sessions
npx tabellio-preflight --profile agent
```

Keep `strategy_options.push_sessions: false`. Never push
`refs/heads/entire/checkpoints/v1` to public `origin`. An `Entire-Checkpoint`
trailer alone cannot prove a genuine checkpoint. Context capture requires native
metadata; `--ledger git-note` is only an explicit legacy migration option.
Preflight is read-only. If Codex hook trust is missing, use `/hooks` to review and
approve the four repository hooks. `entire doctor` is a separate, explicitly
operator-approved repair step.

## Add the repository contracts

Use the [platform boundary](github-code-storage-boundary.md) and
[validation contract](validation-runner.md) to add `tabellio.platform.json` and
`tabellio.validation.json` for your repository. Commit only the intended commands,
acceptance criteria, and data boundaries. Tabellio ships
[examples](../examples/); copying a fixture does not establish passing evidence.

Run the committed manifest against one exact candidate:

```bash
npx tabellio-validate run --repo . --repo-id github.com/example/repository --commit HEAD --manifest tabellio.validation.json
```

The trusted worker creates an isolated worktree and executes only committed argv
arrays. Results go to `refs/tabellio/validations`. Use `gate` in CI when anything
other than a `passed` decision must fail the job:

```bash
npx tabellio-validate gate --repo . --repo-id github.com/example/repository --base main --commit HEAD --manifest tabellio.validation.json
```

## Optional stacked branches

Initialize git-spice in the working repository, then capture the local graph:

```bash
git-spice repo init
npx tabellio-stack --repo . --repo-id example/repository --out tabellio-stack.json
```

Capture reads the documented local JSON output without querying GitHub status or
comments. Writes use [Approved stack operations](stack-operations.md).

## First adoption change

1. Add the repository-specific platform and validation contracts.
2. Enable Entire, trust the hooks, and establish a passing startup baseline.
3. Choose one small task with a scope and observable completion criteria.
4. Implement it, commit it, and open a thin pull request on `origin`.
5. Run exact-head validation and synchronize the [durable review cycle](review-loop.md).
6. Obtain the separate human decision before merge or any protected action.

Back up customer-owned evidence refs privately. Optional sharing needs its own
approved one-use operation; see [Operate and release](operate-and-release.md).
A fresh hosted validator also needs [private checkpoint proof](checkpoint-proof-handoff.md).

## Evidence and review

Use the [evidence schema](evidence-schema.md) to retain safe command results,
changed files, approval decisions, and artifact references. Tabellio's native
[GitHub PR template](../.github/pull_request_template.md) matches the
[packaged template](../templates/pull_request_template.md) for adopting repositories.
Read [Contributing](../CONTRIBUTING.md) for the reusable work-plan and handoff format.

Keep deployment, migrations, infrastructure, DNS, hosting, billing, live-money,
credentialed reads, secret-value reads, and destructive actions behind explicit
approval. Failed or missing evidence remains a blocker. Before production use,
apply [operations hardening](operations-hardening.md).
