# Workflow Model

Agentic Git Workflow turns a coding-agent run into a reviewable pull request packet.

## Objects

| Object | Meaning |
| --- | --- |
| Task source | Issue, chat request, ticket, manual prompt, or other source that explains why work started. |
| Agent runtime | Tooling that made or coordinated the change. This can be Codex, another coding agent, CI, or a human-operated script. |
| Evidence envelope | JSON artifact that records changed files, commands, checks, approvals, action policy, and artifacts. |
| External action policy | Default-deny list of side-effect classes that require explicit approval. |
| Pull request | Human review unit containing code plus evidence summary. |
| Stack | Ordered set of dependent PRs for larger work. |
| Merge queue | Final validation point before main changes. |

## Flow

1. Receive task.
2. Create a branch.
3. Make a small change.
4. Run deterministic commands.
5. Write evidence envelope.
6. Validate evidence envelope.
7. Check external action policy.
8. Open pull request with evidence summary.
9. Review as a human-readable diff plus machine-readable evidence.
10. Merge through protected queue after checks are current.

## Stack Discipline

Prefer stacked PRs when a task contains separate concepts:

- substrate or schema
- validation script
- workflow wiring
- UI or docs
- eval coverage

Each PR should be independently understandable. The evidence envelope should describe that PR, not the whole roadmap.

## Evidence Discipline

Evidence is not a claim that the agent did good work. Evidence is a record that reviewers can inspect:

- files changed
- commands run
- check statuses
- approvals required
- approvals granted or denied
- side effects attempted
- artifacts produced

Failed checks belong in evidence. A failing artifact is better than an omitted failure.

## External Action Discipline

Default posture: no external side effects without explicit approval.

Protected action classes:

- deployment
- database migration
- infrastructure change
- DNS or hosting change
- billing or live-money action
- credentialed provider read
- secret-value read
- destructive workspace action

The workflow can document proposed side effects before approval, but it should not execute them.

## Review Discipline

Reviewer questions:

- Does the task source match the diff?
- Are changed files listed?
- Did required commands run?
- Are skipped commands explained?
- Does the external action policy still default to deny?
- Did any protected action happen without approval?
- Is the PR small enough to review?
- Is the evidence current after queue-time checks?

## Merge Discipline

Use branch protection or merge queues. The evidence workflow should pass on the final PR state before merge.

Do not treat stale local evidence as final merge evidence.

## Extension Points

The v0 workflow stays agent-agnostic. Future integrations can add:

- signed evidence
- SLSA provenance export
- in-toto link metadata
- OpenTelemetry spans
- model/tool eval suites
- Graphite stack metadata
- GitHub merge queue metadata
