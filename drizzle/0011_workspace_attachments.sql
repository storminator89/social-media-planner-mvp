-- Additive protection: retained workspace JSON references are never cascaded away.
-- Applies to active, discarded and expired records, matching the legacy media FK.
CREATE TRIGGER workspace_attachment_media_delete
BEFORE DELETE ON planner_media
WHEN EXISTS (
 SELECT 1 FROM planner_editor_workspaces w,
 json_each(CASE WHEN json_valid(w.payload_json) THEN coalesce(json_extract(w.payload_json,'$.attachments'),'[]') ELSE '[]' END) a
 WHERE w.owner_id=OLD.owner_id AND json_extract(a.value,'$.id')=OLD.id
)
BEGIN SELECT RAISE(ABORT,'workspace attachment is retained'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_attachment_media_identity_update
BEFORE UPDATE OF owner_id,id ON planner_media
WHEN (NEW.owner_id!=OLD.owner_id OR NEW.id!=OLD.id) AND EXISTS (
 SELECT 1 FROM planner_editor_workspaces w,
 json_each(CASE WHEN json_valid(w.payload_json) THEN coalesce(json_extract(w.payload_json,'$.attachments'),'[]') ELSE '[]' END) a
 WHERE w.owner_id=OLD.owner_id AND json_extract(a.value,'$.id')=OLD.id
)
BEGIN SELECT RAISE(ABORT,'workspace attachment is retained'); END;
