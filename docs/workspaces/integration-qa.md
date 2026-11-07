# Integrated workspace browser smoke

Completed 2026-11-07 against a separate QA copy of the integrated Takt 0.8.0 source. The real integrated `server/dev.mjs` supplied its fixed `http://127.0.0.1:4173` origin, local SQLite workspace API and actual `store.plannerRevision` getter. No mock status or workspace store was substituted. The integration source tree was not changed.

## Verified through the browser

- A fresh instance reported zero active and zero total workspaces. Multiline composer text and unfinished raw CSV (`Test, "offen`) were saved as an editor workspace, then recovered after closing the editor and reloading the page. Both values remained exact.
- After explicitly correcting the labels and saving a canonical draft, the editor closed and the workspace list reported zero active and one total. The draft was visible in the planner. This checks successful post persistence followed by workspace closure, not a claim that discarded data are deleted.
- Editing that draft created a new workspace. The workspace could explicitly reopen its original source, exercising the real revision getter paired with the current planner projection.
- A second browser tab restored the same workspace and saved a different text. Editing the first tab produced a visible save conflict. Its local text remained `Lokale Fassung aus Tab A darf nicht verloren gehen.` after reading the separate server version `Serverfassung aus Tab B.`. The server-comparison dialog did not offer an implicit overwrite or replace the open local editor.
- Closing that conflicted editor required a clear discard-local-changes confirmation. The synthetic local text was then deliberately discarded only for test cleanup; the saved server workspace remained available.
- Narrow-layout check used browser zoom in the exactly identified QA Chromium window, without resizing or interacting with another window. The observed viewport was 391 CSS pixels. Document client/scroll widths were 386/386, workspace dialog 347/347 and composer 386/386: no horizontal overflow. A real Tab key focused “Rohdaten kopieren” with a visible focus outline. The mobile dialog and underlying composer remained readable and operable.
- At cleanup, zoom was restored to 100 percent (viewport 1174 CSS pixels; document client/scroll widths 1159/1159), only the two created QA tabs were closed, and the managed Sites preview was stopped. Synthetic SQLite state was moved outside the deliverable source directory.

## Scope and limitations

This smoke checks actual local HTTP/SQLite integration, not hosted D1, remote deployment, real account authorization or provider publishing. There were no file uploads, OAuth actions or provider contacts. Teardown and deliberately late-input race cases remain covered by deterministic tests of actual UI/controller/app functions; this browser smoke does not claim to induce those artificial races through normal human input.

The REA complete-source workflow was applied as ordinary source and boundary inspection plus reproducible tests; there was no reverse-engineering runtime or external product-copying step. The isolated UI-source verification passed 1067 tests per UTC, America/Los_Angeles and Asia/Tokyo, syntax checks and Worker build. The complete integrated version passed 1146 tests in each of those zones; see the root verification report for its independent 1091-test read-only review and build evidence. The 15-entry `SOURCE.sha256` source manifest is unchanged by this report.
