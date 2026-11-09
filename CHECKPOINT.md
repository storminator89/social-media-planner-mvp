# v24 source checkpoint with deterministic test correction

This branch records the application source deployed as private Site version 24, plus the previously reviewed test-only correction to the two OAuth tampering tests. Those tests always alter decoded ciphertext. Application runtime code and production build match the deployed version.

Relative to v23, this adds the channel-text review. No new migrations or automatic social-media posting is enabled. Unreleased import and multi-attachment candidates are excluded.

This is a source backup, not a deployment or database backup. User content, credentials, runtime databases, uploads, private hosting configuration, private review records and private Git history are excluded. Generated Worker output can be rebuilt with npm run build:worker. MANIFEST.sha256 describes this sanitized source snapshot.
