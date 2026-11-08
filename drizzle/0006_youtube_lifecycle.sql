-- YouTube-only additive lifecycle. Prior migrations and LinkedIn remain unchanged.
CREATE TABLE planner_youtube_oauth_states (
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  state_hash TEXT NOT NULL CHECK (length(state_hash) = 64),
  browser_binding_hash TEXT NOT NULL CHECK (length(browser_binding_hash) = 64),
  provider TEXT NOT NULL CHECK (provider = 'youtube'),
  redirect_uri TEXT NOT NULL,
  scope_fingerprint TEXT NOT NULL CHECK (length(scope_fingerprint) = 64),
  config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
  flow_version TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL CHECK (length(context_fingerprint) = 64),
  expected_channel_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
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
CREATE INDEX planner_youtube_oauth_states_owner_expiry ON planner_youtube_oauth_states(site_id,owner_id,expires_at_ms);

--> statement-breakpoint
CREATE TABLE planner_youtube_credentials (
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'youtube'),
  connection_id TEXT NOT NULL,
  config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
  context_fingerprint TEXT NOT NULL CHECK (length(context_fingerprint) = 64),
  expected_channel_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'empty' CHECK (lifecycle IN ('empty','active','disconnected')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  auth_epoch INTEGER NOT NULL DEFAULT 0 CHECK (auth_epoch >= 0),
  subject TEXT,
  channel_id TEXT,
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
  CHECK ((lifecycle = 'active' AND subject IS NOT NULL AND channel_id IS NOT NULL AND expires_at_ms IS NOT NULL AND key_id IS NOT NULL AND iv IS NOT NULL AND ciphertext IS NOT NULL)
      OR (lifecycle != 'active' AND subject IS NULL AND channel_id IS NULL AND expires_at_ms IS NULL AND key_id IS NULL AND iv IS NULL AND ciphertext IS NULL))
);
--> statement-breakpoint
CREATE TABLE planner_youtube_install_tickets (
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  state_hash TEXT NOT NULL CHECK (length(state_hash) = 64),
  provider TEXT NOT NULL CHECK (provider = 'youtube'),
  config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
  context_fingerprint TEXT NOT NULL CHECK (length(context_fingerprint) = 64),
  expected_channel_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  expected_epoch INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','checked_out','committed','cancelled')),
  checkout_receipt TEXT,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  PRIMARY KEY (site_id,owner_id,state_hash),
  FOREIGN KEY (site_id,owner_id,provider) REFERENCES planner_youtube_credentials(site_id,owner_id,provider),
  CHECK (expires_at_ms > created_at_ms AND expires_at_ms <= created_at_ms + 600000)
);
--> statement-breakpoint
CREATE INDEX planner_youtube_install_tickets_expiry ON planner_youtube_install_tickets(site_id,owner_id,expires_at_ms);
--> statement-breakpoint
CREATE TABLE planner_youtube_media (
 site_id TEXT NOT NULL, owner_id TEXT NOT NULL, media_id TEXT NOT NULL,
 connection_id TEXT NOT NULL, auth_epoch INTEGER NOT NULL CHECK(auth_epoch>=1),
 object_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 8388608),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('video/mp4','video/webm')),
 filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 255),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready')),
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(site_id,owner_id,media_id),
 UNIQUE(site_id,owner_id,sha256,byte_size,mime_type),
 FOREIGN KEY(site_id,owner_id,connection_id) REFERENCES planner_youtube_credentials(site_id,owner_id,connection_id)
);
--> statement-breakpoint
CREATE TABLE planner_youtube_uploads (
 site_id TEXT NOT NULL, owner_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 connection_id TEXT NOT NULL, auth_epoch INTEGER NOT NULL,
 channel_id TEXT NOT NULL, config_fingerprint TEXT NOT NULL, context_fingerprint TEXT NOT NULL,
 media_id TEXT NOT NULL, media_sha256 TEXT NOT NULL, total_bytes INTEGER NOT NULL, mime_type TEXT NOT NULL,
 operation_json TEXT NOT NULL, operation_fingerprint TEXT NOT NULL CHECK(length(operation_fingerprint)=64),
 content_fingerprint TEXT NOT NULL CHECK(length(content_fingerprint)=64),
 attempt_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('prepared','approved','in_flight','session_ready','unknown','auth_required','rate_limited','quota_exceeded','blocked','upload_accepted','cancelled')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), approved_at_ms INTEGER,
 next_offset INTEGER NOT NULL DEFAULT 0 CHECK(next_offset>=0 AND next_offset<=total_bytes),
 chunk_bytes INTEGER, retry_at_ms INTEGER, video_id TEXT,
 outcome_code TEXT CHECK(outcome_code IS NULL OR outcome_code IN ('PROVIDER_OUTCOME_UNKNOWN','CREDENTIALS_REQUIRED','SESSION_NOT_FOUND_OR_EXPIRED','RATE_LIMITED','QUOTA_EXCEEDED','PROVIDER_PERMISSION_DENIED','VIDEO_IDENTITY_NOT_VERIFIED','UNEXPECTED_PROVIDER_VISIBILITY','PREMATURE_COMPLETION','PROBE_REQUIRED_BEFORE_UPLOAD','RETRY_AFTER_NOT_REACHED')),
 manual_reconciliation INTEGER NOT NULL DEFAULT 0 CHECK(manual_reconciliation IN (0,1)),
 session_key_id TEXT, session_iv TEXT, session_ciphertext TEXT, session_cipher_revision INTEGER,
 lease_receipt TEXT, lease_until_ms INTEGER, lease_action TEXT,
 created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
 PRIMARY KEY(site_id,owner_id,operation_id),
 UNIQUE(site_id,owner_id,connection_id,auth_epoch,content_fingerprint),
 FOREIGN KEY(site_id,owner_id,media_id) REFERENCES planner_youtube_media(site_id,owner_id,media_id),
 FOREIGN KEY(site_id,owner_id,connection_id) REFERENCES planner_youtube_credentials(site_id,owner_id,connection_id),
 CHECK ((session_ciphertext IS NULL AND session_key_id IS NULL AND session_iv IS NULL AND session_cipher_revision IS NULL)
 OR (session_ciphertext IS NOT NULL AND session_key_id IS NOT NULL AND session_iv IS NOT NULL AND session_cipher_revision>0)),
 CHECK ((state='in_flight' AND lease_receipt IS NOT NULL AND lease_until_ms IS NOT NULL AND lease_action IN ('start','upload','probe'))
 OR (state!='in_flight' AND lease_receipt IS NULL AND lease_until_ms IS NULL AND lease_action IS NULL))
);
--> statement-breakpoint
CREATE INDEX planner_youtube_uploads_owner_created ON planner_youtube_uploads(site_id,owner_id,created_at_ms);
