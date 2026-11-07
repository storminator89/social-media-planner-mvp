# YouTube HTTP contract for 0.7

Implementation contract, not a deployed service. Default-off. No real Google grant, secret, channel or video is configured. LinkedIn remains separate.

## Common boundary

Only verified Sites Dispatch identity; exact configured HTTPS origin. Mutating requests require Origin, X-Planner-Request: 1 and the appropriate Content-Type. All responses are private/no-store. OAuth is not upload consent. No browser token/session-URL/hash intake. No refresh/reconnect/public scheduling. Uploads can only continue until the current access token expires; no background continuation when the page is closed.

## Connection

GET /api/providers/youtube/oauth/readiness returns:

- schemaVersion: 1; provider: youtube.
- stage: not_configured | ready | linked | expired | disconnected | error.
- capabilities: {initiation, callback, tokenExchange, accountVerification, mediaIngest, privateUpload, publishing:false}. Media/Upload require linked current credentials and separate explicit server upload activation.
- targetConfirmed: boolean; expectedChannelId: null or the configured UC channel ID.
- requiredScopes: exactly openid, https://www.googleapis.com/auth/youtube.upload, https://www.googleapis.com/auth/youtube.readonly.
- authorizationUrl: null. Never a cached OAuth URL.
- connection: null or {id,revision,status:linked|expired|disconnected,expiresAtMs:number|null,channelId}.
- canDisconnect: boolean.
- blockerCodes: strict allowlist below.
- uploadPolicy: {maxBytes:8388608,maxFiles:20,mimeTypes:[video/mp4,video/webm],refresh:false,reconnect:false,background:false,privacy:private,notifySubscribers:false}.

Blocker codes: OAUTH_NOT_CONFIGURED, SITE_CALLBACK_IDENTITY_UNVERIFIED, REGISTERED_APP_CONFIGURATION_REQUIRED, AUTHORIZATION_RESPONSE_PROTECTION_UNVERIFIED, SECURE_TOKEN_LIFECYCLE_UNAVAILABLE, ACCOUNT_TARGET_UNCONFIRMED, PRIVATE_UPLOAD_DISABLED, CONNECTION_EXPIRED, CONNECTION_REMOVED, RECONNECT_UNAVAILABLE, TOKEN_REFRESH_UNAVAILABLE, PUBLISHING_DISABLED.

POST /api/providers/youtube/oauth/start accepts exactly {accountType:channel}. Returns {authorizationUrl,expiresAtMs}. Start requires ready and full corresponding capabilities. The official top-level URL is https://accounts.google.com/o/oauth2/v2/auth with the registered own exact /api/providers/youtube/oauth/callback, response_type=code, exact scope set, state/nonce, code_challenge and code_challenge_method=S256. Extra parameters are limited to the precise server contract; no arbitrary return URL, offline or refresh request.

GET /api/providers/youtube/oauth/callback is processed server-side. The browser only trusts a fresh readiness response, never a success query.

POST /api/providers/youtube/disconnect accepts exactly {connectionId,expectedRevision}. Requires a second explicit confirmation. Successful response is 204, followed by fresh readiness. This removes local stored access and fences future Takt steps. It cannot cancel a Google request already sent, does not delete videos and does not claim provider revocation. Key loss/configuration damage is not supported UI recovery.

## Media

GET /api/providers/youtube/media returns {schemaVersion:1,media:[safe media records]}.

POST /api/providers/youtube/media accepts raw MP4 or WebM bytes with exact Content-Type video/mp4 or video/webm, maximum 8 MiB, plus X-Planner-File-Name containing percent-encoded filename. It saves a private immutable Site object, not a YouTube upload. It requires linked current credentials and mediaIngest. Returned safe record includes mediaId, filename, byteSize, mimeType, server-calculated sha256; never objectKey. Only a maximum of 20 own files is accepted, including pending reservations after uncertain storage outcomes. Quota is reserved before R2 is written; unconfirmed files cannot be upload sources. Signature checks are not a full codec or malware inspection.

## Private upload intent

POST /api/providers/youtube/uploads/prepare accepts exactly {mediaId,metadata:{title,description,tags,categoryId,madeForKids,containsSyntheticMedia}}. It creates a server-generated immutable operation from owned bytes and current channel/credential context, without a provider request. Both disclosure booleans must be consciously selected, never prefilled guesses. Unknown keys, publishAt, privacy changes and external media URLs reject.

The final confirmation displays target channel, filename/size/hash, title/description/tags/category and disclosure choices, private visibility and no subscriber notifications. The stored fingerprint and revision bind this exact summary.

POST /api/providers/youtube/uploads/{id}/start accepts exactly {expectedRevision,fingerprint,intent:upload_private}. It confirms the stored plan and attempts the resumable start once. OAuth alone never authorizes this step.

