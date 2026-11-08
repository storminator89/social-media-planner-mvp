# Deployed v14 source checkpoint

This branch records the application source deployed as private Site version 14 on 2026-11-08. It is a source backup, not a deployment or database backup. It does not enable provider connections or publish social-media posts.

The preceding calendar/media checkpoint remains available on its own branch. That broader candidate included media-studio and workspace-attachment work not present in the deployed v14 source. Those candidate-only components are intentionally absent here; this is not a rollback of the private Site.

This snapshot includes the deployed Mastodon planning target, calendar and connections updates, editorial library, posting-time and working-draft dialogs, and composer presentation/error-focus changes. The original deployed source passed 1769 tests, syntax checks and Worker build.

Private hosting identity/configuration, credentials, runtime databases, uploads, logs, user content, local review paths and private deployment reports are excluded. Generated Worker output can be rebuilt with npm run build:worker. No Git history from the private Site is included. MANIFEST.sha256 describes this sanitized source snapshot.
