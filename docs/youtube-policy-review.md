> Historical policy-only review. The combined candidate adds reviewed visibility support; see youtube-visibility.md and provider-integration-review.md for the current scope. The policy receipt and legacy-record protections below remain applicable.

# YouTube policy review candidate, not a release

This isolated candidate implements explicit visibility selection and a Community Guidelines acknowledgment on the exact upload confirmation screen. Nothing is preselected. Public and unlisted choices remain non-executable; there is no silent conversion to private. The existing private-only provider adapter is intentionally unchanged.

The start payload now requires privacyStatus=private and communityGuidelines=youtube-guidelines-v1, along with the existing operation ID, expected revision, immutable fingerprint and intent. Approval persists the receipt in the same conditional SQL update as approved_at_ms, against the owner, connection, authorization epoch, revision and fingerprint. The fingerprint binds the file digest, channel and metadata including visibility. SQL lease acquisition, pre-send lease checks and completion checks require this receipt. Old approvals without it cannot execute or resume. History and cancellation remain available. No old in-flight upload should be recreated or silently reapproved.

The acknowledgment text certifies that this specific video's content complies with YouTube Community Guidelines and links to https://www.youtube.com/howyoutubeworks/policies/community-guidelines/. Reviewing a plan again or editing its draft requires fresh selections. The receipt is not transmitted as video metadata.

## Explicit remaining release blockers

- Google requires functioning public/private/unlisted upload choices. Merely displaying all choices while blocking two is NOT full RMF compliance. This candidate must not be activated as a compliant upload client. Supporting public/unlisted requires separately reviewed provider response validation, checkpoint/recovery invariants, UI/DTO contracts and explicit publishing authorization; no such expansion is included here.
- Migration server/0011_youtube_policy_ack.sql is supplied but NOT applied to any persistent or production database and NOT wired into the local migration ledger. Only isolated in-memory test adapters apply it. Integrating a rollout must preserve the ledger and coordinate with 0009_x_oauth.sql, not alter previous migrations or misnumber this one.
- Legacy approved/session records without receipts are blocked. They require operator reconciliation without re-upload, not blind reauthorization. The existing DTO does not expose a dedicated missing-policy-receipt explanation; that upgrade UX remains to be implemented before activation.
- Browser visual/accessibility review and independent review remain outstanding. Tests are offline fixtures, not a live OAuth, upload or compliance audit.

Sources checked: https://developers.google.com/youtube/terms/developer-policies (III.E.3); https://developers.google.com/youtube/terms/developer-policies-guide (Community Guidelines certification); https://developers.google.com/youtube/terms/required-minimum-functionality (Uploading videos).
