-- Offline-only vault. Explicit migration, not run by HTTP or the local app.
-- Quarantined means verified identity, not a usable connection or known expiry.
CREATE TABLE IF NOT EXISTS planner_instagram_vault (
 site_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 config_fingerprint TEXT NOT NULL,
 context_fingerprint TEXT NOT NULL,
 expected_account_id TEXT NOT NULL,
 state_hash TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision >= 1),
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('pending','quarantined','disconnected')),
 verified_at_ms INTEGER,
 envelope TEXT,
 PRIMARY KEY(site_id,owner_id),
 UNIQUE(site_id,owner_id,state_hash),
 CHECK((lifecycle='quarantined' AND envelope IS NOT NULL AND verified_at_ms IS NOT NULL) OR (lifecycle!='quarantined' AND envelope IS NULL AND verified_at_ms IS NULL))
);
