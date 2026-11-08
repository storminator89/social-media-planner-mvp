# Kanoa profile connection: local implementation, not activated

This isolated candidate starts from private Site v4, preserves its project ID,
D1/R2 bindings and existing planner. It adds Mastodon only. No deployment,
external app registration, token grant, new runtime key or hosted configuration
has been performed. A local test fixture is not evidence of a live connection.

## Implemented

- Account card links to the dedicated connection page instead of a dead control.
- Worker routes the exact callback before generic cross-site rejection.
- Dispatch visitor ID plus configured exact owner ID authorize every operation.
- Fixed https://kanoa.de endpoints, manual redirect rejection, bounded responses,
  15-second deadline, S256 PKCE, single-use hashed state, HttpOnly binding cookie,
  five-minute expiry, encrypted site/owner/config/version-bound D1 records, CAS.
- Explicit browser confirmation starts registration. Authorization code exchange
  follows only the successfully validated single-use callback. This is a user-
  operated app flow, NOT authority for an assistant to click through OAuth.
- Scope remains profile; no reading posts, no sending, no scheduling/publication.
- Token retained encrypted before profile verification, so verification failures
  can be revoked. Revocation is fixed /oauth/revoke, with retryable pending state.
- Recovery first durably fences the attempt, retains its encrypted credentials,
  and requires a minimum one-minute wait before a separate confirmation. The
  user must inspect Kanoa AFTER fencing; elapsed time alone proves nothing.
  Recovery requires user confirmation that they manually revoked/check-removed
  every Takt profile grant at kanoa.de. It replaces the record with a tombstone
  via CAS, fencing old callbacks. It does not claim server-confirmed revocation.
- Unknown registration/exchange outcomes never automatically register/retry.

## Native Sites activation steps, in order

1. Review source and tests; verify current get_site ownership/audience/version.
2. Native save/deploy of this candidate needs appropriate authorization. Preserve
   owner-private sharing. D1 migration drizzle/0009_mastodon_oauth.sql and journal
   install only mastodon_oauth_attempts, never replace existing migrations/data.
   Canonical server migration is 0012; don't apply BOTH copies to the same DB.
3. With feature still disabled, the user signs into the private Site, then opens
   /api/providers/mastodon/oauth/identity and obtains their Site-scoped ownerId.
   This is ordinary app identity, not a secret. Do not substitute account ID,
   email, headers from a local proxy, or service bypass. Do not spoof this header.
4. Through native Sites runtime configuration, set TAKT_MASTODON_OWNER_ID to that
   exact identity and TAKT_MASTODON_CONFIGURATION to a JSON object with only:
   siteId (existing project ID), siteOrigin (verified Sites URL origin),
   instance (https://kanoa.de).
5. After action-time permission for configuring persistent credential storage,
   generate a 32-byte random encryption key in memory and store only as a native
   Site secret TAKT_MASTODON_KEYRING_JSON with activeKeyId and keys mapping key ID
   to canonical base64 key. Do not put key values in source, logs or chat. Retain
   old keys during rotation until records have been re-encrypted and verified.
6. Set TAKT_MASTODON_ENABLED=true only after reviewing all prerequisites. Verify
   metadata from the actual hosted Worker, response/cookie behavior and browser
   callback continuity with the owner. No local-only test proves this.
7. User opens /mastodon.html, checks disclosure and presses Weiter zu Mastodon.
   This creates one Kanoa OAuth app (profile only); user grants access on Kanoa.
   Registration shares the Site URL, callback URL and app name. The encrypted
   server vault stores app credentials and the granted profile token. Readiness
   says linked only after provider verify_credentials succeeds and storage saves.
8. Test revocation and confirmed manual recovery before calling this production-
   ready. A profile connection is not publishing permission.

## Specific remaining blockers

- Owner Site-scoped identity, runtime encryption secret and enabled configuration
  are not provisioned. Consequently local candidate still fails closed by default.
- No authorized real Worker network probe, browser callback test or live revoke
  has been run. Kanoa metadata, response shape and PKCE support fail closed if they
  differ from the checked contract. No capabilities are silently assumed.
- Unknown registration may leave an app without recoverable client credentials.
  Manual recovery cannot delete that remote app; user must inspect Kanoa account
  application controls or contact the instance administrator if reconciliation
  is impossible. The app does not advertise retry as safe before that check.
- UI's manual recovery is the user's assertion, not independent proof of remote
  revocation. The UI and durable tombstone explicitly distinguish these outcomes.

## Local verification (2026-11-07)

Final npm test: 1,642 passed, 0 failed. npm run check: all JavaScript syntax
checks passed. Worker built by pretest. Browser QA and real Kanoa calls not run.
Worker SHA-256: 18eb6aac82e1337031c74beead5b2defebbc09ffdf893e7d63def7002f1b60a2.

UI follow-up: failed start resets confirm/cancel controls. Reproduced before fix
and covered by tests/ui/mastodon-retry.test.mjs using the actual frontend script
in a VM with DOM/fetch stubs. Refresh can reopen only after a verified startable
server state; unknown attempts remain blocked without automatic retry.
