<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/writset-logo-dark.svg">
    <img src="docs/assets/writset-logo-light.svg" width="440" alt="WritSet">
  </picture>
</p>

<h1 align="center">Context engineering for coding agents.</h1>

<p align="center">Understand what your agent worked from, what changed, and where to pick up next.</p>

<p align="center">
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/try-tabellio.md">Try the demo</a> ·
  <a href="https://github.com/IntelIP/WritSet/releases">Releases</a> ·
  <a href="https://github.com/IntelIP/WritSet/issues">Help</a>
</p>

WritSet keeps task context, code versions, checkpoints, and results connected across
coding-agent work. Start with a clear task, follow the changes, and keep a record
that the next session can use.

## Keep the context connected

- **Capture the starting point.** Record the task, Git base, changed files, and checkpoints.
- **Track what changed.** Tie results to the code version they describe; surface stale or missing evidence.
- **Carry work forward.** Keep run state, findings, and next actions available after an interruption.

[Agent workflow](docs/agent-run-lifecycle.md) · [How context is stored](docs/native-git-foundation.md)

## Try it locally

**Requirements:** macOS or Linux, Node.js 20+, Git 2.38+, and PostgreSQL client/server
tools on `PATH`. See the [setup guide](docs/try-tabellio.md#requirements).

After v0.7.1 is published, run in a new directory:

```bash
npm install --save-dev @intelip/writset@0.7.1
npx writset-version --expect-version 0.7.1
npx writset-provenance-demo
```

The demo records source observations, restarts its temporary database, and rebuilds
the stored context. A successful receipt ends with `status: "passed"` and
`cleanup: "passed"`.

**Naming transition:** The new package is `@intelip/writset`. Existing `tabellio-*`
commands remain supported aliases. Until publication, use the
[v0.7.0 installation](docs/releases/v0.7.0.md). See the [migration guide](docs/releases/v0.7.1.md).

## Current scope

WritSet is an early CLI toolkit for trusted local workers. Git and database operations
in the demo are real; external-service and security records are synthetic.
It does not prove production adoption, benchmark gains, or live-provider security.
Private context stays on customer-owned storage by default. External actions require
their own approval.

## Go further

[Connect a repository](docs/getting-started.md) · [Examples](examples/) ·
[Contribute](CONTRIBUTING.md) · [Security](SECURITY.md) · [Brand assets](docs/brand.md)

Built by **IntelIP**. Licensed under [Apache-2.0](LICENSE).
