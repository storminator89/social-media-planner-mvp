# Unfinished composer work: integrated UI contract

Base: reviewed Takt 0.7.1. The UI increment originally contained no backend; Takt 0.8 now combines it with the real workspace repository, routes and additive migration 0007. Provider/OAuth code, posting capabilities and credentials are unchanged. Historical 0.8 used API 2 / UI state 1. Current 0.9 uses API 3 / UI state 2; the independent workspace HTTP contract remains schema 1 with optional exact planning context. SOURCE-v0.8.sha256 records the fifteen historical 0.8 UI/test files before packaging; the root release manifest binds the whole integration.

## User experience

- A compact composer status distinguishes pending, confirmed, unavailable, paused, conflicting, and uncertain writes. A 900ms debounce saves a separate unfinished snapshot, never a planner post. It is enabled only after a successful workspace list read. Failure does not fall back to browser storage.
- The workspace dialog lists confirmed active copies, capacity, and resume dates. Explicit restore re-reads the canonical planner; a source can be edited only if the originally captured global revision is still identical and the source still exists. Otherwise only an explicit new-copy action is offered. Opening never saves a post.
- Labels preserve canonical values and the raw unfinished CSV separately, including CRLF. Untouched original values are not silently normalized. Text variants retain explicit empty/equal overrides. Unsupported channel/zone/date/time combinations fail closed with copyable raw data.
- Locally selected files are not uploaded for autosave and no bytes, file names, or foreign URLs enter workspace payloads. The omission warning survives restoration. Restored missing media must be reselected or explicitly waived before saving a post.
- Owned saved media is resolved by the backend. A changed canonical alt text requires the user to explicitly choose the current saved alt text before restore. No metadata write is implied.
- Visible text explains that discarding/expiry closes resumption but does not delete retained data. The limit is 20 active and 100 lifetime identities; discarding does not free lifetime capacity.
- The separate idea-note dialog is out of scope. Idea-to-post composer work is included.

## Integration requirements

The final workspace API/repository is integrated under `modules/workspaces/`; append-only migration 0007 is included in the local ledger. The local/Worker handlers bind their own trusted owner and fixed server origin, never a client-selected identity. Hosted Dispatch and private D1 acceptance remain unverified.

Both integrated adapter copies expose the last successfully confirmed canonical revision without changing the state schema:

    get plannerRevision(){ return snapshot?.revision ?? null; }

The composer captures that getter exactly once along with its source projection. It is not replaced by later workspace reads. Missing/null revision never authorizes restore into an existing post. `refreshWorkspacePlanner` temporarily blocks another composer opening while a fresh canonical load is in progress so the store revision and the post projection remain paired.

The state getter must not advance after a failed or conflicting canonical save. Do not combine this increment with the separate API3 posting-schedules change without dedicated integration tests.

## Isolation and interruption behavior

`workspace-client.js` accepts fixed same-origin routes and strict safe DTOs only. The client reads GET lists/single records; PUT snapshots and explicit POST discard use a client-generated cryptographic workspace/write ID and expected revision. No external calls or localStorage.

`workspace-controller.js` keeps uncertain write identity and original payload separate from current editor input. No retry or replacement ID after an unknown outcome. Only exact same-ID readback matching writeId, expectedRevision+1, source and full content confirms a save. A matching minimal closed410 discard receipt confirms closing without retrieving retained content. Different/404/503/closed receipts remain blocked. Conflicting local data is not automatically replaced by a remote read. Hidden-tab saving pauses and requires conscious continuation.

Native form controls are locked during canonical post mutation and subsequent workspace closure. A second editor snapshot comparison protects against delayed events during cleanup. Known successful post saves are never retried just because workspace closure failed. Concurrent workspace changes survive the exact-revision discard conflict.

## Known limits

- Working-copy resumption is not the same as a published/scheduled post or a backup service. A browser crash before confirmation can lose recent input.
- Native date/time controls expose only their accepted value, not every intermediate keystroke. Unsupported stored raw values are preserved on the server and offered for copying rather than silently coerced.
- Existing old post data containing invalid Unicode cannot be autosaved into this stricter workspace format; the local input remains and an unsaved warning is shown.
- An uncertain request can remain blocked indefinitely if no exact receipt can be established. No forced overwrite or automatic replacement copy is offered.
- The integrated local handler and Worker include the real workspace route. Missing hosted Site configuration or migration remains unavailable, never fabricated success. Actual local backend/browser acceptance is reported in QA.md and integration-qa.md; native Sites/D1 acceptance is still open.

REA v60 was read and applied: this is complete-source work, so normal source inspection, implementation and tests were used. No binary engine, Buffer capture, or live-provider evidence is claimed.
