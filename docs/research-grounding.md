# Agentic Git Research Grounding

Purpose: ground the agentic Git workflow in proven software-delivery patterns before extracting it as an open-source project.

This workflow should not be positioned as "AI writes code and we trust it." The stronger position is: agent-assisted changes become reviewable, auditable, replayable, and merge-safe through existing Git, CI, provenance, eval, and observability practices.

## Thesis

Agentic Git is a control plane for AI-assisted software changes:

1. Break work into small stacked pull requests.
2. Attach machine-readable evidence to every pull request.
3. Run deterministic checks before human review.
4. Require explicit approval before deploys, migrations, live-provider actions, billing changes, or other external side effects.
5. Merge only through protected queues after evidence is current.
6. Evaluate agent behavior over time, not only single PR output.
7. Keep a readable ledger for humans and a structured ledger for tools.

The public project should package this as a workflow layer around GitHub, Graphite or merge queues, and local/CI validation. The agent is optional. The evidence contract is the product.

## Prior Art

| Prior art | Source | Relevant lesson | Agentic Git implication |
| --- | --- | --- | --- |
| Supply-chain provenance | [SLSA Build provenance](https://slsa.dev/spec/draft/build-provenance), [SLSA levels](https://slsa.dev/spec/v1.0/levels) | Provenance records where, when, how, and from what inputs an artifact was produced. Higher levels add stronger integrity guarantees. | A PR needs evidence about prompt/task source, model/tool runner, touched files, validation commands, approvals, and merge state. |
| Step-level supply-chain metadata | [in-toto](https://in-toto.io/), [in-toto getting started](https://in-toto.io/docs/getting-started/) | Supply chains can be described as signed steps with materials and products. | Agentic changes should emit step records: plan, edit, test, review, approval, merge. |
| Merge queues | [GitHub merge queue docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) | Queues protect busy branches by validating the merge result before landing. | Agentic PRs should land only after queue-time evidence is fresh. |
| Reusable CI workflows | [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) | Shared workflow files can be called from many repositories through `workflow_call`. | Open-source package should ship a reusable `agentic-evidence.yml` workflow. |
| Stacked review | [Graphite stacked PR guidance](https://graphite.com/docs/best-practices-for-reviewing-stacks) | Stacks keep large work reviewable by splitting it into dependent PRs. | Agent output should be shaped into a stack, not one giant diff. |
| Automated analysis in review | [Google Tricorder paper](https://research.google.com/pubs/archive/43322.pdf), [Google SWE book static analysis chapter](https://abseil.io/resources/swe-book/html/ch20.html) | Static analysis works best when integrated into the review workflow and tuned for developer acceptance. | Agentic evidence should prioritize actionable, deterministic findings and avoid noisy claims. |
| Open-source security posture | [OpenSSF Scorecard](https://github.com/ossf/scorecard), [Scorecard site](https://scorecard.dev/) | Open-source projects need automated checks across code, build, dependencies, tests, and maintenance practices. | Public launch needs Scorecard, branch protection guidance, security policy, pinned actions, and dependency posture checks. |
| LLM and agent evals | [OpenAI Evals](https://github.com/openai/evals), [Inspect AI](https://inspect.aisi.org.uk/) | LLM systems need repeatable evals for task behavior, tool use, and safety properties. | Agentic Git should include evals for review-quality, retry-classification, refusal around external actions, and evidence completeness. |
| Coding agents | [SWE-agent](https://github.com/swe-agent/swe-agent), [SWE-agent docs](https://swe-agent.com/latest/) | Coding agents can operate on real GitHub repositories and issue-like tasks. | The differentiator is not another coding agent; it is the Git governance and evidence layer around any coding agent. |
| Observability | [OpenTelemetry docs](https://opentelemetry.io/docs/), [What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/) | Observable systems emit traces, metrics, and logs so operators can understand internal state from outputs. | Agent workflows need run traces, decision logs, check results, and reviewer-facing summaries. |

## Current Pilot Mapping

| Pilot primitive | Research anchor | Public OSS primitive |
| --- | --- | --- |
| Agentic ledger substrate | SLSA, in-toto, OpenTelemetry | `evidence-ledger` schema and JSON examples |
| PR evidence layer | SLSA provenance, GitHub checks | `agentic-evidence.yml` reusable workflow plus PR template |
| Multi-repo rollout verifier | in-toto step metadata, merge queues | `rollout-verifier` script that checks repo, PR, and stack state |
| Deploy safety gate | Protected branches, merge queues, external-action approval | `external-action-gates` manifest and check script |
| Prediction research safety evals | OpenAI Evals, Inspect AI | `evals/` suite for agent workflow behavior |
| Chat history ledger surface | OpenTelemetry, review UX | human-readable run ledger and PR summary view |
| Graphite stack merge | Graphite stacked PRs, GitHub merge queue | stack-first workflow docs, queue-time check refresh |

## Public Contract

An open-source v0 should define four contracts.

### 1. Evidence Envelope

Minimum fields:

- `schemaVersion`
- `runId`
- `repo`
- `baseRef`
- `headRef`
- `actor`
- `agentRuntime`
- `taskSource`
- `changedFiles`
- `commandsRun`
- `checks`
- `approvals`
- `externalActionPolicy`
- `artifacts`
- `createdAt`

This is intentionally smaller than full SLSA or in-toto. It borrows their provenance mindset without claiming equivalent supply-chain assurance.

### 2. External Action Policy

Default-deny classes:

- deployment
- database migration
- infrastructure change
- DNS or hosting change
- billing or live-money action
- credentialed provider read
- secret-value read
- destructive workspace action

Each class needs explicit operator approval, expected side effects, forbidden side effects, and a verification command.

### 3. PR Evidence Check

Required outputs:

- evidence file exists
- evidence schema validates
- changed files match evidence
- required commands ran
- external action policy present
- forbidden side effects absent
- PR body includes evidence summary

### 4. Agent Eval Set

Initial evals:

- refuses deploy without approval
- refuses migration without approval
- does not read secret values
- classifies auth/credit failures as non-retryable
- produces evidence for changed files
- keeps stack PRs small
- summarizes validation failures without hiding them

## Open-Source Repo Shape

```text
agentic-git-workflow/
  README.md
  LICENSE
  SECURITY.md
  docs/
    research-grounding.md
    workflow-model.md
    evidence-schema.md
    external-action-policy.md
    stacked-prs.md
    oss-readiness.md
  schemas/
    evidence-envelope.schema.json
    external-action-policy.schema.json
  scripts/
    check-evidence.mjs
    check-external-actions.mjs
    check-rollout-stack.mjs
  .github/
    workflows/
      agentic-evidence.yml
  templates/
    pull_request_template.md
    approval-packet.md
  evals/
    approval-boundaries/
    evidence-completeness/
    retry-classification/
  examples/
    github-actions-minimal/
    graphite-stack/
    vercel-eve-pilot-sanitized/
```

## Extraction Rules

Keep public:

- generic evidence schema
- generic CI checks
- Graphite/GitHub workflow docs
- approval-gate model
- sanitized Eve/Vercel example
- failure-mode examples with no private context

Keep private unless deliberately branded:

- private business context
- domain-specific provider account details
- live trading workflow details
- local machine paths
- private session IDs and logs
- secret names that reveal private infra
- private workflow-tool internals unless deliberately branded

## Positioning

Avoid:

- "Autonomous AI engineer"
- "Trust agent output"
- "One-click deploy from AI"
- "Replaces code review"

Use:

- "Evidence-backed PR workflow for agentic development"
- "SLSA-inspired provenance for AI-assisted code changes"
- "Stacked PR discipline for coding agents"
- "Default-deny external action gates"
- "Agent-agnostic Git governance"

## Launch Criteria

Before public release:

1. Fresh repo or clean extraction branch exists.
2. Secret scan passes.
3. Private names and paths are removed or intentionally branded.
4. License chosen.
5. `SECURITY.md` explains responsible reporting and supported versions.
6. Reusable workflow works in a toy repo.
7. One Graphite or GitHub merge-queue demo PR shows evidence refresh at merge time.
8. Evals include at least one passing and one failing fixture.
9. README explains non-goals and approval boundaries.
10. OpenSSF Scorecard action is configured after repo is public.

## First Implementation Sequence

1. Create `docs/oss-readiness.md` and classify files as public, sanitize, or private.
2. Add `schemas/evidence-envelope.schema.json`.
3. Extract `scripts/check-evidence.mjs` from the pilot evidence check.
4. Add reusable GitHub workflow with `workflow_call`.
5. Add minimal example repo fixture.
6. Run local checks against fixture.
7. Create sanitized `examples/vercel-eve-pilot/`.
8. Open first public-prep PR with this document as evidence.

## Boundary

This project should not claim SLSA compliance, in-toto verification, or formal supply-chain security until it implements those specifications directly. The correct claim for v0 is "SLSA- and in-toto-inspired evidence for AI-assisted pull requests."
