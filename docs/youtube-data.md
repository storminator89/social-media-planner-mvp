# YouTube server data: integrated 0.7

Based on reviewed Takt 0.6. This package makes no network request and provisions no Site, credential, OAuth grant, key or upload. It implements private persistence components for integration with the independently reviewed Google OAuth transport and private-only YouTube upload adapter. All live capabilities remain gated by the integrating application.

## Files and migration

- `modules/providers/youtube-cipher.mjs`: explicit-runtime-key AES-GCM, purpose-separated for PKCE verifiers, access tokens and upload-session URLs.
- `modules/oauth/youtube-state-repository.mjs`: one-use, browser-/owner-/app-/channel-bound PKCE state.
- `modules/providers/youtube-credential-store.mjs`: verified Google subject and YouTube channel, install-ticket fences, encrypted access token, disconnect and rewrap.
- `modules/providers/youtube-upload-repository.mjs`: owned media references, immutable private upload plans, explicit approval and resumable upload leases/checkpoints.
- `modules/youtube/private-upload.mjs`: single canonical private-plan function shared with the upload adapter.
- `server/0006_youtube_lifecycle.sql`: five new YouTube-specific tables. Migrations 0001–0005 and all LinkedIn records remain untouched. Apply with the existing transactional migration ledger.

The schema has separate State, credential, install-ticket, media and upload tables. No provider CHECK constraint is weakened and no old provider is silently made connected.

## Trusted inputs and runtime secret

Factories receive the same validated server-owned configuration: `siteId`, `provider:'youtube'`, `configFingerprint`, `contextFingerprint` and `expectedChannelId`. Owners come from the authenticated Sites Dispatch boundary, not arbitrary request headers accepted on an exposed origin. Neither browser fields nor database rows independently establish authority.

`await createYouTubeCipherFromRuntime(env)` requires the expressly supplied private runtime secret `TAKT_TOKEN_KEYRING_JSON`, with exactly `{activeKeyId,keys}`. Key IDs are safe 1–40 character identifiers; `keys` contains 1–4 canonical standard-base64 32-byte keys including the active key. There is no generated/default key. Imported AES-256 keys are nonextractable. New encryption uses a fresh random 96-bit IV and a 128-bit authentication tag. All decrypt keys must be explicitly allowed.

Canonical authenticated data separates provider and purpose and binds the Site, owner, configuration, action/app context and expected channel. PKCE additionally binds State hash, browser-binding hash, nonce hash, flow version, redirect URI, scope fingerprint and creation/expiry. Credentials bind connection, revision, authorization epoch, verified Google subject, channel, exact scopes and token expiry. Session URLs bind connection/epoch, operation, original attempt, cipher revision, immutable media ID/server hash/size/MIME and operation fingerprint.

This is application-managed encryption using documented Sites runtime secrets and Worker WebCrypto, not a native per-visitor vault. No production secret was read or configured. Local tests are not a real Sites/D1/R2/Google acceptance test. A compromised runtime can access secrets in use; authenticated encryption does not prevent complete database snapshot rollback. JavaScript memory zeroization and exactly-once external effects are not promised.

## OAuth State and credentials

`YouTubeOAuthStateRepository(db,{...validatedConfig,cipher,clock})`:

- `begin(owner,browserBinding,{nonceFingerprint,pkceVerifier})` returns only `{state,expiresAtMs}`. State has 256 random bits. Only hashes of State, browser binding and OIDC nonce are stored; PKCE verifier is encrypted. Browser binding must be a separate secure, HttpOnly, SameSite cookie or verified equivalent session, never browser JSON. State lifetime is five minutes, database maximum ten minutes, limit five outstanding rows per owner.
- `claim(owner,state,browserBinding)` returns `false` or `{claimed:true,nonceFingerprint}` with a nonenumerable, server-only `pkceVerifier`. Atomic UPDATE plus fresh receipt and SELECT means one winner. Wrong owner/browser/config/channel/expiry/replay does not release the verifier. Unknown claim outcome must not be retried or exchanged. A decryption failure after consumption also cannot release it a second time.

