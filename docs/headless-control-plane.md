# Headless Control Plane

Tabellio owns agent workflow. Remote provider owns Git transport and repository implementation. Forgejo stays private and replaceable.

## Public Surfaces

| Surface | Purpose | Exposure |
| --- | --- | --- |
| Tabellio API | Repository jobs, scoped credentials, change requests, validation, merge intents, job status | Agent-facing |
| Git gateway | Standard clone, fetch, and push | Agent-facing; smart HTTP routes only |
| Forgejo API | Repository and review backend adapter | Private network only |
| Forgejo UI | Operator break-glass debugging | Private network only; not product |

## API Contract

| Method | Path | Scope | Result |
| --- | --- | --- | --- |
| `GET` | `/v1/health` | none | Service health |
| `POST` | `/v1/repositories` | `repository:write` | `202` provisioning job |
| `GET` | `/v1/repositories/{id}` | `repository:read` | Canonical repository record |
| `POST` | `/v1/repositories/{id}/credentials` | `credential:issue` | Short-lived Git credential; `no-store` |
| `POST` | `/v1/change-requests` | `change-request:write` | `202` creation job |
| `POST` | `/v1/validations` | `validation:run` | `202` exact-commit validation job |
| `POST` | `/v1/merge-intents` | `merge:intent` | `202` exact-head intent job |
| `POST` | `/v1/merge-intents/{id}/approvals` | `merge:approve` | `202` short-lived approval job |
| `POST` | `/v1/merge-intents/{id}/executions` | `merge:execute` | `202` approval-bound merge job |
| `GET` | `/v1/jobs/{id}` | `job:read` | Tenant-bound job state |

Mutation requests require `Idempotency-Key`. API layer validates shape, scope, tenant, repository identity, and exact Git object IDs before queueing work. Routes stay thin. Workers perform provider calls and untrusted validation.

## Runtime Boundaries

```text
agent
  |-- JSON + scoped token --> Tabellio API --> PostgreSQL + durable queue
  |                                      \--> isolated workers --> private Forgejo API
  \-- Git smart HTTP ------> Git-only gateway ------------------> private Forgejo
```

Code, review ledgers, validation results, and Entire checkpoints remain Git-native. PostgreSQL stores operational records: repository bindings, jobs, leases, idempotency keys, webhook deliveries, and credential audit metadata. Credential secrets never enter PostgreSQL.

## Deployment

`infra/forgejo/compose.production.yml` proves production topology locally:

- pinned Forgejo
- PostgreSQL metadata database
- durable named volumes
- registration and Actions disabled
- Forgejo port private
- Nginx exposing only Git smart HTTP and health

Production cloud mapping:

- Forgejo container on private compute
- managed PostgreSQL
- encrypted durable filesystem for live repositories
- object storage for backups, artifacts, and optional LFS
- load balancer in front of Git gateway
- separate Tabellio API and worker services
- durable queue with dead-letter handling

Do not mount object storage as live Git repository storage. Git needs filesystem semantics and atomic ref updates.

## Failure Rules

- Database unavailable: reject mutations before accepting work.
- Queue unavailable: return `503`; never claim queued work.
- Forgejo unavailable: retry bounded provider jobs; preserve queued intent.
- Worker crash: lease expires; another worker reclaims job.
- Duplicate request: return original job when digest matches; `409` when input differs.
- Stale merge head: fail closed; require new review and approval.
- Duplicate webhook: deduplicate by provider delivery ID.

## Rollback

Platform v0.1 configuration remains readable. Standard Git refs remain portable. Backend switch changes adapter configuration, not code or control-ledger formats. Never delete canonical refs during provider migration.
