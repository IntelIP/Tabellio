# Contributing

## Development Principles

Keep the workflow:

- agent-agnostic
- Git-native
- dependency-light
- deterministic before AI-assisted
- default-deny for external side effects
- clear about what is evidence and what is only a claim

## Local Checks

Run:

```bash
node scripts/check-agentic-evidence-envelope.mjs --evidence examples/agentic-evidence/minimal-evidence.json
node scripts/check-agentic-external-actions.mjs --evidence examples/agentic-evidence/minimal-evidence.json
node scripts/write-agentic-evidence-envelope.mjs --out /tmp/agentic-pr-evidence.json
node scripts/check-agentic-evidence-envelope.mjs --evidence /tmp/agentic-pr-evidence.json
node scripts/check-agentic-external-actions.mjs --evidence /tmp/agentic-pr-evidence.json
```

When package scripts are available:

```bash
bun run agentic:evidence:example:check
bun run agentic:evidence:write
bun run agentic:evidence:check
bun run agentic:external-actions:check
```

## Pull Request Expectations

Each PR should include:

- evidence envelope path
- commands run
- check result summary
- external-action policy summary
- explicit note for any skipped checks

Do not include:

- secret values
- private session logs
- local machine paths
- provider account data
- unredacted credentials

## External Action Changes

Changes that weaken approval requirements need extra review.

Examples:

- marking an external action as approved by default
- removing a required action class
- allowing attempted action without approval
- hiding failed checks
- making evidence optional for agentic PRs

## Documentation Style

Use direct wording. Separate:

- current behavior
- planned behavior
- non-goals
- security boundary

Avoid compliance claims unless the implementation directly satisfies the referenced standard.
