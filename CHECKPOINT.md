# v25 source checkpoint with deterministic test correction

This snapshot records the application source deployed as version 25 on 2026-11-09, at commit c4ccb54eec4cc82073f222729ae261bf3326a31c.

Relative to the previous public v24 snapshot, this includes additive text-only planner import, safer duplication and idea deletion, time-change guidance, a shorter composer with contextual Mastodon status, and a local video-to-still picker integrated with the image editor. The video itself is not uploaded. Adopting a still opens it in the image editor; adding the resulting JPG to a post remains an explicit separate action. No automatic social-media posting or new database migration is enabled.

The only security-header change is the explicitly approved `media-src 'self' blob:` directive in the existing local and hosted handlers. Other CSP directives, origin and identity checks remain unchanged.

The previously reviewed deterministic correction to the two OAuth tampering tests is retained. These tests always alter decoded ciphertext. All application runtime files and the production build match the deployed source. Those two tests are the only test-source differences; documentation, the source inventory and ignore rules are sanitized separately.

This is a source backup, not a deployment or database backup. User content, credentials, runtime databases, uploads, private hosting configuration, private review records, browser evidence and private Git history are excluded. The two MP4/WebM files under tests/video-still/fixtures are bounded synthetic test assets, not user media. Generated Worker output is excluded and can be rebuilt with npm run build:worker. MANIFEST.sha256 describes this source snapshot.
