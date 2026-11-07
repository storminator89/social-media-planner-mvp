# Unfinished editor workspaces: integrated backend contract

This package stores unfinished editor work separately from published/scheduled/draft planner posts. It does not publish, upload media, create accounts, grant permissions, deploy a Site, implement login, or prove cloud persistence. It has no localStorage fallback. The authoritative integration baseline is `takt-social-mvp-v0.7.1-reviewed`; its backend and migrations 0001–0006 are byte-identical to reviewed 0.7. The new migration 0007 is additive and is included in the local migration ledger transaction. Hosted application has not occurred. No existing migration or table definition is changed.

## Files and dependencies

- `modules/workspaces/workspace-domain.mjs`: synchronous data-only snapshots and bounded unfinished payloads.
- `modules/workspaces/workspace-repository.mjs`: `EditorWorkspaceRepository`, `WORKSPACE_POLICY`, `isWorkspaceRepository`.
- `modules/workspaces/workspace-api.mjs`: optional `createEditorWorkspaceApi` route handler.
- `server/0007_editor_workspaces.sql`: one separate table plus index.
- Tests use Node's built-in SQLite only. Production modules use WebCrypto, Fetch, TextEncoder/TextDecoder and D1-style `prepare().bind()`/atomic `batch()`; no Node imports or third-party libraries.

`npm test` and `npm run check` run offline. Test fixtures contain only synthetic data.

## Trust boundary

Construct `new EditorWorkspaceRepository(db,{siteId,clock})` only on the server with a fixed Site DB and server-owned clock. Legacy planner posts/media are owner-scoped, not site-scoped: the same physical legacy database must never be shared among different Sites. The WeakMap detects one wrapper object reused under different site IDs; it cannot establish that differently wrapped database handles point to separate databases. The deployment binding is a required trust boundary, not inferred authentication.

The optional HTTP factory requires `{repository,siteOrigin,authenticateRequest,bodyTimeoutMs?,allowLoopbackHttp?}`. `siteOrigin` is an exact HTTPS origin by default. For the existing local preview only, the server may explicitly set `allowLoopbackHttp:true` for an exact HTTP origin on `localhost`, `127.0.0.1` or `[::1]` with its fixed port. No other HTTP host or wildcard is accepted. Sites must retain HTTPS; the flag is server configuration, never request input. `authenticateRequest(request)` is a trusted server integration callback returning the verified authenticated owner string. The factory deliberately does not authenticate a client-provided header. A native Sites integration must use its verified Dispatch principal and private DB binding; a local integration must use its existing verified local principal. No owner from JSON, paths, query strings, cookies supplied to this library, or a raw public header is accepted as authority.

Before calling the normal planner router, invoke the workspace handler. It returns `null` for other prefixes. It rejects cross-site fetches, wrong URL origin, query strings, duplicate JSON keys, unknown fields, invalid UTF-8 and bounded-body timeout. The reader copies each nonempty chunk into owned bytes and enforces a monotone deadline before/after reads, before parsing and before returning, in addition to a timer for blocked reads. Empty chunks do not accumulate. Every mutation requires exact `Origin` and `X-Planner-Request: 1`. No CORS headers are emitted. All responses are private/no-store. API integration must retain the enclosing application's authentication and deployment gates. Runtime D1/Sites acceptance is still required; offline SQLite proves neither live cloud access nor deployment identity injection.

## Payload, schema version 1

Every key is required. Full snapshots only; there is no PATCH/default-empty behavior.

```
{
  title: string,                 // exact canonical title baseline, <=200 chars
  tags: string[],                 // exact canonical tags baseline, <=20 x 60 chars
  rawTags: string,                // raw CSV input, <=4096 chars, even incomplete quotes
  baselineRenderedTags: string,   // original rendered CSV, <=4096 chars
  text: string,                  // base body, <=20000 chars
  variantTexts: { [channelId]: string }, // <=20; missing inherits; ''/same text stays explicit
  channels: string[],            // <=20, unique IDs
  date: string, time: string,     // unfinished local input, <=32 each
  timeZone: string,               // unfinished zone input, <=100; not converted/validated as schedule
  media: null | { kind: 'planner_image', id: string, alt: string },
  cover: null | 'sunrise' | 'forms' | 'studio' | 'nature',
  activeTextTarget: 'base' | selectedChannelId,
  localMediaOmitted: boolean      // true requires media:null; warning survives reload
}
```

