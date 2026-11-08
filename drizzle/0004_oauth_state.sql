-- Offline state lifecycle only. No authorization codes, PKCE verifiers, tokens,
-- encryption keys, credentials or grants are stored. Existing tables unchanged.
CREATE TABLE planner_oauth_states (
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  state_hash TEXT NOT NULL CHECK (length(state_hash) = 64),
  browser_binding_hash TEXT NOT NULL CHECK (length(browser_binding_hash) = 64),
  provider TEXT NOT NULL CHECK (provider IN ('linkedin','instagram','youtube','x')),
  redirect_uri TEXT NOT NULL,
  scope_fingerprint TEXT NOT NULL CHECK (length(scope_fingerprint) = 64),
  config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
  flow_version TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL CHECK (length(context_fingerprint) = 64),
  nonce_fingerprint TEXT NOT NULL CHECK (length(nonce_fingerprint) = 64),
  claim_receipt_id TEXT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  PRIMARY KEY (site_id,owner_id,state_hash),
  CHECK (expires_at_ms > created_at_ms AND expires_at_ms <= created_at_ms + 600000),
  CHECK (consumed_at_ms IS NULL OR (consumed_at_ms >= created_at_ms AND consumed_at_ms < expires_at_ms))
);
--> statement-breakpoint
CREATE INDEX planner_oauth_states_owner_expiry ON planner_oauth_states(site_id,owner_id,expires_at_ms);
