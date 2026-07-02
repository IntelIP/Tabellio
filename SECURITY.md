# Security Policy

## Supported Versions

This project is currently pre-release. Security reports should target the latest `main` branch until versioned releases exist.

## Reporting a Vulnerability

Report security issues privately to the project maintainer before public disclosure.

Include:

- affected file or workflow
- reproduction steps
- expected impact
- whether the issue could allow unapproved external actions, secret disclosure, evidence tampering, or misleading PR status

Do not include live secrets, credentials, private keys, tokens, or account data in reports.

## Security Model

Agentic Git Workflow assumes generated code and agent claims are untrusted until validated by deterministic checks.

The default security posture:

- evidence is explicit and machine-readable
- external action classes are default-deny
- deployment, migration, infrastructure, DNS, hosting, billing, live-money, credentialed provider reads, secret-value reads, and destructive workspace actions require explicit approval
- evidence checks should run in CI before review and merge
- merge queues or branch protection should keep main protected

## Out of Scope for v0

The v0 workflow does not claim:

- SLSA compliance
- in-toto verification
- cryptographic signing of evidence
- complete supply-chain protection
- autonomous production safety

These can be added later, but v0 should describe itself as SLSA- and in-toto-inspired.

## Maintainer Checklist

Before publishing a release:

- run private-name scan
- run secret scan
- confirm no local absolute paths remain
- confirm no private session ids remain
- confirm no provider account context remains
- validate example evidence
- validate generated evidence
- verify external action checker blocks attempted unapproved actions
