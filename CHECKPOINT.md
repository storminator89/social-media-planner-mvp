# v22 source checkpoint with deterministic test correction

This branch records the application source deployed as private Site version 22, plus a test-only correction to the two OAuth tampering tests. Those tests now always alter decoded ciphertext instead of sometimes leaving it unchanged. The correction does not change application runtime code or the production build and has not triggered a Site deployment.

Relative to the v21 checkpoint, this includes the channel planning queue. No schema changes or new migrations are introduced. Editing does not publish social-media posts. Unreleased import and multi-attachment candidates are excluded.

This is a source backup, not a deployment or database backup. User content, credentials, runtime databases, uploads, private hosting configuration, private review records and private Git history are excluded. Generated Worker output can be rebuilt with npm run build:worker. MANIFEST.sha256 describes this sanitized source snapshot.
