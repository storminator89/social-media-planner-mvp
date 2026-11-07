# LinkedIn confidential web transport in Takt 0.6

Checked 7 November 2026. This package was exercised only with local fixtures. No developer app, login, grant, real credential, LinkedIn token exchange, posting, deployment or hosting change was performed. A successful fixture result is not a live connection or proof of publishing capability.

## Integration surface

The server-only module `modules/oauth/linkedin-web-transport.mjs` is composed by the gated HTTP router. It owns the matching configuration, parser and State repository through the closed flow factory. The module uses named relative imports and Web APIs only. Node is used by tests, never by the production module.

Factory:

```js
const flow = createLinkedInConfidentialWebFlow(db, validatedOfflineConfig, {
  clientSecret,              // authorized server-only provisioning, never browser input
  transport,                 // explicitly injected trusted (Request) => Promise<Response>
  operatingContract: {
    issuer: 'https://www.linkedin.com/oauth',
    codeInjectionDefense: 'oidc_nonce',
    serverConfirmedNonceContract: true
  },
  beforeExchange: async (attemptBinding) => true,
  clock: Date.now,            // optional trusted server clock
  deadlineMs: 10000           // optional total deadline; integer 1..30000
});
const attempt = await flow.begin(trustedOwner, browserBinding);
// attempt: {state, nonce, expiresAtMs}; no network or hook call
const result = await flow.completeCallback({trustedOwner, callbackUrl, browserBinding});
```

`validatedOfflineConfig` must be the unmodified object from the existing `createLinkedInOfflineConfiguration`; copying it into an unrelated object is rejected. Configuration, the operating contract, callbacks and dependencies are copied synchronously from own enumerable data properties before awaits. Accessors, extra fields and unexpected prototypes are rejected. The factory never accepts browser-supplied issuer, endpoint, scopes, credentials, receipt, transport, session, fence or owner overrides.

The explicit operating contract is a privileged server assertion, not a feature-discovery mechanism. There is no default activation, automatic nonce alternative, PKCE fallback or issuer list. Tests supply this assertion only inside a local simulated provider contract. The current candidate issuer is pinned to the single discovery value. Any real token with the documentation-example issuer fails closed; changing the pin requires a separately reviewed server configuration/code decision after authorized live verification.

### Atomic state and pre-exchange installation fence

The factory owns the matching parser and real D1-compatible state repository. `completeCallback` cannot accept a forged or independently injected claim receipt. It performs the existing atomic claim first. Missing, wrong, expired, duplicated or replayed state never reaches the transport.

`beforeExchange` is a **required trusted factory dependency**, invoked exactly once with the frozen `attemptBinding` after a successful claim and before any provider request. The binding has exactly `{ownerId, siteId, configFingerprint, contextFingerprint, stateHash}`, derived from the successfully claimed own callback and fixed configuration. It contains no raw state, nonce, authorization code or token. It must return the primitive `true`. The HTTP orchestration should atomically claim the owner/configuration/state-hash-bound install ticket and retain its opaque handle in the hook's private closure. Compare the hook binding to the independently parsed request and trusted Dispatch owner before ticket claim. The verified result carries the **same immutable binding object**; compare it again before save, and require the vault commit to compare against its opaque ticket. This rejects A/B ticket/result mixing even for the same owner. Capture the connection/revocation fence before external code exchange and compare-and-swap it when saving afterward. This prevents late callbacks from overwriting a newer connection or a local revocation.

False or another value returns `before_exchange_rejected`. A thrown or timed-out hook returns `before_exchange_outcome_unknown`. Neither invokes a provider. The state remains consumed and the module never repeats the hook or exchange. Caller-side ticket/CAS correctness remains a separate integration responsibility.

### Internal result and failure contract

Success:

```js
{
  status: 'identity_verified',
  identity: {issuer, subject},
  attemptBinding: {ownerId, siteId, configFingerprint, contextFingerprint, stateHash},
  expiresAtMs,
  grantedScopes: ['openid', 'profile', 'w_member_social'],
  connected: false,
  publishing: false,
  refreshSupported: false
}
```

