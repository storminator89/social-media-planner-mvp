# Mastodon return navigation correction

## Narrow correction

Allow cross-site fetch metadata only for an authenticated, top-level GET to
`/mastodon.html`. Continue rejecting a foreign Origin header, cross-site API
requests, frames, subresources, HEAD and all mutation methods. Existing CSP,
no-store headers, Dispatch identity checks, DB availability and exact static
asset inventory remain in force. No CORS header is introduced.

OAuth state, per-attempt cookie, PKCE, owner binding, expiry and one-time claim
are unchanged. The static page does not treat the outcome query as truth; it
removes it and reads authenticated readiness. A forged outcome cannot establish
a connection or trigger registration, exchange, reset or revocation.

## Validation

- Full final suite: 1655 tests passed; zero failed or skipped.
- JavaScript syntax check passed.
- Focused OAuth and Worker suites: 44 passed.
- Deterministic Worker build and source/artifact equality passed.
- Added provider-style cross-site callback, foreign owner, missing cookie,
  altered state and narrowly scoped landing-page regression coverage.

For a fresh status check, open the ordinary Mastodon page. Do not replay callback URLs.
