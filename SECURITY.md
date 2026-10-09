# Security policy

## Supported scope

Report issues affecting the published **0.7.0** package or current `main`.
No older-version maintenance branches are promised. Include the exact package
version and source commit when available.

## Private vulnerability reporting

Use [GitHub's private report form](https://github.com/IntelIP/WritSet/security/advisories/new).
Do not file vulnerability details in a public issue. The private form is the
project's reporting route; ordinary bugs and questions use
[GitHub Issues](https://github.com/IntelIP/WritSet/issues).

Include the affected version/file, minimal reproduction, expected and actual
behavior, likely impact, and safe evidence references. Explain whether the issue
allows unapproved actions, disclosure, evidence tampering, or misleading review status.
Never include live credentials, tokens, private keys, raw session transcripts,
provider bodies, or account data. Coordinate disclosure with the maintainer;
no response-time or bounty promise is implied.

## Current security boundaries

Generated code, imported observations, and agent claims need independent checks.
Evidence names an exact candidate; missing, stale, conflicting, or failed proof
remains blocking. See [product validation](docs/product-validation.md).

| Area | Current boundary |
| --- | --- |
| External actions | Default-deny; approval must cover the attempted action. |
| Private state | Local customer-owned checkpoint, validation, and review refs by default. |
| Public GitHub | Code and PRs; no private sessions or checkpoint bundles in public artifacts. |
| Provenance packets | Candidate-scoped safe facts with a bounded envelope. |
| Security receipts | Independent lineage/policy binding; failed or unavailable checks block review. |
| Status publication | Short-lived intent-bound approval and a shared trusted-worker authority. |

The pinned Gitleaks and ast-grep checks inspect immutable Git blobs without
executing candidate code. Rules cover secrets, unverified JWT use, unsigned JWT
configuration, disabled TLS verification, dynamic `eval`, and declared dependency
policy. Candidate ignore files cannot grant a pass. Remaining declared dependencies
need vulnerability evidence. Read [scanner operations](docs/provenance.md) for limits.

WritSet does not claim complete vulnerability detection, SLSA certification,
in-toto verification, cryptographic evidence signing, complete supply-chain
protection, or autonomous production safety. Synthetic security observations in
the demo do not prove scanner effectiveness or live-provider security.

## Maintainer checks

Run existing private-name/secret checks, required repository checks, provenance
security checks, and exact-head validation. Verify that attempted protected actions
without approval fail. Confirm review clearance for the same head.

Keep [data-retention boundaries](tabellio.data-boundary.json) and
[operations hardening](docs/operations-hardening.md) intact. Sharing checkpoint
proof or changing protected environments requires its own explicit authorization.
