# v30 source checkpoint

This source backup records the application source deployed as version 30, at commit ae38e801809d479652f43ed4d4e65727ddd66144.

Relative to the public v25 checkpoint, it includes saved-image reuse, local image paste, canvas crop dragging, calendar rescheduling and focus/save safeguards, and a more compact planning interface. Existing provider, persistence, identity and origin protections are retained. It does not enable automatic social-media posting.

All application/runtime files, schema migrations, build scripts and executable tests are byte-identical to the v30 deployed source. There are no test-only differences. The v30 source already includes deterministic ciphertext alteration in the two OAuth tampering tests. Documentation and ignore rules are sanitized separately, and the root source manifest is regenerated.

This is a source backup, not a deployment or database backup. User content, credentials, runtime databases, uploads, private hosting configuration, private review records, historical browser evidence and private Git history are excluded. The two MP4/WebM files under tests/video-still/fixtures are bounded synthetic test assets, not user media. Generated Worker output is excluded and can be rebuilt with npm run build:worker. MANIFEST.sha256 inventories every included file except itself. Older component manifests and historical verification documents are not acceptance results for v30.

Preparing or publishing this checkpoint does not deploy an application, run a migration, activate a provider, or change any host or security setting.