`result.accessToken` is a **non-enumerable**, non-writable property for direct trusted vault consumption. Spreading or `JSON.stringify(result)` does not include it. No ID token, nonce, code, profile, email or refresh token is returned. This is still a server-internal value, not a supported browser DTO; an explicit accessToken copy would of course defeat non-enumerability. The result never persists or connects an account by itself and does not validate real-world identity.

Failures contain only fixed local `status` and `code`, `connected:false`, `publishing:false`, `retryAllowed:false`, `restartRequired:true`. Raw exceptions, OAuth error text, URLs, request bodies and response bodies are neither returned nor logged. Important statuses: `callback_rejected`, `invalid_attempt`, `claim_outcome_unknown`, `provider_denied`, `before_exchange_rejected`, `before_exchange_outcome_unknown`, `exchange_rejected`, `exchange_outcome_unknown`, `verification_failed`.

An explicit parsed OAuth rejection with HTTP 400/401 is `exchange_rejected`. A thrown transport, deadline, redirect, malformed/unbounded response or other unusable token-exchange response leaves exchange outcome unknown. Parsed HTTP 200 with invalid token fields or failed downstream verification is rejected without saving. **No failure retries the authorization code**, including unknown outcomes. Start a fresh authorization attempt when appropriate; a database/vault uncertainty needs its own caller-side reconciliation, never a replayed POST.

## Transport boundary and bounded resources

Exactly these URLs can be requested:

1. `POST https://www.linkedin.com/oauth/v2/accessToken`
2. `GET https://www.linkedin.com/oauth/openid/jwks`
3. `GET https://api.linkedin.com/v2/userinfo`

The POST is form-encoded with `grant_type=authorization_code`, claimed `code`, fixed `client_id`, server-only `client_secret` and the exact configured registered `redirect_uri`. No secret appears in a URL. No PKCE fields or refresh request exist.

Every Request has `redirect:'error'`, `credentials:'omit'`, `cache:'no-store'`, `referrerPolicy:'no-referrer'` and the single deadline AbortSignal. The module has no global-fetch fallback. The injected trusted adapter must enforce TLS certificate validation, these flags, no cookie jar, no redirects or automatic retry, and authentic final URL metadata. JavaScript cannot secure an adapter that secretly ignores its contract; passing an arbitrary logging/retrying/cookie-bearing SDK would violate this boundary.

Responses must be native `Response` objects with exact matching nonempty `.url`, `.redirected === false`, nonopaque type and no 3xx status. Standard fetch metadata is suitable. Synthetic `new Response` values have an empty URL and are rejected unless the trusted **test fixture only** explicitly attaches metadata. The module never repairs or assumes a missing URL.

One monotonic deadline covers claim, fence, transport, streaming, key import, signature/hash work and userinfo. The default is ten seconds, maximum thirty. Promise races bound an abort-ignoring transport or stalled body. Expired late work cannot advance to another network stage or produce success. A deadline does not prove the remote server did not process a submitted code. Cancellation is best effort; an adapter may already have transmitted it.

The token and JWKS JSON bodies are each bounded to 64 KiB, userinfo to 32 KiB, including decompressed streamed bytes. Declared oversized lengths reject early. Content-Length equality is checked only without compression because fetch exposes decoded bytes. Content-Type must be application/json, optionally UTF-8. UTF-8 is fatal, BOM is not silently stripped, strings must be well formed, duplicate object names (including escaped spellings and nested members) reject, nesting is limited to 16 and parsed nodes to 4096. No `response.json()` or `response.text()` full-body read is used.

## Token/identity policy

The strict token contract requires a nonempty RFC6750-style access token at most 8192 characters, explicit case-insensitive Bearer `token_type`, integer positive `expires_in` no greater than one year, ID token at most 16384 characters and explicit granted scope evidence. Expiry is conservatively calculated from the local time immediately before POST. It is checked before and after userinfo. Unexpected refresh response fields are dropped, never returned or persisted.

