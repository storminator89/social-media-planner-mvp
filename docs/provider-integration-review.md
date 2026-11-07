# Combined provider candidate review — 2026-11-07

Not deployed or activated. Source integration only. No real provider calls, credentials, grants, runtime flags, purchases, hosts or security settings were changed.

## Provenance and merge decisions

Base: `takt-connections-integrated-reviewed`. All six files from `instagram-vault-delta.tar.gz` matched that base byte-for-byte before integration. Instagram production source remains unchanged. Applied `takt-x-connection-ui.patch` without conflicts. Selectively copied YouTube policy plus visibility changes from `takt-youtube-visibility-impl`, excluding its older Instagram files and generated worker. Regenerated the worker locally.

Preserved `0010_instagram_vault.sql`. Renamed new YouTube policy migration to `0011_youtube_policy_ack.sql` and updated both test adapters. Existing migrations 0001–0010 were not modified. Added a synthetic in-memory integration test applying every migration in numeric order and checking all provider tables, policy column and foreign keys.

The local automatic migration ledger deliberately remains at 0008, preserving the existing explicit/offline contract for X and Instagram. 0009–0011 require a reviewed deployment migration procedure before activation; no persistent database was migrated. The combined schema test is not a rollout rehearsal on user data.

Adjusted shared connection-card copy for separately gated YouTube visibility. Marked policy-only notes historical. Fixed an inherited flaky vault tampering test: replacing ciphertext suffix with `AA` could randomly leave it unchanged; it now flips the first character deterministically. No cryptographic production code changed.

## Bounded security review

Inspected changed source and existing vault boundaries, supported by the complete offline regression suite. X validates readiness and authorization URL, pins official endpoint and callback, retains explicit action confirmations and does not retry uncertain mutations. YouTube validates explicit visibility in HTTP preparation, binds visibility, intent, fingerprint, revision and policy receipt on approval, gates public/unlisted server execution separately, and validates provider-returned visibility. Repository lease acquisition, send guards and completion require the policy receipt. Instagram vault remains quarantined with no usable-token accessor or active HTTP flow; authenticated encryption and owner/revision boundaries remain intact.

This is an integration review, not an independent exhaustive security audit or provider compliance certification.

## Verification

- `npm test`: 1,604 passed; 0 failed, cancelled or skipped. Includes regenerated worker, all original suites, policy/visibility tests, X UI tests and combined migration schema check.
- `npm run check`: syntax check rerun after final code changes; see external integration-check log.
- Browser/visual acceptance was not rerun. The supplied X browser harness reports an earlier Chromium runtime sandbox failure, not a passed page test.
- No live OAuth, hosted database, upload or provider API acceptance was attempted.

## Remaining activation blockers

Reviewed persistent migration rollout; legacy YouTube approvals without policy receipts need reconciliation and dedicated UI explanation. Browser visual/accessibility and independent combined review remain outstanding. Instagram callback/cookie identity, provider expiry/response contracts and independent code-injection defense remain incomplete. Real provider setup, per-action grants, costs where applicable, privacy/retention and full Google RMF compliance are not established by passing offline tests.
