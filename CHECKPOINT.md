# Deployed v21 source checkpoint

This branch records the application source deployed as private Site version 21. It is a source backup, not a deployment or database backup. No user content, credentials, runtime databases, uploads, private hosting configuration, or private Git history is included.

Relative to the v20 checkpoint, this adds the single-image in-app editor and safer handling of uncertain media metadata writes. It introduces no schema changes or new migrations. Existing schema and migration files are retained. Editing does not publish social-media posts. Unreleased import and multi-attachment candidates are excluded.

Generated Worker output is excluded and can be rebuilt with npm run build:worker. MANIFEST.sha256 describes this sanitized source snapshot.
