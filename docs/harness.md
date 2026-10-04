# Repository harness

The harness helps a person or coding agent find the rules, tools, environment,
saved state, and feedback needed to finish one task. It adds no autonomous service.
Start at [AGENTS.md](../AGENTS.md) and use the [contributor format](../CONTRIBUTING.md).

## Workflow and responsibility

| Stage | Responsible role | Result and failure route |
| --- | --- | --- |
| Initialize | Contributor or agent | Inspect scope and state; run preflight and baseline checks. Fix setup or save missing access. |
| Select one task | Contributor with task owner | Record objective, allowed changes, observable behavior, and checks. Clarify conflicting scope. |
| Implement | Contributor or agent | Make the scoped change; retain decisions and safe evidence. Return scope changes to the owner. |
| Verify | Existing validators and contributor | Run applicable checks against the code version. Failed checks return to the relevant fix. |
| Review | Reviewer and durable review tooling | Assess behavior, evidence, and unresolved findings at the final head. Findings return to implementation. |
| Human decision | Authorized maintainer | Decide merge or protected action. Passing checks never grant that authority. |

Keep one active task. Missing access produces a saved blocker and an owner action.
Three consecutive failed attempts without material progress require a handoff,
not another blind retry. Record the cause, attempted fixes, code version, and next
useful decision. Task notes route work; they cannot approve actions or certify readiness.

Recover using the existing [run state](agent-run-lifecycle.md), [review refs](review-loop.md),
and [validation results](validation-runner.md). Recheck only evidence affected by
a changed head, base, inputs, failed check, or material uncertainty. Remove only
owned temporary files and preserve unrelated edits and private history.

## Lessons 1–14 applied

Source: [Learn Harness Engineering](https://walkinglabs.github.io/learn-harness-engineering/en/).
The course's automatic merging and broad-cleanup examples do not override this
repository's approval or retention boundaries.

| Lesson | Repository change and observable result |
| --- | --- |
| 1. Execution reliability | Contributor plans name observable behavior and distinguish scope, context, setup, check, and state failures. |
| 2. Harness components | Agent router connects instructions, existing CLIs, prerequisites, durable state, and feedback. |
| 3. Repository as record | Documentation home separates current guides from historical plans while preserving IDs and manifest links. |
| 4. Short instructions | README stays within 150 lines; agent entry stays within 100, with links to detailed guides. |
| 5. Continuity | One reusable handoff records version, decisions, results, blockers, and next action. |
| 6. Initialization | Source setup calls preflight and baseline checks before implementation. |
| 7. Task boundaries | One active task has explicit scope and completion criteria. |
| 8. Feature state | Existing manifests, validation refs, and review records remain the passing authority. |
| 9. Completion judgment | Required checks and exact-head review determine readiness; notes and claims cannot. |
| 10. Complete user journeys | Published first-use commands, actual output, cleanup, and existing failure cases are verified. |
| 11. Observability | Existing bounded receipts, logs, timing, and actionable failures remain the feedback layer. |
| 12. Clean handoff | Instructions preserve unrelated work and remove only owned temporary files. |
| 13. Bounded loops | Failed checks route to a fix; missing access is saved; three stalled attempts require handoff. |
| 14. Explicit handoffs | The stage table names responsibilities, dependencies, failure routes, and human decisions without a graph engine. |

## Maintenance checks

`npm run docs:check` fails on broken local links, missing entry documents, outdated
current installation versions, oversized README/agent entries, or divergent PR
templates. `npm run check` includes it, so GitHub Actions and Buildkite share the
same requirement. Historical versions are allowed; external URLs and prose quality
are checked by people when changed, not by a network call on every PR.

[Contributor checks](../CONTRIBUTING.md) retain product, security, changed-code,
package, and exact-head gates. Later changes can invalidate previously passing
results. Published releases and deployments require their own matching evidence.