Whitespace, CRLF, duplicate/empty labels, unfinished CSV/date/time, explicit empty/equal variants and media alt are preserved. The store does not parse labels or schedule a date. Payload JSON is limited to 128 KiB encoded UTF-8, including JSON escaping. Strings must be well-formed Unicode. Accessors, hidden/symbol/unknown fields, sparse arrays and inherited data are rejected before the first await.

Only an existing same-owner PNG/JPEG/WebP planner-image ID may be referenced. The server checks that ownership/MIME in the same mutation. No dataUrl, Blob, external URL, bytes, object key, name or type from the client are accepted. A local selected file is represented only by `media:null,localMediaOmitted:true`; autosave never authorizes uploading it. The UI must keep the missing-file warning until a conscious new selection/removal.

## Repository and HTTP contract

Owner is always a separate server argument. Client-generated cryptographically random IDs must be known **before** sending; use `crypto.randomUUID()`. workspaceId/writeId syntax is 16–100 ASCII letters, digits, hyphen or underscore. An ID is not authentication.

- `list(owner)` / `GET /api/planner/workspaces`
  returns `{schemaVersion:1,policy,capacity,workspaces:Summary[]}`.
- `load(owner,workspaceId)` / `GET /api/planner/workspaces/{workspaceId}`
  returns `{schemaVersion:1,workspace:FullDTO}` for an active copy only.
- `save(owner,{schemaVersion:1,workspaceId,expectedRevision,writeId,sourcePostId,basePlannerRevision,payload})`
  / `PUT /api/planner/workspaces/{workspaceId}` with exactly the same body **except workspaceId**, supplied by path.
  returns `{schemaVersion:1,workspace:FullDTO}`.
- `discard(owner,{schemaVersion:1,workspaceId,expectedRevision,writeId})`
  / `POST /api/planner/workspaces/{workspaceId}/discard`, body excludes workspaceId.
  returns only `{schemaVersion:1,workspace:DiscardReceipt}`. Discard is closing, not permanent deletion.

Create uses expectedRevision 0. Subsequent changes use the exact positive revision. IDs cannot be reused after expiry/discard. Source fields are nullable but immutable. New non-null source must be an existing same-owner post. Updates can retain the source after the original post was deleted; they never recreate it. sourcePostId intentionally has **no foreign key**: canonical planner snapshots delete/reinsert posts. Stored media has an owner/ID foreign key and remains referenced even after closure. A future media-deletion feature must explicitly handle these retained references; this package does not delete media.

FullDTO keys, exactly:

```
workspaceId, revision, state, writeId,
sourcePostId, basePlannerRevision, currentPlannerRevision, sourceExists,
createdAtMs, updatedAtMs, expiresAtMs,
resolvedMedia, mediaMetadataConflict, payload
```

state is `active`, `discarded` or `expired` internally, but normal load/save succeeds only with `active`. sourceExists is null for no source, otherwise boolean. `currentPlannerRevision` and sourceExists are fresh server observations from the same batch, **not** a replacement origin baseline. `resolvedMedia` is null or `{id,url,alt,name,type}` from the owned canonical media row; url is fixed `/api/planner/media/{id}`. Its alt is the current canonical alt. `payload.media.alt` remains the working-copy value. `mediaMetadataConflict` explicitly marks any mismatch. The UI must ask for a conscious resolution and may not silently update either value. Other media keys are never returned.

Summary is FullDTO without payload/resolvedMedia, plus `{title,preview}` (text truncated to at most 160 UTF-16 code units without splitting a surrogate pair). `mediaMetadataConflict` is present. DiscardReceipt contains exactly `{workspaceId,revision,state:'discarded',writeId,lastOperation:'discard',updatedAtMs,expiresAtMs}`. Replayed receipts never reveal retained payload/media, including beyond the resume window.

Policy is exactly:

```
{activeLimit:20,totalLimit:100,maxPayloadBytes:131072,resumeWindowMs:2592000000,
 automaticDeletion:false,totalLimitIsLifetime:true,retainedAfterClosure:true}
```

capacity is `{active,total,activeRemaining,totalRemaining}`. List contains active copies only. Tombstones still count in total. No hidden pagination/unbounded results.

