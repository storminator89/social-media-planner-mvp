CREATE TABLE planner_profiles (
  owner_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'de-DE',
  write_token TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE planner_channels (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#64748b',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  connection_status TEXT NOT NULL DEFAULT 'manual' CHECK (connection_status = 'manual'),
  PRIMARY KEY (owner_id,id),
  FOREIGN KEY (owner_id) REFERENCES planner_profiles(owner_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE planner_posts (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL CHECK (stage IN ('idea','draft','planned','archived')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover TEXT CHECK (cover IS NULL OR cover IN ('sunrise','forms','studio','nature')),
  scheduled_at TEXT,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id,id),
  FOREIGN KEY (owner_id) REFERENCES planner_profiles(owner_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE planner_variants (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'post',
  status TEXT NOT NULL CHECK (status IN ('draft','ready','planned','published','failed')),
  scheduled_at TEXT,
  timezone TEXT NOT NULL,
  published_at TEXT,
  published_url TEXT,
  status_note TEXT NOT NULL DEFAULT '',
  media_ids_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (owner_id,id),
  UNIQUE (owner_id,post_id,channel_id),
  FOREIGN KEY (owner_id,post_id) REFERENCES planner_posts(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id,channel_id) REFERENCES planner_channels(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE planner_media (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id,id)
);
--> statement-breakpoint
CREATE INDEX planner_posts_owner_schedule ON planner_posts(owner_id, scheduled_at);
--> statement-breakpoint
CREATE INDEX planner_variants_owner_schedule ON planner_variants(owner_id, scheduled_at);
--> statement-breakpoint
CREATE INDEX planner_media_owner_created ON planner_media(owner_id, created_at);
