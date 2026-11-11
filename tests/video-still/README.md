# Local video-to-still synthetic checks

Run `node --test tests/video-still/*.test.mjs` from the repository root.

`fixtures/source-av.mp4` and `fixtures/reference-av.webm` are the existing generated, non-personal 640 × 360 synthetic fixtures copied from the local capture experiment. They exercise actual container metadata parsing. The tests do not load them in a browser.

The picker tests deliberately mock the DOM, native video events, animation frames and canvas output. They verify preflight ordering, bounded stages, cancellation, resource cleanup, selection time and the image-only handoff contract. A mock PNG is not evidence of pixel quality or successful image decoding.

The original v21 policy blocks Blob videos in the previously tested Chromium 156 environment. In this isolated v32 copy, based on verified v24 commit `046a02355f846980b18b710992e91e5e88279acb`, the user specifically authorized adding only `media-src 'self' blob:;` to the two existing handlers. `csp.test.mjs` checks the exact full policy, unchanged origin/authentication restrictions and generated Worker. No other policy directive changes. Browser/pixel acceptance is a separate task, not established by these unit tests; Safari compatibility, live operation and deployment remain unclaimed.

The copied parsers inspect bounded container metadata, not every compressed sample or the full H.264/VP8/VP9 bitstream. Preflight is not a malicious-media decoder sandbox or comprehensive resource-exhaustion proof. Actual browser decoding remains separately bounded by lifecycle deadlines and checked decoded dimensions.

## Integration contract

`createVideoStillPicker({onImage, isBusy, fallbackFocus, host, onOpen, onClose})` returns `open()`, `close({force = false})`, `isOpen` and `hasPendingWork`. Without `host` it lazily creates its standalone modal. The image studio passes its own dialog as `host`: the picker instead creates a hidden section, replaces the studio view for this step, and never opens another modal. `onOpen` updates the host view/name; `onClose({accepted})` restores the studio view before focus returns. Escape returns to the existing editor unless image adoption is pending; forced parent close still cancels everything. Include `public/video-still-picker.css` through the existing same-origin stylesheet path.

The callback is `onImage(imageFile, {signal})`. It must return exactly `true` only after its image editor has adopted the derived PNG. False/undefined/rejection preserve the picker for an explicit retry. The callback must reject a pre-aborted signal and stop or roll back its own pending image load on abort, checking the signal and its own generation before any state commit. The picker aborts synchronously on forced close, the independent 15-second adoption deadline, or callback rejection; it ignores late completion. Its signal never contains the original source file.

Ordinary Close and Escape remain available during reading, decoding, native seek, frame settling and PNG encoding. They are locked only while awaiting the image-editor handoff. Forced Close remains available at every stage. Successful adoption closes without stealing focus back from the image editor. No result enters the composer from this picker.

## Port provenance and quality limitation

The video-still implementation and narrow CSP addition were selectively ported from frozen v31. Current v24 queue, planning guidance, text checks, app entry, image model, APIs and migrations remain unchanged. Prior v31 browser tests established native functional MP4/WebM still selection, not complete quality acceptance: original JPEG1 p99<12 criterion failed with p99=14. That finding remains open and is not replaced by post-hoc diagnostics. The v32 browser pass is a separate regression on the ported copy; no deployment is implied.

## v33 UX refinement (local only)

Copied from frozen v32; parsers, bounds, deadlines, CSP, app state, persistence and migrations are unchanged. The picker has a bounded scrollable content area and a separate footer. The concise local-data notice stays visible; codec/size limitations are accessible in a native details disclosure. Status text remains live, with keyboard-scrollable overflow for long errors. A successful capture returns to the format selector; a failed capture keeps focus on the retry action.

`embedded-ux.test.mjs` exercises the actual picker and image editor together with a synthetic DOM and native decoder/canvas stubs. It covers Escape, blocked Escape during adoption, forced closure, timeouts, old edits/alt/Undo, explicit JPG Apply, 25 repeated cycles and structural CSS contracts. These tests do not prove viewport geometry, native focus behavior, keyboard containment, actual decode or pixel fidelity. Those require the separate real-browser pass. No browser result should relabel the outstanding JPEG p99 quality gate as passed.

## v34 short-height fallback

At CSS viewport heights of 480 px or less, the picker becomes one vertically scrollable surface instead of fixed header/footer siblings around a shrinking body. This includes high zoom and short landscape windows. All text and controls remain present at normal sizes. The primary action is reachable by scrolling or keyboard focus, not promised visible simultaneously with the header at arbitrarily small heights. Above this threshold the v33 fixed action area is unchanged. Native geometry/focus-scroll behavior needs the separate browser check; the structural Node assertion is not a browser measurement.