`YouTubeCredentialStore(db,{...validatedConfig,cipher,clock})`:

- `createInstallTicket(owner,{stateHash,expiresAtMs})` binds an unclaimed State to the unique initially empty credential row.
- `getInstallTicket(owner,stateHash)` is called exactly once in the transport's trusted hook **after** successful State claim and **before** code exchange. It returns an opaque, store-branded memory handle. Do not serialize it or re-check it out after a timeout.
- `commitGrant(owner,{ticket,grant,attemptBinding})` accepts only the fully validated closed transport result. Grant fields are exactly `{accessToken,tokenType:'Bearer',subject,channelId,scopes,expiresAtMs}`. Scope set is `openid`, `https://www.googleapis.com/auth/youtube.upload`, `https://www.googleapis.com/auth/youtube.readonly`. No profile/email, refresh token, ID token or provider raw response is stored. Access tokens use the RFC 6750 bearer form, maximum 8192 characters. `channelId` must equal the configured channel.
- `attemptBinding` has exactly `{ownerId,siteId,configFingerprint,contextFingerprint,stateHash,expectedChannelId}` and must match the hidden ticket and factory. This prevents accidental A/B flow composition but is not a browser authorization document.
- Installation rechecks State, ticket receipt, expiry, owner/channel/config and credential revision/epoch in a transaction. Parallel initial connections share one row; only one can install. No silent replacement or reconnect.
- `getMetadata(owner)` authenticates matching active ciphertext before returning a safe identity state and channel. Missing keys or tampering fail closed. No subject, scopes, key ID, token or ciphertext is returned. Disconnected metadata retains the expected channel as a nonsecret historical label, without implying an active connection.
- `disconnect(owner,connectionId,expectedRevision)` performs CAS, clears credentials, increments epoch/revision and leaves a tombstone. It is local credential removal, not Google token revocation or video deletion.
- `rewrap(owner,connectionId,expectedRevision)` uses an explicitly allowed old key, fresh IV and active key with CAS. It never extends expiry or refreshes a grant.
- `withAccessToken(owner,{connectionId,authEpoch},trustedCallback)` is an internal transport hook only. It checks current owner/connection/epoch/expiry and authenticates the envelope, then rechecks the row before invoking the trusted callback. It must never be exposed as a browser token endpoint or have its token argument returned to HTTP.

Google ID-token issuer/signature/audience/authorized-party/time/nonce, userinfo subject and exact `channels.list(mine=true)` verification remain the responsibility of the closed OAuth transport. This repository does not replace that verification. Online authorization only; refresh and reconnect remain absent.

## Media and explicit private-upload approval

`YouTubeUploadRepository(db,{siteId,ownerId,provider:'youtube',configFingerprint,contextFingerprint,expectedChannelId,connectionId,authEpoch,cipher,credentialStore,clock})` is fixed to the authenticated owner and credential context. Historical reads remain available after credential expiry/disconnect. New media, approvals, upload leases and checkpoints require an active matching epoch; explicit local cancellation and revision-bound inspection warnings are owner-bound exceptions that do not transmit provider data.

`reserveMedia(owner,{mediaId,objectKey,sha256,byteSize,mimeType,filename})` accepts only server-verified, immutable object references. R2 key is exactly `youtube-media/<encodedSite>/<encodedOwner>/<mediaId>`; the safe filename never determines a path. Filename is 1–255 well-formed Unicode characters without controls. Media is MP4/WebM, maximum 8 MiB and 20 rows per owner including pending reservations. These are deliberate product/resource limits, not the YouTube API limits. The HTTP ingress must hash actual bounded bytes, inspect signatures/type, write only a unique object and not trust browser hashes, URLs or paths.