POST /api/providers/youtube/uploads/{id}/chunk accepts {} and transfers only the next permitted stored chunk. POST /probe accepts {} and only queries the same known stored session. Never create a new session as a fallback after an unknown outcome. POST /inspect accepts {} and reads the exact stored returned video ID. POST /cancel accepts {expectedRevision} and stops future Takt steps, not an already transmitted provider request or existing video.

GET /api/providers/youtube/uploads and GET /api/providers/youtube/uploads/{id} read owned operation status. No response exposes session URL, credentials, provider subject or private R2 key. Every list/read/mutation response uses {schemaVersion:1,uploads:[DTO...]} for the list and {schemaVersion:1,upload:DTO} for one operation. Inspect additionally returns observation (see below). DTO has exactly:

- operationId, revision, state, outcomeCode:null|string, approval, operation, fingerprint.
- media: {mediaId,filename,byteSize,mimeType,sha256,createdAtMs}.
- uploadedBytes, totalBytes, videoId:null|string, retryAt:null|ISO, nextAction.

State: prepared | approved | in_flight | session_ready | unknown | auth_required | rate_limited | quota_exceeded | blocked | upload_accepted | cancelled.
Approval: pending | approved | cancelled.
NextAction: approve_private_upload | start_private_upload | wait | none | inspect_video | manual_reconciliation_no_reupload | upload_next_chunk | probe_same_session.
Operation: {operationId,channelId,media:{size,mimeType,sha256},metadata:{snippet:{title,description,tags,categoryId},status:{privacyStatus:private,selfDeclaredMadeForKids,containsSyntheticMedia}},notifySubscribers:false,fingerprint}. No schedule keys.

Never interpret upload_accepted as processing complete or public. Explicit /inspect returns a separate observation with state private_ready | processing_or_unknown | processing_failed | not_found | check_failed, exactly videoId, privacyStatus:private, processingStatus and uploadStatus on a validated observation. processingStatus is succeeded|processing|failed|terminated|unknown; uploadStatus is uploaded|processed|failed|rejected|deleted|unknown. private_ready requires processingStatus=succeeded or uploadStatus=processed. Failure/absence is exactly {state:check_failed|not_found,code} with VIDEO_CHECK_FAILED, VIDEO_IDENTITY_NOT_VERIFIED, UNEXPECTED_PROVIDER_VISIBILITY or VIDEO_NOT_FOUND_AT_CHECK_TIME. This observation does not change the accepted-upload state or authorize anything. VIDEO_IDENTITY_NOT_VERIFIED and UNEXPECTED_PROVIDER_VISIBILITY are additionally persisted as strict outcomeCode warnings with manual reconciliation using the exact own operation/video/revision. A later successful observation does not silently clear them. Unknown/expired sessions offer no automatic new upload. Histories remain readable after credential expiry or local disconnect; their execution remains blocked.

After the explicit start click, a visible-page controller may drive successive known-ready chunks for that exact approved operation. Stop on hide/pagehide, expiry, errors, uncertainty or changed operation. No automatic restart after reload, no retry of an uncertain write, no new upload after session expiry. User-triggered readback/probe can reconcile a known session.

## Durable uncertainty

Outcome codes are strictly limited to PROVIDER_OUTCOME_UNKNOWN, CREDENTIALS_REQUIRED, SESSION_NOT_FOUND_OR_EXPIRED, RATE_LIMITED, QUOTA_EXCEEDED, PROVIDER_PERMISSION_DENIED, VIDEO_IDENTITY_NOT_VERIFIED, UNEXPECTED_PROVIDER_VISIBILITY, PREMATURE_COMPLETION, PROBE_REQUIRED_BEFORE_UPLOAD and RETRY_AFTER_NOT_REACHED. Raw provider errors are never stored. A missing/expired session and unexpected visibility require manual reconciliation, not another probe or a new upload. The warning remains after reload and cancel.

A content fingerprint independent of operation ID binds the target channel, server media SHA/size/MIME and all provider metadata/disclosures. The same intent within the same credential epoch cannot be recreated after cancellation or an unknown start. Media has a separate Site/owner/content uniqueness constraint including pending rows. A negative ready-only media list cannot prove that an earlier unconfirmed write did not happen. No automatic deletion, reupload or recovery is provided.

## Internal transport fence

The private adapter calls the server-owned `authorizedFetch(url,init,{beforeSend})`. For every POST/PUT, the router obtains and authenticates the current access token first, then requires the supplied attempt-specific `beforeSend()` to resolve to literal `true`. That closure checks the exact durable upload lease, current credential epoch and step deadline. Immediately afterward both request/step signals are checked and the native transport is invoked without another asynchronous dependency. A missing, failed or stale guard prevents sending. This callback is internal code, never an HTTP field or a browser-selected permission.

Cancellation after this last check may race with a request already being dispatched. The implementation fences subsequent steps and stale checkpoint commits; it does not claim an atomic transaction with Google or withdrawal of an already transmitted request.
