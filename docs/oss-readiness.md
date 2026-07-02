# Agentic Git OSS Readiness

Purpose: classify the current pilot into public extraction pieces before creating a standalone open-source workflow repo.

Current source repo: private pilot repository.

Target extraction repo: `agentic-git-workflow`

## Release Principle

Open-source the workflow, not the private pilot.

Public value:

- evidence-backed pull requests
- stacked-PR review discipline
- default-deny external action gates
- reusable CI checks
- agent-agnostic ledger schema
- evals for approval-boundary behavior

Private value:

- internal business context
- provider credentials and account posture
- local session history
- private product naming unless intentionally branded
- live-market operating details

## Current File Classification

| Area | Current files | OSS action |
| --- | --- | --- |
| Research framing | `docs/research-grounding.md` | Keep public with links and boundary language. |
| PR evidence workflow | `.github/workflows/agentic-pilot-evidence.yml`, `.github/pull_request_template.md`, `scripts/write-agentic-pr-evidence.mjs` | Sanitize and extract into reusable workflow, template, and generic writer. |
| Agentic backend ledger | pilot ledger docs and checks | Split: keep generic evidence concepts; remove local paths and private workflow-tool trust assumptions unless deliberately branded. |
| Deploy safety gate | `docs/agentic-deploy-safety-gate.json`, `scripts/check-agentic-deploy-safety-gate.mjs` | Extract core default-deny action policy. Remove Vercel/private pilot specifics. |
| Multi-repo rollout | `docs/entire-multi-repo-rollout.json`, `scripts/check-entire-multi-repo-rollout.mjs` | Sanitize into `check-rollout-stack.mjs`; avoid hard-coded workspace roots and private repo names. |
| Production pilot gates | `docs/production-pilot-*.json`, `scripts/check-production-pilot-*.mjs` | Mostly private example material. Extract only generic gate-policy patterns. |
| Evals | `evals/*approval*`, `evals/no-secret-broad-tool.eval.ts`, `evals/*deploy*`, `evals/*external*` | Sanitize into focused eval suites for approval denial, no-secret reads, retry classification, and evidence completeness. |
| Eve app | `agent/*`, `app/*`, `components/*` | Keep out of core. Optional sanitized example after private names and provider details are removed. |
| Domain-specific provider work | provider tools, domain adapters, related docs/evals | Private or separate domain example. Do not include in v0 core. |
| Database/provider smoke | `scripts/smoke-*`, Postgres/Blob/production telemetry docs | Private example unless rewritten as abstract external-action fixtures. |

## Public v0 Artifacts

Required:

- `docs/research-grounding.md`
- `docs/oss-readiness.md`
- `schemas/evidence-envelope.schema.json`
- `schemas/external-action-policy.schema.json`
- `scripts/check-agentic-evidence-envelope.mjs`
- `examples/agentic-evidence/minimal-evidence.json`

Next extraction:

- `templates/pull_request_template.md`
- `.github/workflows/agentic-evidence.yml`
- `scripts/write-agentic-pr-evidence.mjs`
- `scripts/check-external-actions.mjs`
- `docs/workflow-model.md`
- `docs/evidence-schema.md`

## Sanitization Checklist

Before public repo:

- remove local absolute paths
- remove private session ids
- remove private ticket ids
- remove credential/provider account context
- remove live trading specifics
- remove private workspace names unless intentionally branded
- replace `production-pilot` names with generic `agentic-git`
- replace private workflow-tool names with public brand only if approved
- verify no secret values or redacted secret-like strings ship
- run secret scan
- run dependency/license review

## Public Claims Allowed

Allowed:

- SLSA-inspired evidence for AI-assisted PRs
- in-toto-inspired step records
- agent-agnostic Git governance
- default-deny side-effect policy
- reusable GitHub Actions evidence check
- Graphite/GitHub merge-queue compatible workflow

Avoid:

- SLSA compliant
- in-toto verified
- autonomous deploy safety
- replaces human review
- guarantees secure agent output

## v0 Cut Line

Include:

- schema
- validator
- PR template
- reusable workflow
- docs
- minimal fixture

Exclude:

- Eve runtime implementation
- provider tools
- domain-specific provider logic
- production deployment paths
- local app ledger UI
- private rollout manifests

## Next Work Order

1. Validate minimal evidence fixture against the schema.
2. Extract PR template and reusable workflow.
3. Add generic external-action policy check.
4. Create sanitized stack demo.
5. Run full secret scan before any public repo creation.
