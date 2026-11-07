# X connection integration candidate, 2026-11-07

This isolated change builds on reviewed Takt 0.10.0 and the X lifecycle 0.6 candidate. It is not deployed or activated. No real account, secret, encryption key, authorization grant, API credit or payment was created. Every provider response in this verification is a local fixture.

## Implemented

- Existing X confidential-web OAuth core integrated under modules/oauth/x. Pinned X endpoints; S256 PKCE; strict scopes, expiry and numeric subject checks; explicit action policy before every provider call and credential write.
- Dedicated encrypted SQL aggregate, one Site/owner, in server/0009_x_oauth.sql. No LinkedIn/YouTube tables reused or modified. All PKCE verifiers, browser/state hashes, claims and grants are inside AES-256-GCM envelopes. The context includes Site, owner, X, client and configuration fingerprint; AAD includes the durable CAS version and key ID. Fresh random 96-bit IV per write. Outer columns contain only fencing metadata.
- One atomic compare-and-swap per state transition; failed/unknown mutations are not retried. Callback claims are one-use. At most eight live attempts per owner, five-minute TTL. One connection per Site/owner, no reconnect. SQL CAS prevents simultaneous refresh claims and late callback/refresh resurrection after disconnect.
- Authenticated encrypted readback before reporting a confirmed connection. Expired and refresh-in-flight credentials are never shown as connected. Publishing remains false.
- Local disconnect creates a permanent tombstone, erases the live encrypted aggregate, and fences stale writes. It works even if the envelope is corrupt. It does not erase database backups or revoke the provider grant. Provider revocation is not exposed through these HTTP routes; finishRevocation deliberately cannot acknowledge a revocation.
- Hosted Worker routes: GET /api/providers/x/oauth/readiness; POST /api/providers/x/oauth/start; GET /api/providers/x/oauth/callback; POST /api/providers/x/refresh; POST /api/providers/x/disconnect. Exact own-origin POST, JSON, X-Planner-Request and trusted Dispatch owner checks. Per-attempt __Host-takt-x-<state hash> Secure/HttpOnly/SameSite=Lax cookie. Callback returns only a fixed same-origin outcome redirect and clears the matching cookie.
- Default configuration remains closed. Generated Worker includes routes but composes no action-authorization policy, so it cannot activate X merely by adding configuration or secrets. The local development server stays unconnected.

## Deliberate remaining boundaries

The browser still displays setup guidance, not an active X connection controller. It never infers a connection from URL parameters or the presence of configuration. No connect/refresh/disconnect UI was added, and the general provider status DTO remains the earlier closed summary. Use the X-specific authenticated readiness endpoint when building that UI; do not treat the general summary as live X credential state. This is a server integration candidate, not a completed end-user connection feature.

Live activation requires separately authorized app registration and scopes, client secret and encryption-key provisioning, migration installation on Site-private D1, verified Dispatch callback owner identity and session-cookie return, log/query redaction, actual X compatibility, network/cost controls and independent review. Runtime flags are not evidence of those permissions. No automatic grants, refresh, scheduler, API-credit purchase, posting, provider revocation or background network are added.

Runtime inputs: TAKT_X_ENABLED must be the literal string true; TAKT_X_CONFIGURATION must contain exactly siteId, siteOrigin, clientId, redirectUri, appConfigVersion and offlineAccess; redirectUri must equal the canonical siteOrigin + /api/providers/x/oauth/callback. TAKT_X_CLIENT_SECRET and TAKT_X_KEYRING_JSON are server-only. The keyring shape is {activeKeyId, keys}, one to four IDs mapped to canonical base64 32-byte keys. Never place real values in source, a UI or chat. No fallback or generated production key exists.

An operator must explicitly compose createSitesHandler({xAuthorizeAction, oauthTransport}) with a current, audited authorization policy. The policy receives the core's fixed action names and context and must verify account/scopes, access creation and storage approval, explicit refresh intent and approved cost allowance before each action. No permissive production policy is supplied. A request body or configuration flag must never implement this policy. The generated build intentionally supplies none.

Migration 0009 is additive and not automatically applied by LocalDatabase or any HTTP request. Deployment must explicitly install it after the existing migration chain. Tests apply it solely to temporary SQLite databases. SQL CAS was exercised on SQLite through the D1-shaped local adapter, not actual D1/workerd. Do not enable read-replica semantics without proving fresh/read-your-write behavior. Configuration changes fail closed against the existing row and do not reinstall old connections. Recovery of uncertain operations and key rotation remain operator work, not automatic retry.

The lifecycle module's original capability constants describe the standalone core; the surrounding store/router integration is documented here. Original standalone provider-revocation tests use the in-memory test double, not this persistent store.

## Verification

Commands: npm test; npm run check. Full suite includes 75 original lifecycle tests plus 10 new real-SQL/cipher/HTTP integration tests. The test transport is explicitly injected and never falls back to network fetch. New tests cover encrypted persistence/readback, refresh, local disconnect, owner and browser separation, replay, concurrent refresh CAS, disconnect fences, tamper detection, decryption-independent disconnect, aborted writes, strict CSRF, secure cookie/redirect and missing policy.

The only prior expectation changed is the default X start endpoint: 503 closed instead of 404 absent. No original failure was hidden. Worker build is deterministic and all assets remain owner-protected through the existing regression suite. No new actual browser or hosted/provider-live acceptance run is claimed. Existing historical verification reports describe their earlier versions, not this new candidate.

REA skill v60 was read. Since the available input is the complete source repository, its explicit instruction is to use normal source/test tools rather than invoke REA runtime/decompilation.

Final run: 1524/1524 tests passed, zero failures/skips, JavaScript syntax passed. A separate reviewer inspected store.mjs, http-router.mjs and migration 0009, reran all 10 new integration tests, and reported no concrete blocking defect in that scope. This is not a full independent security audit or live-host acceptance.
