-- Append-only migration. Existing variants remain independent, even when their
-- text equals the shared body: equality does not prove inheritance intent.
ALTER TABLE planner_variants ADD COLUMN inherits_body INTEGER NOT NULL DEFAULT 0 CHECK (inherits_body IN (0, 1));
