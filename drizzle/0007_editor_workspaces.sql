-- Separate unfinished editor work. Existing post/media tables are unchanged.
-- Legacy planner tables are bound to one Site DB and scoped by authenticated owner.
-- No source-post FK: ordinary planner snapshots delete/reinsert those rows.
CREATE TABLE planner_editor_workspaces (
 site_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 workspace_id TEXT NOT NULL,
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
 revision INTEGER NOT NULL CHECK(revision>=1),
 state TEXT NOT NULL CHECK(state IN ('active','discarded','expired')),
 source_post_id TEXT,
 base_planner_revision INTEGER CHECK(base_planner_revision IS NULL OR base_planner_revision>=0),
 payload_json TEXT NOT NULL,
 media_id TEXT,
 last_write_id TEXT,
 last_write_hash TEXT,
 last_operation TEXT NOT NULL CHECK(last_operation IN ('save','discard','expire')),
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 PRIMARY KEY(site_id,owner_id,workspace_id),
 CHECK(expires_at_ms>created_at_ms),
 CHECK(length(CAST(payload_json AS BLOB))<=131072),
 FOREIGN KEY(owner_id,media_id) REFERENCES planner_media(owner_id,id)
);
--> statement-breakpoint
CREATE INDEX planner_editor_workspaces_owner_state ON planner_editor_workspaces(site_id,owner_id,state,updated_at_ms);
