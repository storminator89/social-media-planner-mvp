# Native ordered-attachment planning pipeline (not deployed)

Scope: up to 10 ordered images/videos per planner post, shared by its variants. PNG, JPEG, GIF, WebP, MP4 and WebM; 20 MiB/file; existing atomic 100-file / 200-MiB owner quota unchanged. Files are sent only to the same-origin planner API, never to a social provider. No grant, provider upload, transcoding, publishing or scheduling permission is created.

## Contract and integration

- Composer uses `{dataUrl,name,type,alt}` for a new local file. Browser preview should decode it before adoption; decoding is not a server security guarantee.
- Adapter persists bytes then references the owner's media ID. Returned/reopened posts use `{id,url,name,type,alt}`, never Blob/data URLs. No change to existing upload deduplication or cutover strategy was imported.
- Workspace stores existing images as `planner_image`, videos as `planner_video`. New files remain omitted from working-copy payloads until a post save has uploaded them. UI must label this honestly. MIME/kind is checked in the same SQL mutation and on read.
- Integrating UI must render videos using `video controls playsinline preload="metadata"`, not `img`, and use the video kind for workspace capture. The editor persists an ordered attachments array, retaining media as its first-element legacy alias. Reordering uses keyboard-accessible left/right controls. Local and hosted document CSP explicitly allow `media-src self/data/blob` (quoted self in actual policy); script and connection sources remain same-origin only.
- Apply additive drizzle/0011_workspace_attachments.sql via the hosted journal before enabling this version (local equivalent: server/0014_workspace_attachments.sql): it protects every retained workspace attachment against media deletion/identity changes. Existing planner mediaIds already supports ordered arrays; old migrations are unchanged. This is an additive application contract: older clients reject video workspaces, rather than silently flattening them. Deliver new frontend and backend together, force reload stale tabs, test rollback before release. Do not rewrite historical migrations.

## Validation and privacy

Server enforces actual stream bytes, MIME allowlist, bounded file/container framing, image dimensions where directly available, MP4 ftyp/moov/mdat presence, GIF descriptor/palette/subblock boundaries and WebM header/segment VINT plus top-level Info/Tracks/Cluster framing. Checks deliberately do NOT claim full codec, frame, CRC, malware or metadata sanitization. Unusual valid containers (e.g. extended 64-bit MP4 boxes) may require re-export. Media may retain EXIF/location metadata. Browser playback availability varies with codecs. No byte-range support is introduced; files are bounded and fetched whole.

Media reads require the same authenticated owner, return private/no-store, nosniff, CSP sandbox and same-origin resource policy. Do not mount the bucket publicly. Hosted identity header must be injected by trusted Sites Dispatch. Local dev mode is a shared unauthenticated demo and must not contain confidential media.

Existing limitations: retained unreferenced uploads count toward quota; a lost upload response can create a private orphan; uncertain INSERT results retain bytes and return MEDIA_STORAGE_UNCERTAIN (503), and only a confirmed zero-change quota rejection allows deletion; no automatic retry/reconciliation promise; no server-side delete endpoint or transcoding job. Unknown outcomes must remain explicit. Stored media alt text remains read-only in this scope.

## Tests

Real ffmpeg-generated 32×32 blue synthetic image/video fixtures are in tests/fixtures/media; no personal data or provider access. Tests cover all six container types, malformed signatures/lengths/dimensions, authenticated video upload/read, cross-owner denial, adapter persist/reload and workspace video kind checks. Run npm test and npm run check after integration; browser/UI verification is a separate gate.

## Review regressions

Reproduced before fix: a successful INSERT followed by metadata-read failure returned 500 with one DB row but zero bucket objects; malformed 15-byte GIF and 20-byte WebM were accepted. Repository now returns its confirmed insert receipt without a follow-up read. Throw-after-commit, missing receipt and explicit failure receipt retain readable bytes. Tests exercise all these cases. GIF and WebM checks now reject the supplied malformed structures.

## Multiple attachments and release gate

- Planner adapter validates up to 10 attachments, consistent first-media alias, owner-bound media IDs and identical ordered attachment sets across variants. A legacy projection cannot overwrite a multi-attachment post. Invalid media now fails loading instead of disappearing silently.
- Workspace payload keeps ordered owned attachments and an explicit warning if local attachments were omitted. Mixed local/cloud drafts retain every cloud attachment. Missing local attachments must be reselected or explicitly waived. Restore resolves all owned IDs, types and alt texts, with atomic SQL ownership checks and CAS downgrade protection.
- Duplicate/queue operations preserve attachment order. Channel-specific media sets remain rejected rather than flattened. Existing provider publication contracts are unchanged and do not gain multi-media transfer capability. The separate Mastodon single-image preparation remains separate from planner attachments.
- Limits are editorial, not promises of provider support: 10 attachments per post, 20 MiB per file, existing 100-file/200-MiB owner quota. Stored metadata remains read-only. No crop/codec/provider capability is inferred from these limits.
- Deliver frontend/backend together, apply hosted 0011 (local 0014) first, and reload old tabs. Older code rejects new workspace fields and multi-media posts. Do not roll back to a single-media client and rewrite records. Verify desktop/mobile UI visually before any live release. No deployment or provider action was performed.
