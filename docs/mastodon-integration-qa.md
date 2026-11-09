# Mastodon UI and profile-read integration

Base: v8 / commit a047d18 (authenticated return document fix preserved).
Merged the minimal Mastodon account/connection UI with the manual profile reader.
No deployment, production account read, grant change or environment change occurred.

## State integration

The profile panel/button is initially hidden and disabled. Only validated linked
readiness enables it. Readiness reloads, diagnostics, accepted revocation/recovery,
and page lifecycle invalidate pending profile results. Linked state hides the
irrelevant connect action. Switching back to unlinked restores the connect action.
An in-flight mutation cannot trigger another profile read. Repeated profile clicks
issue only one request. All profile values use textContent.

## Verification (2026-11-07)

- Full npm test: 1669 passed, 0 failed, 0 skipped.
- npm run check: all JavaScript syntax checks passed.
- npm test pretest rebuilds the worker bundle including new assets/module.
- git diff --check: passed.
- Profile security tests cover owner/origin/manual-header/method/query rejection,
  fixed-origin GET with existing token, response allowlist, no DB writes, malformed
  fields, redirects/oversize/errors, subject mismatch and concurrent revocation.
- Integrated tests exercise actual UI module code: linked-only access, no automatic
  reads, clearing on refresh/unlinked transition, and blocking during revocation.
- Existing consent/retry UI tests remain green after adapting the module harness.

## Release gate

Independent review is still required. No release has been performed here.
