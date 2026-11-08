# Isolated Kanoa publishing release candidate

Base: dad6ded (Site-v9 source). Only publishing runtime, UI, OAuth, recovery and tests added. Media receipt changes are deliberately absent; data API, repository, adapters and local storage retain the base version.

## Runtime

New owner-only routes under /api/providers/mastodon/publishing/. Requires existing
profile linkage, exact TAKT_MASTODON_OWNER_ID and explicit independent
TAKT_MASTODON_PUBLISHING_ENABLED=true. Disabled by default. Reuses existing
configuration and encryption keyring without changing either. Separate grant,
callback, PKCE, cookie namespace and encrypted tables; does not modify profile grant.
The human confirms new persistent write access in the UI, then at Kanoa.
Agent-driven real registration/exchange still requires action-time permission.

Only text, explicit visibility, sensitive flag and optional content warning.
Preview is encrypted server-side, expires after five minutes, and binds owner,
account and grant version. New preview/cancel consumes the old version through CAS.
Manual submit consumes preview before external requests. Provider verifies account
again. Permanent unique owner/review ledger is reserved before sending and never
reset. No automatic retries. A timeout or malformed result stays uncertain even if
the provider might have posted. Inspect Mastodon manually instead of resubmitting.
Identical content/visibility/account cannot be posted twice through this ledger.
Media, scheduling and arbitrary destinations are unsupported.

## Lifecycle review follow-up

Owner/CSRF/consent-guarded /revoke and /recover now operate only on the separate
publishing grant. They remain available with the publishing feature disabled or
profile disconnected. Revoke reserves revocation_pending before network; uncertain
revocation is not retried. Recovery requires the user to revoke the separate app
manually on Kanoa, explicitly confirm, wait at least 60 seconds after the durable
fence, and explicitly confirm again. Fencing invalidates in-flight OAuth CAS writes;
callback state is not reusable. Recovery never edits publication-ledger entries,
so previously uncertain publications remain permanently protected from retry.
Declined, stale pending, expired, mismatched-account and unknown outcomes expose
this route. Preview approval is rechecked against the grant version before send.
Revocation cannot retract an already in-flight post or delete a published post.


## Current verification

Isolated candidate: 1723/1723 full-suite tests passed, including backend and DOM interactions. Independent security and additive migration review found no blocker; focused tests 52/52 passed. Both migration tracks preserve pre-existing schemas. The broader candidate's 1743-test count is not evidence for this release.

Final Chromium browser QA could not start: socket() Operation not permitted, including an approved sandbox escalation. This is not a browser pass. No credentials, grants, real posts, activation flags or deployment were used. Existing prior browser results do not replace this final-tree check.

## Release steps and gates

1. Complete final desktop/mobile browser QA against this exact tree, including full scope text, cancellation, refresh/back navigation, preview invalidation and recovery. Use synthetic fixtures only.
2. Confirm target is the intended Takt Site and live migration journal ends at 0009_mastodon_oauth. Stop if another 0010 exists; never rewrite an applied journal entry.
3. Apply hosted drizzle/0010_mastodon_publishing.sql through the approved Sites deployment path. The internal server/0013_mastodon_publishing.sql is a mirror for explicit server schema tests, not an additional hosted migration. It is deliberately not added to automatic local migrations.
4. Deploy only this isolated tree with existing publishing flag absent/off. No media receipt migrations, new service, host/security setting, credentials or grants are included.
5. Verify authenticated hosted page, readiness fail-closed, existing profile connection and manual revoke/recovery availability. Code deployment alone does not authorize activation.
6. Any flag activation requires separate scope confirmation; persistent write-access creation requires action-time approval. The human must inspect/approve Kanoa consent. A real post additionally requires exact text, audience and destination approval. Do not create credentials, start OAuth or send a test post as deployment verification.
7. Keep additive tables on code rollback. Never delete/reset publication ledger rows; uncertain outcomes must remain fenced.

## Explicit idempotency follow-up

Verified outgoing POST /api/v1/statuses carries Idempotency-Key equal to the canonical approved reviewId (64 lowercase hex). The key is content/account/owner-bound, not randomly regenerated per HTTP attempt. Different approved content produces a different key. Fixture regression proves an unknown outcome remains permanently fenced after more than one hour, even with a fresh preview: only one status POST occurs. No scheduled_at is transmitted. No external action was performed. Two new hosted tests pass (10/10 hosted tests; 1723/1723 full suite). Server deduplication retention is not relied on as the sole safeguard.
