# Public Safety Scan

Date: 2026-07-02

Scope: public extraction artifacts only.

Included:

- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `docs/research-grounding.md`
- `docs/oss-readiness.md`
- `docs/workflow-model.md`
- `docs/evidence-schema.md`
- `schemas/`
- `examples/`
- `scripts/check-agentic-evidence-envelope.mjs`
- `scripts/check-agentic-external-actions.mjs`
- `scripts/write-agentic-evidence-envelope.mjs`
- `templates/`
- `.github/workflows/agentic-evidence.yml`

Excluded: legacy private pilot app files, provider tools, domain examples, and app package metadata that are not part of the standalone v0 extraction cut.

## Private Name Scan

Command class:

```bash
rg -n "<private brand, provider, ticket, local path, session id, and repository-name patterns>" \
  README.md SECURITY.md CONTRIBUTING.md LICENSE \
  docs/research-grounding.md docs/oss-readiness.md docs/workflow-model.md docs/evidence-schema.md \
  schemas examples \
  scripts/check-agentic-evidence-envelope.mjs scripts/check-agentic-external-actions.mjs scripts/write-agentic-evidence-envelope.mjs \
  templates .github/workflows/agentic-evidence.yml
```

Result: no matches.

## JSON Parse Check

Command:

```bash
node -e "for (const p of ['schemas/evidence-envelope.schema.json','schemas/external-action-policy.schema.json','examples/agentic-evidence/minimal-evidence.json']) JSON.parse(require('fs').readFileSync(p,'utf8')); console.log('json ok')"
```

Result: `json ok`.

## Remaining Before Public Repo

- run a real secret scanner on the standalone extraction repo
- create standalone package metadata without private pilot scripts
- run OpenSSF Scorecard after the repo is public
- verify branch protection or merge queue settings in the final host repo
