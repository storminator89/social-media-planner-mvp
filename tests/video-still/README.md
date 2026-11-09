# Local video-to-still synthetic checks

Run `node --test tests/video-still/*.test.mjs` from the repository root after `npm run build:worker`.

`fixtures/source-av.mp4` and `fixtures/reference-av.webm` are generated, non-personal 640 × 360 synthetic fixtures. They exercise actual container metadata parsing. The Node tests do not decode them in a browser. DOM, video events, animation frames and canvas output are mocked; these checks do not establish actual pixel fidelity, native focus behavior or browser compatibility.

## Supported local input

MP4 with H.264 and optional AAC-LC, or WebM with VP8/VP9 and optional Opus. Limits: 8 MiB, 10 minutes, 1280 pixels per edge and 921,600 pixels total. Only one video track and at most one audio track are accepted. Preflight checks bounded container metadata, not every compressed sample or the entire codec bitstream. It is not a malicious-media decoder sandbox or a comprehensive resource-exhaustion proof. Decoded dimensions and duration are checked again, and each asynchronous stage has a separate 15-second deadline.

## Integration contract

`createVideoStillPicker({onImage, isBusy, fallbackFocus, host, onOpen, onClose})` returns `open()`, `close({force = false})`, `isOpen` and `hasPendingWork`. Without a host it creates a standalone modal. The image studio supplies its own dialog as host, so the picker uses a section within that modal. Opening updates the accessible name; closing restores the original view and focus. Escape returns to the existing editor except during image adoption. Forced parent close cancels pending work.

The callback is `onImage(imageFile, {signal})`. It receives only a derived PNG, never the source video, and must return exactly true after the image editor adopts it. False, rejection or an unconfirmed timeout retain the picker for explicit retry. The callback must respect cancellation before committing state. Late returns from a canceled generation are ignored. The picker never writes to the composer or sends data externally. A later explicit image-editor Apply creates the JPG for the normal single-image workflow.

Ordinary Close remains available during reading, decoding, native seek, frame settling and encoding. It is locked only during image adoption. Tests cover cancellation, deadlines, repeated opening, cleanup, retained edits and alt text, explicit JPG Apply and structural accessibility contracts.

## Policy and layout

The two application handlers include the narrowly approved `media-src 'self' blob:` directive. No other CSP directive or identity/origin restriction changes. Policy failure is surfaced without bypass or automatic retry. `csp.test.mjs` verifies the exact policy in the local handler, hosted handler and generated Worker.

At normal heights, picker content scrolls within a bounded surface above a separate action footer. At viewport heights of 480 CSS pixels or less, the whole picker scrolls so controls remain reachable. Unit tests assert structure, not actual viewport geometry. Codec availability, pixel quality, native keyboard behavior and short-height layout require separate browser validation. No production or browser acceptance is implied by this source test documentation.
