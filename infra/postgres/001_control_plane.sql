BEGIN;

CREATE SCHEMA IF NOT EXISTS tabellio;

CREATE TABLE IF NOT EXISTS tabellio.repositories (
  tenant_id text NOT NULL,
  id text NOT NULL,
  slug text NOT NULL,
  backend_provider text NOT NULL,
  backend_id text,
  backend_owner text NOT NULL,
  backend_name text NOT NULL,
  clone_url text,
  default_branch text NOT NULL DEFAULT 'main',
  state text NOT NULL CHECK (state IN ('provisioning', 'active', 'archived', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, slug),
  UNIQUE (backend_provider, backend_id)
);

CREATE TABLE IF NOT EXISTS tabellio.jobs (
  tenant_id text NOT NULL,
  id text NOT NULL,
  repository_id text,
  type text NOT NULL CHECK (type IN ('repository.provision', 'change-request.create', 'validation.run', 'merge.intent.create', 'merge.approval.record', 'merge.execute')),
  state text NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_by text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb,
  error jsonb,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_worker_id text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS jobs_claim_index
  ON tabellio.jobs (state, created_at)
  WHERE state IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS jobs_repository_index
  ON tabellio.jobs (tenant_id, repository_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tabellio.idempotency_keys (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  key text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  job_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, agent_id, key),
  FOREIGN KEY (tenant_id, job_id) REFERENCES tabellio.jobs (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tabellio.webhook_deliveries (
  provider text NOT NULL,
  delivery_id text NOT NULL,
  tenant_id text NOT NULL,
  repository_id text,
  event_type text NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('received', 'processed', 'rejected', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (provider, delivery_id)
);

CREATE TABLE IF NOT EXISTS tabellio.credential_grants (
  tenant_id text NOT NULL,
  id text NOT NULL,
  repository_id text NOT NULL,
  agent_id text NOT NULL,
  scopes text[] NOT NULL,
  provider text NOT NULL,
  provider_credential_id text,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id)
);

COMMENT ON TABLE tabellio.credential_grants IS 'Audit metadata only. Never store Git credential secrets in PostgreSQL.';

COMMIT;
