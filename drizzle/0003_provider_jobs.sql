-- Additive preparation only. No credentials, live authorization, or publishing
-- enablement is represented by these rows. Existing planner tables are untouched.
CREATE TABLE planner_provider_connections (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('instagram','linkedin','youtube')),
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','setup_required','approval_required','disabled','error')),
  reason_code TEXT NOT NULL DEFAULT 'OAUTH_NOT_CONFIGURED' CHECK (reason_code IN ('OAUTH_NOT_CONFIGURED','ACCOUNT_NOT_VERIFIED','PLATFORM_APPROVAL_REQUIRED','USER_AUTHORIZATION_REQUIRED','PUBLISHING_DISABLED','CONNECTION_ERROR','STATUS_UNAVAILABLE')),
  publishing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (publishing_enabled = 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id,id),
  UNIQUE (owner_id,provider)
);
--> statement-breakpoint
CREATE TABLE planner_publication_jobs (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('instagram','linkedin','youtube')),
  connection_id TEXT,
  post_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  payload_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (payload_schema_version = 1),
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'blocked' CHECK (state IN ('blocked','cancelled')),
  reason_code TEXT NOT NULL DEFAULT 'PUBLISHING_DISABLED' CHECK (reason_code IN ('PUBLISHING_DISABLED','CANCELLED_BY_USER')),
  publishing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (publishing_enabled = 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id,id),
  UNIQUE (owner_id,idempotency_key),
  FOREIGN KEY (owner_id,connection_id) REFERENCES planner_provider_connections(owner_id,id)
);
--> statement-breakpoint
CREATE INDEX planner_publication_jobs_owner_created ON planner_publication_jobs(owner_id,created_at);
