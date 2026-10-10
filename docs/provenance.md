# Provenance operations

For the installed-package demo, use [Try Tabellio](try-tabellio.md). Commands with
`node scripts/...` and `npm run ...` below are for a trusted source checkout.
Installed operators use `npx writset-provenance` and `npx writset-local-store`
with the corresponding CLI arguments. Follow [Operate and release](operate-and-release.md)
before publishing statuses or sharing private evidence.

Plane snapshots are a legacy import capability. IntelIP uses AgentShift for
current tracking; this package includes no AgentShift adapter.

## Local capture, storage, and replay

Tabellio includes a local PostgreSQL evidence projection.
Its current foundation stores source-attributed observations, typed relationships,
and exact base/head/merge-base identities. Imports are atomic and idempotent;
replay preserves the same digest. Missing, stale, conflicting, inferred, or failed
evidence prevents a passed review result. Review packets omit source payloads and
facts belonging to another candidate.

From this source checkout, run the sample on macOS or Linux with Node.js, Git, and PostgreSQL client/server binaries on `PATH`:

```bash
npm run tabellio:provenance:demo
```

The demo creates a temporary Git repository and private local PostgreSQL cluster,
imports a synthetic provider journey, restarts the database server, deletes and
replays the derived record, builds a review packet, and proves that a moved base
blocks the old evidence. It stops its server and removes its temporary files.
Git and PostgreSQL operations are real; Plane, Entire, GitHub, Buildkite, and
security observations in this sample are explicitly synthetic. This is not a
live-provider or security-scanner certification.

The demo receipt includes a failure matrix with expected and actual verdicts,
safe reasons, and lineage digests where available. It exercises missing, stale,
conflicting, tampered, secret, failed-validation, outage, and moved-base cases.
Source replay runs twice in a newly created local database, verifies the original
digest, and checks that source snapshots and Git refs remain unchanged. Cleanup
and local cost/time are recorded even when the demo fails.

To replace the sample security observation with real bounded checks, install
Gitleaks 8.30.1 and ast-grep 0.45.1 on `PATH`, then run:

```bash
node scripts/demo-provenance.mjs --verify-security-scanners true
```

On Apple Silicon macOS or x86-64 Linux, `. .buildkite/scripts/security-tools.sh`
installs the pinned tools into a temporary directory and exposes them on `PATH`.
Set `TABELLIO_SECURITY_TOOLS_DIR` to reuse a tool directory. The installer verifies
the Gitleaks archive checksum and does not run npm package install scripts.
Configured CI uses this setup before checks; the required security
validator fails when scanners are missing instead of skipping scanner fixtures.
Run the same required check locally with `npm run tabellio:provenance:security:check`.

The scanner reads immutable Git blobs without running candidate code. It uses
Gitleaks defaults and explicit JavaScript/TypeScript rules for unverified JWT
decoding, unsigned JWT configuration, disabled TLS verification, and dynamic
`eval`. Candidate ignore files and suppression comments cannot grant a pass.
Insecure HTTP dependency references fail; other declared npm dependencies remain
blocked pending vulnerability evidence. These checks cover the listed rules;
they do not establish the absence of all authorization or dependency defects.

`tabellio-provenance security --input <lineage.json> --repo <repo> --now <time>`
produces a separate security receipt. `import-security` accepts that receipt with
the scoped lineage query, current repository candidate, and expected
`--policy-digest`. It binds the receipt to the same safe packet and candidate,
rejects modified receipts, and preserves failed or unavailable checks as blocking
evidence. Findings contain rule IDs, severity, file locations, and content
digests; matched secrets and source snippets are omitted. The findings contract
is `schemas/provenance-security-review.schema.json`.

For development validation, include PostgreSQL integration tests in that same
isolated cluster:

```bash
node scripts/demo-provenance.mjs --verify-storage-tests true --out /tmp/tabellio-demo.json
```

`review` returns the full current candidate, distinct review and security verdicts,
actions for failed or blocked evidence, and matching GitHub status payloads. Known
Git and provider records receive source links; other records retain their exact
source identifiers and lineage digest. Load verified security finding locations
with `--security-input <receipt.json> --policy-digest <expected-digest>`.
`--report-url` supplies a credential-free report link for both status contexts.

`review-intent` prepares an immutable publication intent from the same scoped
lineage query. `publish-review` accepts `--intent-input` and `--approval-input`,
uses `GH_TOKEN`, rechecks the current candidate and GitHub origin,
and publishes separate `Tabellio / provenance review` and
`Tabellio / provenance security` contexts. The approval uses
`tabellio-provenance-status-approval/v0.1` with `id`, `intentDigest`, `approved: true`,
`approvedBy`, `approvedAt`, `expiresAt`, and `reason`; its lifetime is at most one
hour. Publication receipts report delivery separately from review verdicts.
Local operation needs no second GitHub repository. For status publication, select
one existing customer-owned bare Git authority with `--publication-store
/absolute/private/authority.git` when creating the intent. Every publisher must
use the same authority. Its atomic reservations prevent duplicate approval use;
uncertain delivery remains blocked until reconciled. This is a trusted-worker
contract, not distributed safety across independent local stores. Optional private
GitHub control transport remains available explicitly for existing deployments.
The demo uses synthetic provider records and a fake GitHub transport.

The `tabellio-provenance` CLI supports `capture`, `import`, `import-sources`, `replay`, `replay-sources`,
`show`, `review`, `review-intent`, `publish-review`, and `packet`. `import-sources` normalizes a bundle of Plane,
Entire, GitHub, and Buildkite snapshots and captures Git directly from `--repo`.
Readers preserve healthy sources while reporting authentication, permission,
missing-record, outage, and malformed-input failures as blocked. The demo imports
all five sources, then verifies missing independent security evidence blocks review.
External snapshots remain explicitly synthetic in the sample.
The packet contract is `schemas/provenance-review-packet.schema.json`. Packets
contain only candidate-scoped facts and fixed failure explanations; their complete
JSON envelope, including its digest, is limited to 65,536 UTF-8 bytes.
`replay-sources` rebuilds from the original source bundle using `--repo`, `--input`,
the original capture time in `--now`, and `--expected-digest` from the import receipt.
It writes only when the rebuilt digest matches; changed or missing sources return
blocked evidence without storing a replacement. Reordering snapshots and repeating
the replay preserve the same record. Source snapshots are never modified.
Database operations require an explicit local
`--database-url`; review and packet commands also require `--repo` so readiness
is checked against current Git state. `--now` supplies a deterministic evaluation
time for fixtures; normal operation uses current time. The lower-level
`tabellio-local-store` CLI defaults to the dedicated local `tabellio` database,
never an inherited application's `DATABASE_URL`.

The capture and retention boundary lives in `tabellio.data-boundary.json`.
Raw prompts, transcripts, provider bodies, and credentials are excluded. No cloud provisioning,
automatic publication, deployment, or learning is introduced.
