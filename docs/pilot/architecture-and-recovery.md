# Core architecture and evidence recovery

Tabellio binds evidence to a particular repository, project, base, head and merge
base. A change in any of those facts requires fresh evaluation. It does not make
code correct merely by collecting passing reports.

## Where the information lives

| Component | Role | What saving there establishes |
| --- | --- | --- |
| Code repository | Source, commits, pull requests and CI | The code and the checks actually retained by GitHub |
| Entire | Genuine agent-session checkpoints | Session provenance; a hand-written trailer is not a substitute |
| Customer-owned local Git evidence / optional private remote | Review, validation and checkpoint Git refs | Only reachable objects in the preserved refs; not a database backup |
| Local PostgreSQL store | Bounded observations, lineage, replay and review packets | Local persistence, not remote publication or a backup |
| Local receipts / CI artifacts | Command outcomes and diagnostic evidence | Results for their recorded runner/candidate, subject to artifact retention |

Provider adapters collect bounded observations. Lineage assembly checks links and
candidate identities; policy evaluation rejects missing, stale, conflicting or
failed required evidence. The review representation translates that decision into
separate review/security statuses. Publication requires an integrity-bound intent
and a current, short-lived approval.

## Publication failure and concurrency

Before sending statuses, local-mode publishers reserve approvals in one explicitly
selected customer-owned bare Git authority using atomic compare-and-swap ref
updates. Every publisher must use that same authority; independent stores do not
coordinate. Legacy explicit private-remote mode uses compare-and-swap Git pushes. A local pending receipt also records an
uncertain reservation attempt. This prevents two clones from intentionally
delivering under the same approval. Candidate identity is checked before each
status and again after delivery.

Every accepted provider response must match the requested commit, state, context,
description and target URL. Status IDs must be distinct canonical positive decimal
integers: reject leading zeros and numeric values that JavaScript cannot represent
exactly. The GitHub adapter rejects unsafe numeric IDs before string conversion.
A duplicate ID
cannot establish two deliveries: retain the accepted prefix and record a blocked
receipt. Replaying that approval must send nothing.

GitHub status delivery and control-receipt synchronization are separate writes.
If delivery succeeds but the final receipt cannot be synchronized, the private
remote can still contain a pending reservation. A retry must remain blocked even
when the local receipt says delivery completed. This is deliberate uncertainty,
not evidence that nothing happened. The test suite covers this boundary with an
injected control outage; it is not a live-provider or process-kill trial.

The three canonical control refs use a separate atomic Git publication path with
exact object expectations. Neither that operation nor a code-branch push implies
that local PostgreSQL data or arbitrary artifact files were uploaded.

## Read-only reconciliation before recovery

1. Record the exact code candidate and clean/dirty runner identity. Fetch remote
   control refs into separate audit refs, preserving local unpublished refs.
2. Record advertised object IDs, tip dates, reachable history and candidate-bound
   records. A private or unarchived repository can still hold old evidence.
3. Compare local refs and receipts, remote control state, and GitHub CI/status
   records. Missing local data is unknown, not proof that it never existed.
4. For uncertain delivery, inspect GitHub for each intended status and reconcile
   the saved reservation. Do not delete a reservation or reuse a consumed approval
   to make an operation run again.
5. Locate the original genuine Entire session/checkpoint before claiming session
   provenance. Do not reconstruct a fictional historical checkpoint from tests.
6. Preserve recovered artifacts with candidate identity and digests. Any remote
   publication needs the existing approval contract and verified destination.

A snapshot count is not a completeness proof. Deleted/unreachable objects, other
clones, expired CI artifacts and unpublished local evidence remain outside it.
An actual backup/restore drill must verify restoration and replay from preserved
sources in an isolated destination before operations acceptance is claimed.

## Verification boundaries

The source recovery demo can run `--verify-storage-tests true`; the distributed
tarball omits the repository test suite, so run the installed demo without that
source-only option. Run source storage tests separately. An installed demo uses
real temporary Git/PostgreSQL and synthetic provider records; it establishes local
recovery behavior, not genuine Entire capture or real GitHub publication.

Record full-suite skips explicitly and run required integration/scanner gates.
Keep exact-head validation separate from synthetic merge-commit CI. Independent
review, live-provider trials, control backup restoration and matched comparison
remain separate evidence requirements in [the acceptance plan](acceptance-plan.md).
