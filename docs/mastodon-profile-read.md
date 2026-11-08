# Manual Mastodon profile read

The existing `profile` grant is retained unchanged. The owner can explicitly
press “Mein Profil jetzt auslesen” on `/mastodon.html`. This makes one same-origin,
owner-bound request to `/api/providers/mastodon/oauth/profile`. The server alone
uses the existing encrypted grant for GET `/api/v1/accounts/verify_credentials`
on the fixed `https://kanoa.de` origin. No registration, token refresh, scope
upgrade, provider mutation, database write or background polling occurs.

Response fields are allowlisted: ID, acct, username, display name, bio, creation
and last-status dates, aggregate follower/following/status counts, and
locked/bot/discoverable flags, when present. The returned account must match the
stored subject. Profile source/preferences, roles, credentials and all unknown
fields are dropped. Bio HTML is displayed literally via textContent. No image
or external link loads occur. The page clears results on navigation, connection
controls, and before any retry. A concurrent grant change suppresses the result.

Missing/invalid grants, provider errors, redirects, oversized JSON and mismatched
accounts return a fixed error with no provider details. Normal response cache
protections and the existing 15-second deadline / 64 KiB HTTP limit apply.

Official references checked 2026-11-07:
- https://docs.joinmastodon.org/api/oauth-scopes/#profile
- https://docs.joinmastodon.org/methods/accounts/#verify_credentials

The profile scope permits this endpoint; it does not authorize reading post
content, private messages or follower lists. The docs also list OAuth userinfo
since 4.4, but this implementation does not call or allow that endpoint.

Local tests use synthetic accounts and credentials only. No live personal data
read or deployment is claimed. Hosted owner-session and visual browser QA remain
separate release checks.
