# Evidence Schema

The evidence envelope is the core public contract for Agentic Git Workflow.

Schema file:

```text
schemas/evidence-envelope.schema.json
```

External action policy schema:

```text
schemas/external-action-policy.schema.json
```

## Required Fields

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Versioned evidence contract. Current value: `agentic-git-evidence/v0.1`. |
| `runId` | Unique id for the evidence-producing run. |
| `repo` | Repository name. |
| `git` | Base ref, head ref, commit SHA, and optional PR metadata. |
| `actor` | Human, agent, CI, or system identity that produced evidence. |
| `agentRuntime` | Runtime/tooling metadata. |
| `taskSource` | Why work started. |
| `changedFiles` | Files changed by the PR or local run. |
| `commandsRun` | Commands executed and their statuses. |
| `checks` | Higher-level validation results. |
| `approvals` | Approval status by action class. |
| `externalActionPolicy` | Default-deny side-effect policy. |
| `artifacts` | Evidence artifacts produced by the run. |
| `createdAt` | Creation timestamp. |

## Minimal Example

```json
{
  "schemaVersion": "agentic-git-evidence/v0.1",
  "runId": "local-example-001",
  "repo": "example/agentic-git-workflow",
  "git": {
    "baseRef": "main",
    "headRef": "agentic/example-evidence",
    "sha": "0000000000000000000000000000000000000000"
  },
  "actor": {
    "type": "agent",
    "id": "codex-local"
  },
  "agentRuntime": {
    "name": "codex"
  },
  "taskSource": {
    "type": "chat",
    "summary": "Create a minimal evidence fixture."
  },
  "changedFiles": ["README.md"],
  "commandsRun": [],
  "checks": [],
  "approvals": [],
  "externalActionPolicy": {
    "defaultMode": "deny",
    "actionClasses": []
  },
  "artifacts": [],
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

## Command Status

`commandsRun[].status` values:

- `passed`
- `failed`
- `skipped`

Skipped commands should include enough context for reviewers to decide whether the PR can proceed.

## Check Status

`checks[].status` values:

- `passed`
- `failed`
- `skipped`
- `pending`

`pending` is acceptable while a workflow runs. It should not be treated as merge-ready.

## Approval Status

`approvals[].status` values:

- `not_required`
- `required`
- `approved`
- `denied`

Protected external actions should be `required` until explicit approval exists.

## External Action Policy

`externalActionPolicy.defaultMode` must be:

- `deny`
- `default-deny`

Required action classes:

- `deployment`
- `database-migration`
- `infrastructure-change`
- `dns-or-hosting-change`
- `billing-or-live-money`
- `credentialed-provider-read`
- `secret-value-read`
- `destructive-workspace-action`

Each action class requires:

- `requiresExplicitApproval: true`
- `approved`
- `attempted`
- `expectedSideEffects`
- `forbiddenSideEffects`
- `verificationCommand`

The checker fails when `attempted: true` and `approved !== true`.

## Validation

Validate an existing file:

```bash
node scripts/check-agentic-evidence-envelope.mjs --evidence agentic-pr-evidence.json
node scripts/check-agentic-external-actions.mjs --evidence agentic-pr-evidence.json
```

Generate and validate:

```bash
node scripts/write-agentic-evidence-envelope.mjs --out agentic-pr-evidence.json
node scripts/check-agentic-evidence-envelope.mjs --evidence agentic-pr-evidence.json
node scripts/check-agentic-external-actions.mjs --evidence agentic-pr-evidence.json
```

## Boundary

This schema is intentionally simpler than SLSA provenance or in-toto link metadata. It can later export to those formats, but v0 should not claim compliance.
