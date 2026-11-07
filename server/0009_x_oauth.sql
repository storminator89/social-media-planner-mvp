-- X-only encrypted aggregate. Apply explicitly at deployment; never in HTTP requests.
CREATE TABLE IF NOT EXISTS x_oauth_aggregates (
 site_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 config_fingerprint TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1),
 state TEXT NOT NULL CHECK(state IN ('pending','active','refresh_in_flight','disconnected')),
 connection_id TEXT,
 revision INTEGER NOT NULL CHECK(revision >= 0),
 envelope TEXT,
 PRIMARY KEY(site_id, owner_id),
 CHECK((state = 'disconnected' AND envelope IS NULL) OR (state != 'disconnected' AND envelope IS NOT NULL))
);
