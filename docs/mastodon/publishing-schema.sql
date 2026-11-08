-- Offline candidate only. Not installed by server or worker; no migration applied.
CREATE TABLE mastodon_publishing_grants (
 site_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0), envelope TEXT NOT NULL,
 PRIMARY KEY(site_id,owner_id)
);
CREATE TABLE mastodon_publications (
 site_id TEXT NOT NULL, owner_id TEXT NOT NULL, review_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('outcome_unknown','published')),
 provider_id TEXT,
 CHECK ((state='published' AND provider_id IS NOT NULL) OR
        (state='outcome_unknown' AND provider_id IS NULL)),
 PRIMARY KEY(site_id,owner_id,review_id)
);
