# Local Forgejo Lab

This disposable Forgejo instance proves Tabellio can store and review code without GitHub.

Production-shaped topology lives in `compose.production.yml`. It uses PostgreSQL, durable named volumes, private Forgejo networking, disabled registration and Actions, and an Nginx gateway exposing only Git smart HTTP.

```bash
export FORGEJO_DATABASE_PASSWORD='replace-through-secret-manager'
export TABELLIO_GIT_DOMAIN=git.example.test
export TABELLIO_GIT_ROOT_URL=https://git.example.test/
docker compose -f infra/forgejo/compose.production.yml config
docker compose -f infra/forgejo/compose.production.yml up -d
```

Example proves topology. Production operator must add TLS termination, encrypted volumes, managed database, backup/restore automation, secret-manager injection, monitoring, and tested upgrades. Do not expose Forgejo port or UI publicly.

- HTTP binds only to `127.0.0.1:3300`.
- SSH binds only to `127.0.0.1:2222`.
- SQLite data stays under ignored `.tabellio/forgejo/`.
- Forgejo Actions stays disabled; runner work is a separate sprint.
- Image version is pinned to Forgejo `15.0.3`.

Use the lab CLI:

```bash
node scripts/dev/forgejo-lab.mjs up
node scripts/dev/forgejo-lab.mjs bootstrap
node scripts/dev/forgejo-lab.mjs seed
node scripts/dev/forgejo-lab.mjs status
node scripts/dev/forgejo-lab.mjs down
```

Bootstrap writes generated credentials below `.tabellio/forgejo/credentials/` with owner-only permissions. It prints file paths, never secret values. Its local admin token has only the scopes needed to create repositories, issues, and repository content in the disposable lab.

`seed` creates an idempotent private repository and open pull request for live provider checks. It reads the token from disk and never prints it.
