# Operations Hardening

Tabellio keeps code and control state in standard Git objects, but production safety still depends on bounded workers and disciplined ref publication.

## Concurrency And Recovery

- Review and validation ledgers use compare-and-swap ref updates. Concurrent writers cannot silently overwrite one another.
- Stack and control-ref mutations use crash-safe compare-and-swap locks under local `refs/tabellio/locks/`. A live same-host process or valid cross-host owner blocks another writer.
- A dead same-host process lock is deleted only when its exact Git object ID still matches, so concurrent recovery cannot remove a replacement owner.
- Deploy one writer per repository on shared storage. Cross-host locks fail safe and require operator recovery when the recorded host is permanently unavailable.

## Bounded Work

- Validation manifests allow at most 50 commands or validators, 100 arguments per entry, and one-hour command timeouts.
- Timed-out commands receive `SIGTERM`, then `SIGKILL` after one second. Fail-fast suites mark remaining commands skipped.
- Full stdout and stderr are hashed; only the newest 16 KiB of each stream is retained.
- Typed evidence files are limited to 1 MiB, 100 metrics, and 50 immutable artifact references. Required missing cost telemetry blocks validation instead of being treated as zero spend.
- Agent reviews allow at most 1,000 findings. Review cycles bound feedback, fixes, check statuses, titles, bodies, summaries, event details, and retained event history.
- Remote control-ref reads and atomic pushes use a 15-minute timeout. Local atomic ref updates use a 30-second timeout.

## Canonical Code Repository

GitHub `origin` is the canonical code repository and merge authority:

1. Validate the exact pull-request head.
2. Merge through the approved git-spice operation.
3. Fetch canonical `main` from `origin`.
4. Verify local `main` and `origin/main` resolve to the same object ID.

Do not maintain a second merge authority. Independent squash or rebase merges create different histories even when file content matches.

## Local Evidence And Optional Publication

The v0.4 default retains genuine Entire checkpoints, review history and validation
results locally. It requires no private GitHub control repository. Automatic
Entire pushing stays disabled. Local release intents bind the three evidence-ref
object IDs; execution rechecks them and reports verification, not publication.

Optional explicit private GitHub transport retains atomic compare-and-swap
publication, short-lived approvals and divergence rejection. Legacy v0.3 configs
and remote release intents remain supported. The standalone transport's remote
alias is not a destination identity guarantee; review the effective destination
and privacy before authorizing it.

Status publication uses one customer-owned bare Git authority selected in the
approved intent. Every publishing process must use it. Its pending reservation
is durable before delivery, so a crash or uncertain response does not permit a
repeat. Separate authorities do not coordinate. Treat the authority owner as
trusted: copying or rolling back its history can remove consumed approvals.
After restoring a backup, fence publication until outstanding approvals expire
or reconcile every potentially delivered status before issuing new approvals.
Approval JSON binds content; it does not authenticate the person named in it.
Keep approval creation and publishing under the customer's trusted-worker access
boundary. Multi-user authorization is a separate hardening phase.

## Production Checklist

- Back up local evidence refs, the publication authority and PostgreSQL data; test each restoration separately.
- Isolate validation workers for untrusted code; detached worktrees are not sandboxes.
- Scope publication and optional private-remote GitHub credentials per repository and keep them out of URLs, arguments, and logs.
- Monitor failed receipts, stale cross-host locks, validation duration, queue depth, and ref divergence.
- Reconcile divergent local evidence before retrying. Republish only when optional remote mode is explicitly selected and its operation is approved.
