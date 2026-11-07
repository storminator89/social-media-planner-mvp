> Historical component QA before integration. Later lifecycle tests and the final integrated browser smoke are documented in LIFECYCLE.md and integration-qa.md. This report does not replace the current root verification report.

# Original component Workspace UI verification, 7 November 2026

## Offline acceptance

Final isolated suite: 1036/1036 passed in UTC, America/Los_Angeles and Asia/Tokyo. JavaScript syntax checks and dependency-free Worker build passed. The generated Worker remains unpublished and still uses the unchanged baseline backend; this is not Workspace cloud runtime acceptance.

The isolated implementation is based on reviewed0.7.1, preserving provider/OAuth/data modules. New regressions cover strict safe DTOs, raw CSV/Unicode preservation, owned-media conflict handling, immutable origin, source deletion/change, invalid-input races, multiple tabs, unknown write identity/readback, interrupted reads, missing files, post-save cleanup races, repeated clicks and disposed-controller behavior. Existing assertions were retained; only fixture globals were expanded for new composer hooks.

An independent test worker added 50 client/controller/real-application-body regressions, reproduced and verified fixes, and left production files unchanged. Another12 tests cover the restore model and actual capture hooks. No live provider or authentication test is claimed.

## Browser: actual local backend

Used a separate QA copy (`takt-workspace-ui-qa`) with the real final workspace repository, additive0007, local SQLite and the documented loopback-only HTTP opt-in. This is not native D1 or production authentication. The QA-only adapter exposed the exact plannerRevision getter. No fake status stores or provider successes, no uploads, no external calls.

- Incomplete CSV (`Kampagne, "noch offen`) and multiline text were confirmed as a separate workspace, then survived closing and reloading.
- Restoring opened an editor without a post write. The unfinished CSV still blocked actual post save with a clear error. Correcting it allowed explicit draft save and exact-revision workspace closure.
- The active count fell to0 while the lifetime count remained1, matching retained closure semantics.
- A second real browser tab changed the canonical source. The first tab's fresh restore check offered only an explicit new copy, never original overwrite.
- Both tabs opened the same workspace. Tab two saved its new working version; tab one received a real409, retained its different local text and could inspect the remote version without applying it.
- Explicit discard had a distinct confirmation. The conservative “Behalten” action received initial keyboard focus. After confirm, active0/total2 reflected retained closed copies.
- Desktop viewport1174 CSSpx, document/client1159; dialog720 with no overflow. At native browser300% zoom, viewport391 CSSpx, document/client386; workspace dialog347 and composer386, each with matching scrollWidth. No horizontal overflow. Keyboard Tab from the review heading reached the deliberate restore button. Buttons wrapped and the dialog/editor scrolled vertically.

Only the owned QA tabs were closed. Zoom was reset to100% through the exact bound Chromium window. No window move/resize, desktop interaction, external account or upload occurred. Preview was stopped. Synthetic `.local` data was moved outside the deliverable.

## Verification limits / integration notes

Media omission and canonical-alt conflicts were verified in unit/controller tests, not with browser file uploads. Network timeouts/lost responses and late events were deterministically tested, not induced against a hosted service. Actual hosted Sites/D1 identity/storage remains for integration acceptance.

The first throwaway QA router incorrectly passed the original request after `new Request(request,{headers})` transferred its body; it returned503. The UI preserved uncertainty and did not resend. Routing the already-created internal request to the workspace handler fixed the QA wrapper. This backend wrapper is not part of the UI handoff and must not be copied back.

Small final browser-discovered refinements: the workspace entry button stays disabled until its event handlers exist, dialog heading padding is consistent on desktop/mobile, and the discard confirmation focuses the safe action. The final source was refreshed and rechecked at narrow width.
