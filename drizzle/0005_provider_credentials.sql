-- Application-managed encrypted credentials. No key material is stored here.
-- Existing provider tables, capabilities and migration history are unchanged.
CREATE TABLE planner_provider_credentials (
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'linkedin'),
  connection_id TEXT NOT NULL,
  config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
  context_fingerprint TEXT NOT NULL CHECK (length(context_fingerprint) = 64),
  lifecycle TEXT NOT NULL DEFAULT 'empty' CHECK (lifecycle IN ('empty','active','disconnected')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  auth_epoch INTEGER NOT NULL DEFAULT 0 CHECK (auth_epoch >= 0),
  subject TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at_ms INTEGER,
  cipher_version INTEGER NOT NULL DEFAULT 1 CHECK (cipher_version = 1),
  key_id TEXT,
  iv TEXT,
  ciphertext TEXT,
  last_write_receipt TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (site_id,owner_id,provider),
  UNIQUE (site_id,owner_id,connection_id),
  CHECK ((lifecycle = 'active' AND subject IS NOT NULL AND expires_at_ms IS NOT NULL AND key_id IS NOT NULL AND iv IS NOT NULL AND ciphertext IS NOT NULL)
      OR (lifecycle != 'active' AND subject IS NULL AND expires_at_ms IS NULL AND key_id IS NULL AND iv IS NULL AND ciphertext IS NULL))
);
--> statement-breakpoint
CREATE TABLE planner_oauth_install_tickets (
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  state_hash TEXT NOT NULL CHECK (length(state_hash) = 64),
  provider TEXT NOT NULL CHECK (provider = 'linkedin'),
  config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
  context_fingerprint TEXT NOT NULL CHECK (length(context_fingerprint) = 64),
  connection_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  expected_epoch INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','checked_out','committed','cancelled')),
  checkout_receipt TEXT,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  PRIMARY KEY (site_id,owner_id,state_hash),
  FOREIGN KEY (site_id,owner_id,provider) REFERENCES planner_provider_credentials(site_id,owner_id,provider),
  CHECK (expires_at_ms > created_at_ms AND expires_at_ms <= created_at_ms + 600000)
);
--> statement-breakpoint
CREATE INDEX planner_oauth_install_tickets_expiry ON planner_oauth_install_tickets(site_id,owner_id,expires_at_ms);