Reserve before any R2 write; the pending row already occupies quota and fixes the unique object key, connection ID and authorization epoch. Reservation and commit both require a freshly authenticated active credential and a matching SQL epoch/expiry guard. Immediately before R2.put the trusted ingress must require `assertMediaReservation(owner,mediaId) === true`; it checks the owned pending reservation and current active credential. Only after a positive native R2-object success response does the trusted ingress call `commitMedia(owner,mediaId)` for a guarded pending-to-ready CAS. A disconnect or expiry during the write leaves the row pending rather than making it an upload source. Unknown reserve/write/commit must not trigger a new write or automatic cleanup. Pending rows remain counted and require separately authorized maintenance. A permanent UNIQUE reservation on `(site_id, owner_id, sha256, byte_size, mime_type)` includes pending and ready media. Identical content under any new media ID or filename returns `DUPLICATE_MEDIA_CONTENT` with status 409 before any repeat R2 write. A negative ready-only list/read does not prove an upload never happened. No automatic binding to an existing pending row, retry, deletion or recovery path is added; the user may deliberately choose an already-ready medium. The old direct ready-insert method is absent.

`getMedia(owner,mediaId)` is server-internal and contains the object key. `listMedia(owner)` omits it. Both methods expose only ready rows. No overwrite or media-delete API exists. A failed/unknown D1 commit must never trigger blind R2 deletion or overwrite; R2 and D1 are not one transaction. The integrating ingress must preserve this two-phase ordering and never write a second object for an uncertain reservation.

`prepareUpload(owner,{mediaId,connectionId,authEpoch,metadata})` creates a new server-generated operation ID and immutable plan without contacting Google. Metadata fields are title, optional description/tags, categoryId, madeForKids and containsSyntheticMedia. Public/unlisted visibility, publishAt, scheduling, onBehalfOf and arbitrary fields are rejected. Operation fingerprint covers the fixed channel, server-owned media identity and private metadata; notifySubscribers is always false. A separate server-computed content fingerprint excludes operationId and mediaId/filename: SHA-256 of canonical JSON `{channelId,media:{sha256,size,mimeType},metadata,notifySubscribers}` from the validated private plan. A database UNIQUE constraint binds it to Site/owner/connection/authorization epoch. An identical intent returns `DUPLICATE_UPLOAD_INTENT` with HTTP status 409, including after unknown initiation or cancellation. Renaming media or requesting a fresh operation ID cannot create a second session for that same intent. There is no duplicate-upload override or automatic removal of this durable reservation.

`approveUpload(owner,{operationId,expectedRevision,fingerprint,intent:'upload_private'})` records explicit approval of the exact persisted plan. Preparing, reading, linking a channel or accepting a browser `approved:true` is not approval. `cancelUpload(owner,{operationId,expectedRevision})` revokes local approval and fences outstanding work; it makes no claim about deletion/revocation at Google.

`getUpload` and `listUploads` return safe objects:

`{operationId,revision,state,outcomeCode,approval,operation,fingerprint,media,uploadedBytes,totalBytes,videoId,retryAt,nextAction}`

Approval is `pending`, `approved` or `cancelled`. Media contains mediaId, filename, byteSize, mimeType, sha256 and createdAtMs. No token, session URL, ciphertext, key ID, lease receipt or object key appears. Accepted upload is not processing success or public publication. A fresh video observation belongs in a separate HTTP observation result. `recordInspectionWarning(owner,{operationId,expectedRevision,videoId,outcomeCode})` is a narrow server-only persistence hook after the separately gated inspection. Only UNEXPECTED_PROVIDER_VISIBILITY or VIDEO_IDENTITY_NOT_VERIFIED are accepted, and the owned operation must already contain that exact video ID. A revision CAS sets the fixed warning and manual flag without changing the saved terminal state, video, payload or encrypted session. It does not require an active credential, because the external inspection was gated separately; a stale revision fails with 409. Successful later inspections have no method to clear a stored warning, and cancellation retains it.

## Resumable upload fencing

The private adapter receives only these server-bound methods:

