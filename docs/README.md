# WritSet documentation

Understand and track the context behind coding-agent work: tasks, source versions,
checkpoints, results, and handoffs. Choose the outcome you need below.

WritSet was previously Tabellio. The published package, CLI commands, configuration
files, and stored formats keep their existing names during this transition.

| Route | Start here | Result |
| --- | --- | --- |
| **Try WritSet** | [Published-package demo](try-tabellio.md) | Run a local sample and understand which observations are synthetic. |
| **Connect a repository** | [Integration setup](getting-started.md) | Add genuine checkpoints and repository-specific contracts. |
| **Contribute** | [Contributor setup and handoffs](../CONTRIBUTING.md) | Finish one scoped change with the applicable checks. |
| **Operate and release** | [Operator guide](operate-and-release.md) | Review protected sharing, validation, and release procedures. |

## Understand the system

- [Native Git foundation](native-git-foundation.md), [workflow model](workflow-model.md),
  and [tooling stack](tooling-stack.md).
- [GitHub code-storage boundary](github-code-storage-boundary.md) and
  [data boundary](../tabellio.data-boundary.json).
- [Local provenance operations](provenance.md) and [evidence schema](evidence-schema.md).
- [Research grounding](research-grounding.md) and [brand system](brand.md).

## Work and verify

- [Agent entry point](../AGENTS.md) and [repository harness](harness.md).
- [Agent-run lifecycle](agent-run-lifecycle.md) and [approved stack operations](stack-operations.md).
- [Product validation](product-validation.md), [exact-commit runner](validation-runner.md),
  and the [current manifest](../tabellio.validation.json).
- [Durable review loop](review-loop.md), [Codex review](codex-review.md),
  and [exact-head readiness status](merge-ready-status.md).
- [Design memory](design-memory.md) and [wave admission](wave-admission.md).

## Operate safely

- [Operations hardening](operations-hardening.md) and [checkpoint proof handoff](checkpoint-proof-handoff.md).
- [Pilot acceptance](pilot/acceptance-plan.md) and [architecture and recovery](pilot/architecture-and-recovery.md).
- [Release notes](releases/), [changelog](../CHANGELOG.md), and [v0.7.0 launch scope](gtm/v0.7.0-launch.md).
- [Security policy](../SECURITY.md) and [private reporting](https://github.com/IntelIP/WritSet/security/advisories/new).

## Previous work

[Historical plans and review records](historical/README.md) preserve ticket IDs,
source heads, and previous decisions. They are not current setup instructions or
passing evidence for a later commit. Root manifests, schemas, migration paths,
and runtime CLI locations remain stable.
