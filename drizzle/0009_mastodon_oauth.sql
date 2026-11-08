-- Apply only during a separately approved deployment. Never install on HTTP request.
CREATE TABLE mastodon_oauth_attempts (
 site_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 envelope TEXT NOT NULL,
 PRIMARY KEY(site_id,owner_id)
);
