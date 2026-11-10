# Instagram connection integration candidate

This local candidate adds an actual request-building and response-verification component, not an activated Instagram connection. No Meta account, app, permission grant, credentials, network call, publishing action, hosting change or deployment was made. The existing account UI continues to say that the Instagram callback is not integrated. No live button or callback address is exposed.

## Implemented

- `modules/instagram/oauth-transport.mjs`: confidential multipart code exchange to the official Instagram API host, followed by token-bound `/v27.0/me` identity verification. Requires a preselected account ID and exactly the two documented scopes. Injected transport only, no global fetch; token is server-only and non-enumerable. No connection or expiry is invented from the response.
- Shared deadline covers transport and body; 64 KiB cap, redirect rejection, credential omission, abort, strict JSON response parsing, redacted errors, no retries. Late provider responses cannot trigger a second request after timeout.
- `GET /api/providers/instagram/oauth/readiness` is integrated in both local and hosted routers. Requires trusted app identity and same-origin access. Reports capabilities as false. Runtime flags cannot activate it.
- Existing Instagram publishing adapter remains untouched and disabled. No public media URLs are generated.

## Activation blockers

The request component is intentionally not called by a browser-facing handler. A reviewed durable, expiring, single-use state store with owner/session/config binding and an encrypted credential lifecycle must be composed first. Authorization-code injection protection needs explicit review: the source evidence does not establish Meta PKCE support, and state alone must not be advertised as solving code injection. No ad-hoc PKCE, nonce or issuer support is invented.

A Meta developer app, exact registered HTTPS callback, app/role access, actual account, tested provider response shapes, secure app secret and token key storage, user approval of the actual requested grant, expiry/refresh/disconnect handling and callback security review remain required. Long-token exchange/refresh is not implemented in this change. A successful verification result here is not a durable connection. The endpoint does not claim the protocol component is operational.

## Evidence and tests

Protocol mapping uses the reviewed candidate's `docs/official-evidence.md` dated 2026-11-07 and these official references (not re-fetched by this worker):
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/documentation/instagram-platform/reference/me
- https://developers.facebook.com/documentation/development/graph-api/changelog/version27.0

All added protocol tests are synthetic and use no external network. They cover multipart encoding, exact account/scopes, identity mismatch, redaction, redirect/request constraints, malformed/oversized bodies, transport/body deadlines, late responses, configuration rejection and readiness auth/origin/method denial. Run `npm run check` and `npm test` from this directory. No live OAuth, UI browser test or deployment validation is claimed.

## Offline continuation, 2026-11-07

Added an isolated Instagram state repository using the existing D1-compatible
state table, without changing migrations or relaxing the LinkedIn repository.
It hashes state and browser bindings, binds site/owner/provider/configuration,
limits attempts, expires after five minutes, and atomically consumes each state
once. SQLite restart and two independent database handles are tested. The legacy
`nonce_fingerprint` column stores a local attempt correlation hash only. It is
explicitly **not** a Meta nonce and does not solve authorization-code injection.

Added an offline callback parser with an exact HTTPS callback path, bounded input,
strict percent decoding, duplicate/unknown parameter rejection, exclusive success
or denial results, and redacted denial text. This parser is intentionally NOT wired
to a public callback. It cannot turn an arbitrary supplied code into an authorized
exchange. Added adversarial provider-response tests; these validate rejection
behavior, not live Meta response compatibility.

The official business-login and `/me` references were requested again through web
retrieval on this date; both returned HTTP 429. The current synthetic `data`-array
fixtures therefore remain an unverified provider-shape assumption, not a new
compatibility finding. No guessed alternate shape, PKCE, signed nonce, or expiry
was introduced. Normal full-source inspection and tests were used.

Still blocked before production activation: independently verified authorization
response/code-injection protection, registered application and hosted callback
identity/cookie behavior, provider-validated token/identity/expiry shapes, and an
Instagram-specific encrypted credential installation/disconnect lifecycle. The
existing cipher, credential table and install-ticket store accept LinkedIn only.
No token store was weakened to accept Instagram or raw callback input. No token
was persisted, no provider was contacted with credentials, and no grant, host,
security setting, publication or deployment was changed. Public readiness remains
closed, and the UI must continue to describe Instagram as unavailable.

Verification for this continuation: JavaScript syntax check passed; 37 focused
Instagram tests passed (including the existing closed-route integration tests).
A full `npm test` run in the shared integrated tree passed 1,568 tests, no skips
or failures. It rebuilt the Worker normally. Other workers may continue editing
that tree, so the parent must bind the final combined artifact to its final
verification; this is not a production acceptance result.

## Offline encrypted quarantine vault, 2026-11-07

`modules/instagram/token-cipher.mjs` and `credential-store.mjs` now provide a
separate Instagram-only encrypted quarantine store. The additive
`server/0010_instagram_vault.sql` is **not automatically applied** by local startup,
HTTP handlers or the Worker; only synthetic tests explicitly apply it. Existing
LinkedIn/YouTube migrations and stores are unchanged. An explicitly supplied
`TAKT_INSTAGRAM_TOKEN_KEYRING_JSON` is required, with up to four 256-bit keys and
one active key. No real key was generated or configured. Fixtures use public,
synthetic test material only.

AES-256-GCM uses random 96-bit IVs, a 128-bit authentication tag and authenticated
site, owner, provider, configuration, context, expected account, connection,
state hash, revision and verification timestamp. Rotation reads old keys and
rewraps under the active key with a revision compare-and-swap. Unknown keys,
tampering and uncertain writes fail closed with redacted errors and no retry.

A pending slot must be reserved against a still-unconsumed, unexpired Instagram
state. Installation then requires that same state to be consumed, still valid,
and consumed no later than the verification timestamp. Only an in-process result
branded by the code verifier is accepted, not a copied or JSON-deserialized
result. This is an internal input guard, **not provider proof that a code belongs
to a particular attempt**. The caller must remain a trusted server composition;
this API must not be exposed directly as a browser endpoint. Durable revision
fences prevent competing installations and late writes after local disconnect.
Disconnect clears encrypted token material and leaves a tombstone; reconnect and
provider-side grant revocation are deliberately not implemented.

The stored lifecycle is **quarantined**, not active. Because the reviewed token
response still has no verified expiry contract, expiry stays null and the store
has no usable-token accessor. Even authenticated metadata always reports
connected=false, canPublish=false and canRefresh=false. This closes the encrypted
at-rest storage gap without claiming the entire credential lifecycle is ready.
No public route, readiness capability, browser button or hosting configuration
was activated. App setup, callback identity/cookie validation, verified provider
response shapes and expiry/refresh semantics, and independent authorization-code
injection protection remain activation blockers.

Six new offline tests cover encryption and metadata redaction, runtime key
validation, authenticated-context and ciphertext tampering, old/new key rotation,
SQLite restart, owner isolation, state consumption and expiry, rejection of forged
verification results, concurrent writes, pending and installed disconnect,
replay/reconnect rejection, and uncertain-storage error redaction without retry.

Verification of this vault continuation: `npm run check` passed; `npm test`
passed 1,574 tests, with zero failures or skips (including the six new vault tests
and unchanged closed-route tests). These are synthetic/local checks, not live
Meta or hosted-storage acceptance. The final combined release must be verified
again after any other concurrent edits.
