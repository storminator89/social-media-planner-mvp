-- Editorial configuration only. No jobs or automatic publication.
ALTER TABLE planner_channels ADD COLUMN posting_schedule_json TEXT
  CHECK (posting_schedule_json IS NULL OR json_valid(posting_schedule_json));
--> statement-breakpoint
ALTER TABLE planner_posts ADD COLUMN schedule_binding_json TEXT
  CHECK (schedule_binding_json IS NULL OR json_valid(schedule_binding_json));
--> statement-breakpoint
-- Short-lived proof of an exact queue-bound deletion; no retained content copy.
CREATE TABLE planner_schedule_undo (
  owner_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  deleted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id,post_id),
  FOREIGN KEY (owner_id) REFERENCES planner_profiles(owner_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX planner_schedule_undo_expiry ON planner_schedule_undo(owner_id,expires_at);
