# Local image paste in the image editor

This feature is included in the v30 source snapshot.

## Behavior

- A native `paste` event inside the open image editor can select exactly one JPG, PNG or WebP file. The small empty-state hint mentions Strg/⌘+V. The image area is focusable without changing the existing opening/closing focus flow.
- Only event-provided file items or its file list are considered. HTML, plain text and URI representations are never read, rendered or fetched. A duplicate representation of the same clipboard file is not counted as a second file.
- Multiple files, unsupported or inconsistent MIME types, empty/oversized files, and unavailable `getAsFile()` results fail without partial selection. The existing 20 MiB input bound, 40 megapixel decode bound and 15-second image-load deadline remain unchanged.
- Already-consumed events, closed/busy editors, a busy composer, the video-still step and focus owned by another native modal do not inspect or consume clipboard data. The underlying composer remains open and modal; it does not block a paste while the image editor owns focus. Native focus ownership is checked instead of counting dialogs or assuming their DOM order. Inputs, textareas, selects and contenteditable targets retain native paste behavior, including mixed text/image payloads. Text-only paste is left untouched everywhere.
- Valid files use the unchanged `load()` path used by file selection and drop. Old image state, text, alt text, history and object URL survive failed replacement. Closing invalidates an in-flight decode; late results cannot revive it. A successful deliberate image replacement resets edits just as file selection does.
- No clipboard read API, permission request, global paste listener, automatic Apply, upload or save was added. The user must still select **Bild übernehmen**, then use normal contribution saving. Workspace drafts do not back up local image bytes.
- Video-still adoption continues to call `load()` while its step is open. Its guard is intentionally only on the new paste entrance.

## Verification scope

The regression tests cover file and item representations, mixed opaque text/HTML payloads, no-text-reading/no-fetch behavior, validation, modal/text-focus/busy guards, source and undo/redo preservation, decode/render rollback, timeout, repeat paste, close/cancel/reopen and explicit Apply. Browser events, canvas/decode completion and failures use controlled test doubles; these tests do not establish native operating-system clipboard behavior or layout.

Product files: `public/image-studio.js`, `public/image-studio-paste.js`. Tests use `tests/ui/image-studio-paste.test.mjs` and the shared `tests/ui/image-studio-harness.mjs`. The harness models an open underlying composer; regressions cover Composer → Studio, a new top modal in either DOM order, returning focus after dismissal, and focus outside the studio.

Generated Worker output is excluded from the source snapshot. Rebuild it with `npm run build:worker`. The root `MANIFEST.sha256` inventories this snapshot.