- `authorizeOperation(operation)` checks exact immutable persisted operation and approval.
- `reserveStart(operation)` atomically moves an approved operation to in-flight once. It returns an opaque lease; unknown initiation without a known session can never create a second session under that operation ID.
- `reserveNext(operationId,'upload'|'probe')` permits only a known encrypted session. Leases are exclusive and bounded to 60 seconds. A crashed/expired lease becomes unknown and permits only a probe of that same session, never another chunk or POST before reconciliation.
- `assertLease(lease)` checks the current approval, receipt, revision, deadline and active credential epoch immediately before external effects. The adapter must recheck its total deadline and call this before each write. A network call already in flight cannot be made atomic with a later local cancellation.
- `finish(lease,{state,sessionUrl,nextOffset,chunkBytes,retryAt,videoId?,outcomeCode?,manualReconciliation?})` accepts only fixed normalized states from the trusted transport. It checks monotonic confirmed offsets, immutable chunk size, completion/video ID shape, same session, owner/approval/credential epoch and unexpired lease/revision. An old writer cannot win after another claim, cancel or disconnect. The handle is spent before async work. Unknown commit is not automatically retried.

Session URL is an encrypted secret capability, never browser input or a public DTO. The transport must independently enforce the same allowlist immediately before use: exact HTTPS www.googleapis.com upload path, unique uploadType=resumable and bounded opaque upload_id, optional bounded part, no userinfo/port/fragment/unknown parameters/control characters. The repository refuses URL replacement for an existing operation. Cipher revision is separately recorded so claiming a lease does not require an unnecessary secret rewrite; every confirmed checkpoint re-encrypts with its new revision and a fresh IV.

States are prepared, approved, in_flight, session_ready, unknown, auth_required, rate_limited, quota_exceeded, blocked, upload_accepted and cancelled. Unknown start without a session requires manual reconciliation, not automatic re-upload. A confirmed checkpoint may persist only a fixed, redacted outcomeCode and a boolean manual-reconciliation flag. The allowed codes are PROVIDER_OUTCOME_UNKNOWN, CREDENTIALS_REQUIRED, SESSION_NOT_FOUND_OR_EXPIRED, RATE_LIMITED, QUOTA_EXCEEDED, PROVIDER_PERMISSION_DENIED, VIDEO_IDENTITY_NOT_VERIFIED, UNEXPECTED_PROVIDER_VISIBILITY, PREMATURE_COMPLETION, PROBE_REQUIRED_BEFORE_UPLOAD and RETRY_AFTER_NOT_REACHED. SESSION_NOT_FOUND_OR_EXPIRED and UNEXPECTED_PROVIDER_VISIBILITY require the manual flag; they cannot silently become retryable unknown states on reload. Any manual flag permanently blocks further reservations for that operation and keeps nextAction=manual_reconciliation_no_reupload, including after local cancellation. Raw provider messages are rejected. Failed/unconfirmed checkpoint writes do not invent a provider outcome; uncertain writes are reconciled by an owned read. Retry-after is bounded, persisted and respected. There is no worker scheduler, autonomous retry, public publish, native scheduling or refresh implementation.

## Verification and source evidence

`npm run check` and `npm test` run without installing dependencies. Tests use synthetic public in-memory key bytes and mock token strings, Node WebCrypto and transactional SQLite. They cover crypto/context/purpose substitutions, encrypted PKCE single use, A/B channel binding, CAS install/disconnect/rotation, persisted approval, durable cross-operation content deduplication, credential-fenced media ingestion, media bounds, lease contention/crash recovery, unknown outcomes, session secrecy, safe history, synchronous error redaction and additive migration rollback.

Documentation consulted, without account setup or live authorized calls:

- https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

Real Sites identity/cookie behavior, native D1/R2 transaction/outcome behavior, runtime-secret administration, Google app consent/verification, channel ownership and upload-session interoperability still require explicit operational acceptance. Keys must remain available for outstanding States, credentials, sessions and relevant backups before retiring old decrypt keys.