`scope` must be a plain space-delimited string containing **exactly** `openid profile w_member_social`, in any order, without duplicates. Missing scope, an extra email/organization permission, malformed separators or encoded delimiters reject. OAuth permits omitted scope if unchanged; this implementation deliberately does not infer that assumption. The implementation also requires `token_type`, though the LinkedIn web example omits it. These strict response requirements are unresolved live-compatibility checks, not observed provider behavior. Narrower subject-only scopes have not been established for this reviewed userinfo/profile path.

The JWT must be a canonical compact three-part JWS. Only RS256 is accepted. Header fields are limited to `alg`, `kid`, optional `typ:'JWT'`; token-supplied keys, URLs and critical extensions are rejected. The fixed JWKS is fetched once per attempt, without an access token, cache or unknown-kid retry. Up to sixteen uniquely identified keys permit ordinary rotation; the selected key must be public RSA (2048–4096 bits), signature-capable, and compatible with RS256/verify. No private fields, duplicate key IDs or symmetric substitution are accepted. Only sanitized public parameters are imported into WebCrypto.

After genuine RSA signature verification, require the exact pinned issuer and exactly one audience equal to client_id. If azp is present it must also equal client_id. Require a nonempty bounded ASCII subject, integer exp strictly in the future and after iat, integer iat no more than 600 seconds old or 30 seconds ahead, and valid optional nbf no more than 30 seconds ahead. The nonce must have the locally generated form and its SHA-256 must equal the fingerprint from the consumed state. Optional at_hash must match the left half of SHA-256(access_token).

Only after all checks may the access token be sent to fixed userinfo. Its case-sensitive subject must equal the cryptographically validated subject. All other userinfo/profile fields are discarded. No userinfo-only or JWT-decode-only route creates a connection.

## Local verification and reuse

Run `npm test` at the project root. RSA keys, client secrets, tokens and nonces are generated ephemerally inside tests. The helper `tests/oauth/linkedin-provider-fixture.mjs` exports `createProviderFixture({clientId, issuer, clock, subject})`; set `fixture.setNonce(attempt.nonce)` after begin. Inject `fixture.transport` and `fixture.clientSecret`. The helper exposes recorded Requests and mutable fixture options for negative-path tests; it has no network implementation.

The tests exercise true RS256 signatures, mutation, nonce/issuer/audience/azp/timing/subject/hash rejection, state replay/concurrency, the pre-exchange fence, unsafe JOSE/JWKS, malformed and duplicate JSON, response sizes/origins/redirects, unknown transport outcomes, streaming and total deadlines, scope/token shape, redaction, immutable input snapshots and no-global-fetch behavior. Fixture success does not resolve product entitlements, signed-token live issuer, nonce echo, exact response shape, callback behavior, consent or publishing readiness.

## Official evidence rechecked

- [LinkedIn web authorization](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow): HTTPS registered callback, client-secret POST and response scope/expiry contract. Its examples are not evidence for enabling PKCE on confidential web clients.
- [LinkedIn OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2): openid/profile products, userinfo endpoint, RS256 and the documentation issuer example. Email is separate and unnecessary here.
- [LinkedIn public discovery](https://www.linkedin.com/oauth/.well-known/openid-configuration): checked again on this date, issuer is `https://www.linkedin.com/oauth`, with the fixed token/userinfo/JWKS endpoints. It declares RS256; web PKCE and actual signed tokens remain unobserved.
- [OIDC Core ID token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation) and [UserInfo response validation](https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponseValidation): signature/issuer/audience/time/nonce validation and exact subject match. Local extra strictness is identified above.
- [RFC 9700 §4.5.3.2](https://datatracker.ietf.org/doc/html/rfc9700#section-4.5.3.2): confidential-client nonce defense requires checking the token-endpoint ID token before using any issued token. It does not justify automatic activation on an unverified provider contract.

