# Mastodon return navigation correction

## Production evidence (2026-11-07, UTC)

The deployed v7 callback GET returned 303 at 22:19:52.599. Its immediate
`/mastodon.html?outcome=linked` document navigation returned 403 at 22:19:52.830.
Safari sent `Sec-Fetch-Site: cross-site`, `Sec-Fetch-Mode: navigate` and
`Sec-Fetch-Dest: document` on both requests. The generic Worker origin guard,
not the OAuth callback guard, rejected the landing page.

The server emits the linked redirect only after profile verification and the
awaited encrypted linked-state write. This establishes successful completion
at that time. It is not a fresh authenticated readiness read or proof that the
remote grant has not since been revoked. No live callback was replayed, no
state was reset, no grant was created, and no credentials were decrypted for
this investigation.

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
- Local browser fixture was prepared but Chromium could not start because this
  executor denies the required socket operation, including the reviewed
  escalation attempt. No post-change browser pass is claimed.
- Production owner-session readiness was unavailable; the production evidence
  above is from read-only Worker logs, with callback codes/state redacted.

After deployment, opening the ordinary Mastodon page is the safe next check.
Do not reload the old callback URL or start/reset the existing connection.
