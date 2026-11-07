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