## Multiple tabs, uncertain writes and restoration

Mutation and returned receipt SELECT occur in the same atomic D1 batch. Parallel tabs cannot overwrite each other: one revision wins; the other gets 409. No automatic merge or force-save exists. All operation fields, expected revision and content are SHA-256-bound. An exact latest save/discard retry may return the same committed receipt; it does not change revision or extend retention. A changed envelope with the latest writeId is rejected. Historical write IDs are not a permanent operation ledger; clients must generate a fresh random writeId for each new intent and never reuse IDs.

On a transport timeout/503, freeze that editor write intent and read its **same known workspace ID**. Compare writeId, revision=expectedRevision+1 and the entire original content/source envelope. A matching receipt confirms that specific write. A different receipt is a conflict, not permission to overwrite. A 404 does not prove a write never occurred on an eventually consistent/failed backend; do not automatically retry or create a replacement ID. If an exact retry is explicitly chosen after reconciliation it uses the unchanged ID/writeId/envelope. Unknown DB batch outcome is returned as `WORKSPACE_STORAGE_UNCERTAIN` with no raw exception, SQL or cause.

For a closed ID, GET is 410 `WORKSPACE_CLOSED` with details `{workspaceId,currentRevision,state,writeId,lastOperation}` only. This allows discard reconciliation without serving the retained draft. If the latest receipt cannot be established, remain blocked/manual; do not claim success or restore automatically. On unknown post-save outcome, keep the workspace until the canonical planner save is positively confirmed. After a confirmed post save, discard only its matching workspace revision; a concurrent workspace edit must produce 409 and remain intact.

Capture sourcePostId plus basePlannerRevision from **the same loaded canonical snapshot when the composer opens**. The integration must expose its existing private canonical snapshot's revision via a read-only store getter; a later request must not invent/rebase the origin. A null origin revision for an existing source cannot authorize restore into that post. Restoration first loads the canonical planner fresh. Any changed global revision or missing/changed original requires explicit new-copy restoration, not an automatic overwrite. This is conservative even if another post caused the global revision change. This package never mutates/restores a post.

## Retention and bounded storage

30 days is a **resume window after the last confirmed new save**, not a deletion deadline or cloud guarantee. Successful new saves renew it. Exact retries and reads do not. At `now >= expiresAtMs`, owner access lazily changes active to expired with revision increment; payload/media references remain. Discard similarly closes with revision increment. Neither operation physically purges or restores anything.

At most 20 active and 100 total lifetime identities per Site/owner, including expired/discarded copies. Maximum retained payload storage is 100 x 128 KiB plus bounded metadata. No eviction, silent cleanup or quota reset occurs. Discard frees an active slot but not a lifetime slot. Existing active copies remain writable at the total limit. At lifetime exhaustion the user needs a separately authorized archive/purge/recovery policy, which is **not implemented**. No routine UI resume of closed data is available. This deliberate conservative cap must be surfaced honestly; it is not unlimited retention or permanent deletion.

## Errors and integration checks

Errors are `{error:{code,details?}}`. Relevant codes: WORKSPACE_CONFLICT (409), WORKSPACE_WRITE_ID_REUSED (409), WORKSPACE_SOURCE_CHANGED (409), WORKSPACE_SCHEMA_CHANGED (409), WORKSPACE_CAPACITY_REACHED (409 with capacity), WORKSPACE_CLOSED (410), WORKSPACE_NOT_FOUND (404), WORKSPACE_SOURCE_UNAVAILABLE (404), WORKSPACE_MEDIA_UNAVAILABLE (400 on write or503 inconsistent stored media), WORKSPACE_TOO_LARGE (413), WORKSPACE_STORAGE_UNAVAILABLE/UNCERTAIN (503). Never use a generic error as permission to fall back to localStorage, upload a file or overwrite posts.

Completed locally in Takt 0.8: migration ledger 7, trusted principal/DB/fixed-origin wiring, canonical revision getter, UI reconciliation/conflict/retention warnings and existing owned-media route integration. Still pending: actual Sites Dispatch identity, physically private D1 binding, hosted migration and runtime acceptance. Offline tests simulate transaction rollback and post-commit response loss, not all native failure modes or multi-region reads. No production-readiness claim is made.
