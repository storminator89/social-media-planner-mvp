> Historical 0.8 component/browser evidence, not a new 0.9 acceptance result.

# Lifecycle and late-input follow-up

The integration review identified two UI lifecycle edges after the initial handoff.

1. `createWorkspaceUI.destroy()` now unregisters its exact status click, dialog click, entry-button click, dialog cancel and visibility listeners, marks the instance disposed, invalidates read epochs and aborts local read/discard requests. Public UI hooks, retained callbacks and async continuations cannot send another request, refresh the planner, reopen an editor, render or move focus after disposal. Destruction is idempotent. An already-sent request may still commit on the server; abort is not represented as an undo or as proof it never arrived. An external planner refresh already started before teardown cannot be retroactively cancelled by the wrapper, but its completion cannot trigger restore or further UI effects in this component.

2. The rare late-input defense branches after a positively confirmed post save/delete now explicitly mark newer editor text as `local_only`, dirty and not automatically secured. The controller does not allocate a new workspace ID, repeat a write or reopen a closed workspace. The user can copy text or deliberately save the post. Exact reconciliation of an older unknown discard resolves only that older uncertainty; it preserves the new local-only warning. Close warns even when a late new-copy input happens to equal the original editor baseline after deletion.

The three production files changed from the initial workspace handoff are `public/app.js`, `public/workspace-controller.js` and `public/workspace-ui.js`. Tests add `tests/ui/workspace-lifecycle.test.mjs` and `tests/ui/workspace-local-only.test.mjs`; one prior controller expectation now names the explicit local-only state instead of paused. All prior identity, no-retry and content-preservation assertions remain.

The independent test worker added 30 regressions, plus one final actual-beforeunload regression: exact handler removal, saved stale callbacks, fulfilled/rejected async reads, pending restores/discards/readbacks, post-save late input in both snapshot branches, delete-new-copy branches, deliberate copying and dirty-close behavior. The original review lifecycle probe still passes unchanged. Integrated browser smoke is documented separately once run; these deterministic late-event tests are not claims of hosted D1 or live provider acceptance.

Before the final beforeunload-expression update, local verification: 1066/1066 tests passed independently in each of UTC, America/Los_Angeles and Asia/Tokyo; JavaScript syntax checks and Worker build passed. These supersede the initial handoff's 1036-test count.

The final warning-consistency fix extends the existing beforeunload guard to `hasUnsavedLocalInput` while the composer is open. It warns on reload/tab close for the same retained-local-input case, even if its text matches the old baseline. Deliberate composer closure still suppresses that warning. The actual handler is tested in five combinations.
