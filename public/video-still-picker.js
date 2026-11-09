import {VIDEO_STILL_LIMITS, validateStillSource, inspectStillSource, validateDecodedStill, validateStillImage} from './video-still-model.js';

const POLICY_FAILURE = 'Die Sicherheitsrichtlinie dieser Site blockiert lokale Video-Vorschauen. Das Standbild kann hier nicht gelesen werden. Es wurde nichts übertragen.';
const MEDIA_FAILURE = 'Dieses Video kann hier nicht gelesen werden. Format, Codec oder Sicherheitsrichtlinie können die Vorschau blockieren.';

// Local-only handoff: this module passes one derived image File to onImage.
// It never passes the source video, changes a composer, or sends data anywhere.
// Site-level CSP permission and browser decoding are separate prerequisites.
// This module never changes, works around, or retries a denied media policy.
export function createVideoStillPicker({onImage, isBusy = () => false, fallbackFocus = () => {}, host = null, onOpen = () => {}, onClose = () => {}}) {
 if (typeof onImage !== 'function') throw TypeError('onImage muss eine Funktion sein.');
 let dialog = null, ui = null, opened = false, generation = 0, source = null, phase = 'idle', returnFocus = null;
 let canvas = null;
 const pending = new Set();
 const active = token => opened && token === generation;
 const status = message => { if (ui) ui.status.textContent = message; };

 // Each stage gets a fresh deadline. Cancellation settles our wait even when a
 // native reader/encoder/callback ignores cancellation and eventually returns.
 function bounded(start, message, cleanup = () => {}) {
  return new Promise((resolve, reject) => {
   let settled = false;
   const failure = value => value instanceof Error ? value : Error(typeof value === 'string' && value ? value : 'Der Vorgang ist fehlgeschlagen.');
   const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pending.delete(cancel);
    cleanup(error);
    if (error) reject(error); else resolve(value);
   };
   const cancel = error => finish(error || Error('Auswahl verworfen.'));
   const timer = setTimeout(() => finish(Error(message)), VIDEO_STILL_LIMITS.stageTimeoutMs);
   pending.add(cancel);
   try { Promise.resolve(start()).then(value => finish(null, value), error => finish(failure(error))); }
   catch (error) { finish(failure(error)); }
  });
 }

 function clearCanvas() {
  if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
 }

 function detach(record) {
  if (!record) return;
  clearTimeout(record.seekTimer);
  for (const [event, listener] of record.listeners) record.video.removeEventListener(event, listener);
  // Detach the media resource and the element before revoking its URL.
  try { record.video.pause(); } catch { /* Best-effort native cleanup. */ }
  record.video.removeAttribute('src');
  try { record.video.load(); } catch { /* A released native element may reject load. */ }
  record.video.remove();
  if (record.url) URL.revokeObjectURL(record.url);
  record.url = null;
 }

 function release(error) {
  generation++;
  for (const cancel of [...pending]) cancel(error);
  const previous = source;
  source = null;
  detach(previous);
  clearCanvas();
  phase = 'idle';
  if (ui) { ui.file.value = ''; ui.filename.textContent = 'Noch keine Datei ausgewählt'; }
 }

 function render() {
  if (!ui) return;
  const working = phase !== 'idle', adopting = phase === 'adopting';
  dialog.setAttribute('aria-busy', String(working || !!source?.video.seeking));
  ui.choose.disabled = working;
  ui.file.disabled = working;
  ui.capture.disabled = working || !source?.ready || source.video.seeking || source.video.readyState < 2;
  for (const button of ui.close) button.disabled = adopting;
  if (source) source.video.controls = !['settling', 'encoding', 'adopting'].includes(phase);
  ui.empty.hidden = !!source;
 }

 function failSource(record, message) {
  if (source !== record || !active(record.token)) return;
  release(Error(message));
  status(message);
  render();
 }

 function policyViolation(event) {
  const record = source;
  if (!record || event.disposition === 'report') return;
  const directive = event.effectiveDirective || event.violatedDirective;
  if (!['media-src', 'default-src'].includes(directive)) return;
  // Browsers may redact this to just "blob". Such a queued event cannot be
  // attributed to one selection and must not invalidate a newer source. The
  // element-owned error still fails closed; the visible policy warning remains.
  if (event.blockedURI !== record.url) return;
  failSource(record, POLICY_FAILURE);
 }

 function installVideo(record) {
  const video = record.video;
  const listen = (event, listener) => { video.addEventListener(event, listener); record.listeners.push([event, listener]); };
  listen('error', () => failSource(record, MEDIA_FAILURE));
  listen('seeking', () => {
   if (!active(record.token) || source !== record) return;
   if (!record.seekTimer) record.seekTimer = setTimeout(() => failSource(record, 'Der gewählte Zeitpunkt konnte nicht rechtzeitig gelesen werden. Bitte die Datei erneut auswählen.'), VIDEO_STILL_LIMITS.stageTimeoutMs);
   if (phase === 'idle') status('Der gewählte Zeitpunkt wird geladen …');
   render();
  });
  listen('seeked', () => {
   clearTimeout(record.seekTimer); record.seekTimer = null;
   if (!active(record.token) || source !== record) return;
   if (phase === 'idle') status('Bereit. Wähle „Standbild bearbeiten“.');
   render();
  });
  listen('resize', () => {
   if (!record.metadata || !active(record.token) || source !== record) return;
   try { validateDecodedStill(video, record.inspected); }
   catch (error) { failSource(record, error.message); }
  });
  for (const event of ['loadeddata', 'canplay', 'waiting', 'emptied', 'pause', 'playing', 'ended']) {
   listen(event, () => { if (active(record.token) && source === record) render(); });
  }
 }

 function waitMedia(record, ready, message, start = () => {}) {
  let cleanup = () => {};
  return bounded(() => new Promise((resolve, reject) => {
   const check = () => {
    if (!active(record.token) || source !== record) { reject(Error('Auswahl verworfen.')); return; }
    if (record.video.error) { reject(Error(MEDIA_FAILURE)); return; }
    if (ready()) resolve();
   };
   const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked'];
   for (const event of events) record.video.addEventListener(event, check);
   cleanup = () => { for (const event of events) record.video.removeEventListener(event, check); };
   start();
   check();
  }), message, () => cleanup());
 }

 async function load(file) {
  if (!opened || phase !== 'idle' || isBusy()) return;
  try { validateStillSource(file); }
  catch (error) { status(error.message); return; }
  release();
  const token = generation;
  phase = 'reading'; status('Datei und Bildmaße werden vor dem Laden geprüft …'); render();
  try {
   const buffer = await bounded(() => file.arrayBuffer(), 'Die Datei konnte nicht rechtzeitig gelesen werden.');
   if (!active(token)) return;
   if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size) throw Error('Die gelesene Dateigröße stimmt nicht mit der Auswahl überein.');
   const inspected = inspectStillSource(new Uint8Array(buffer), file.type);
   if (!active(token)) return;
   // No Blob URL and no video element exist until the complete bounded file
   // passes container, track, codec-metadata and dimension preflight.
   const video = document.createElement('video');
   video.preload = 'auto'; video.muted = true; video.playsInline = true;
   video.disableRemotePlayback = true; video.disablePictureInPicture = true;
   video.setAttribute('controlsList', 'nodownload noremoteplayback');
   video.setAttribute('aria-label', 'Lokale Videovorschau mit nativer Zeitsteuerung');
   const record = {video, token, inspected, url: null, listeners: [], ready: false, metadata: false, seekTimer: null};
   source = record;
   installVideo(record);
   record.url = URL.createObjectURL(file);
   ui.preview.append(video);
   ui.filename.textContent = file.name || 'Lokale Videodatei';
   phase = 'decoding'; status('Lokale Videovorschau wird gelesen …'); render();
   await waitMedia(record, () => video.readyState >= 1,
    'Die Videodaten konnten nicht rechtzeitig gelesen werden. Auch die Sicherheitsrichtlinie kann die Vorschau blockieren.',
    () => { video.src = record.url; video.load(); });
   if (!active(token)) return;
   validateDecodedStill(video, inspected); record.metadata = true;
   await waitMedia(record, () => video.readyState >= 2 && !video.seeking,
    'Das erste Videobild konnte nicht rechtzeitig gelesen werden.');
   if (!active(token)) return;
   validateDecodedStill(video, inspected);
   record.ready = true; phase = 'idle';
   status('Bereit. Wähle den Zeitpunkt mit den Videoreglern.');
   render();
  } catch (error) {
   if (!active(token)) return;
   release(); status(error.message || MEDIA_FAILURE); render();
  }
 }

 function settledFrame(record) {
  let frame = 0, previousTime = null;
  return bounded(() => new Promise((resolve, reject) => {
   const poll = () => {
    if (!active(record.token) || source !== record) { reject(Error('Auswahl verworfen.')); return; }
    const video = record.video;
    try {
     if (video.readyState >= 2 && video.paused && !video.seeking &&
         Number.isFinite(video.currentTime) && video.currentTime >= 0 && video.currentTime <= video.duration) {
      const dimensions = validateDecodedStill(video, record.inspected);
      // The paused current playback position must remain decoded and stable
      // across two animation frames, including after a native seek completes.
      if (previousTime !== null && Math.abs(previousTime - video.currentTime) < 0.000001) { resolve(dimensions); return; }
      previousTime = video.currentTime;
     } else previousTime = null;
     frame = requestAnimationFrame(poll);
    } catch (error) { reject(error); }
   };
   frame = requestAnimationFrame(poll);
  }), 'Der gewählte Zeitpunkt liefert kein rechtzeitig lesbares Standbild.', () => cancelAnimationFrame(frame));
 }

 async function capture() {
  const record = source;
  if (!record?.ready || phase !== 'idle' || !active(record.token) || isBusy()) return;
  const token = generation;
  phase = 'settling'; status('Der aktuelle Zeitpunkt wird als Standbild vorbereitet …'); render();
  try {
   record.video.pause();
   const {width, height} = await settledFrame(record);
   if (!active(token)) return;
   const picture = document.createElement('canvas');
   canvas = picture;
   // Source limits are smaller; this explicit bound also protects the output
   // if the supported source profile is expanded later.
   const scale = Math.min(1, VIDEO_STILL_LIMITS.imageSide / Math.max(width, height));
   picture.width = Math.max(1, Math.round(width * scale));
   picture.height = Math.max(1, Math.round(height * scale));
   const context = picture.getContext('2d');
   if (!context) throw Error('Dieser Browser kann kein Standbild zeichnen.');
   context.drawImage(record.video, 0, 0, picture.width, picture.height);
   phase = 'encoding'; status('Das Standbild wird als lokale PNG-Datei erzeugt …'); render();
   const blob = await bounded(() => new Promise(resolve => picture.toBlob(resolve, 'image/png')),
    'Das Standbild konnte nicht rechtzeitig erzeugt werden.');
   if (!active(token)) return;
   validateStillImage(blob);
   const image = new File([blob], 'video-standbild.png', {type: 'image/png'});
   clearCanvas();
   if (isBusy()) throw Error('Der Bildeditor ist gerade beschäftigt. Bitte gleich erneut versuchen.');
   phase = 'adopting'; status('Das Standbild wird im Bildeditor geöffnet …'); render();
   // Close is locked only during this external handoff. The callback must
   // respect this signal before committing its own image-editor state.
   // Cancellation aborts it synchronously before a late return is discarded.
   const adoption = new AbortController();
   const accepted = await bounded(() => onImage(image, {signal: adoption.signal}),
    'Der Bildeditor hat die Übernahme nicht rechtzeitig bestätigt. Das Video bleibt hier geöffnet.',
    error => { if (error) adoption.abort(); });
   if (!active(token)) return;
   if (accepted !== true) throw Error('Der Bildeditor hat das Standbild nicht übernommen. Bitte erneut versuchen.');
   dismiss({force: true, restoreFocus: false});
  } catch (error) {
   if (!active(token)) return;
   status(error.message || 'Das Standbild konnte nicht übernommen werden.');
  } finally {
   if (active(token)) { clearCanvas(); phase = 'idle'; render(); (ui.capture.disabled ? ui.choose : ui.capture).focus(); }
  }
 }

 function dismiss({force = false, restoreFocus = true} = {}) {
  if (!opened) return true;
  if (phase === 'adopting' && !force) return false;
  release(); render();
  document.removeEventListener('securitypolicyviolation', policyViolation);
  opened = false;
  if (host) dialog.hidden = true; else dialog.close();
  onClose({accepted: !restoreFocus});
  if (restoreFocus) {
   if (returnFocus?.isConnected) returnFocus.focus(); else fallbackFocus();
  }
  returnFocus = null;
  return true;
 }

 function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement(host ? 'section' : 'dialog');
  if (host) dialog.hidden = true;
  dialog.id = 'video-still-picker'; dialog.className = 'video-still-picker';
  dialog.setAttribute('aria-labelledby', 'video-still-title');
  dialog.innerHTML = `<header class="video-still-head"><div><h2 id="video-still-title">Standbild auswählen</h2><p>Video bleibt lokal. Nur das gewählte Bild geht in den Bildeditor.</p></div><button type="button" class="icon-button" data-video-still="close" aria-label="Zurück zum Bildeditor">✕</button></header>
   <div class="video-still-body">
    <div class="video-still-toolbar"><button type="button" class="button subtle" data-video-still="choose">Video auswählen</button><span id="video-still-filename">Noch keine Datei ausgewählt</span><input id="video-still-file" type="file" accept="video/mp4,video/webm" hidden></div>
    <div id="video-still-preview" class="video-still-preview"><p id="video-still-empty">Wähle eine MP4- oder WebM-Datei bis 8 MiB.</p></div>
    <details class="video-still-details"><summary>Welche Videos funktionieren?</summary><p>MP4 mit H.264 und optional AAC-LC oder WebM mit VP8/VP9 und optional Opus. Maximal 8 MiB, 10 Minuten, 1280 Pixel je Kante und 921.600 Pixel insgesamt (z. B. 1280 × 720). Browser, Codec und Sicherheitsrichtlinie können die Vorschau begrenzen. Kein Videoschnitt oder Tonexport.</p></details>
   </div>
   <footer class="video-still-footer"><p id="video-still-status" role="status" aria-live="polite" tabindex="0"></p><div><button type="button" class="button subtle" data-video-still="close">Zurück</button><button type="button" class="button primary" data-video-still="capture" disabled>Standbild bearbeiten</button></div></footer>`;
  const query = selector => dialog.querySelector(selector);
  ui = {
   choose: query('[data-video-still="choose"]'), capture: query('[data-video-still="capture"]'),
   close: [...dialog.querySelectorAll('[data-video-still="close"]')], file: query('#video-still-file'),
   filename: query('#video-still-filename'), preview: query('#video-still-preview'),
   empty: query('#video-still-empty'), status: query('#video-still-status'),
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('click', event => {
   const action = event.target.closest('[data-video-still]')?.dataset.videoStill;
   if (action === 'close') return dismiss();
   if (phase !== 'idle') return;
   if (action === 'choose') { if (!isBusy()) ui.file.click(); }
   if (action === 'capture') return capture();
  });
  ui.file.addEventListener('change', event => {
   const files = [...(event.target.files || [])];
   event.target.value = '';
   if (!files.length) return;
   if (files.length !== 1) { status('Bitte genau eine Videodatei auswählen.'); return; }
   return load(files[0]);
  });
  // A drop must never navigate away from the editor or create a second route.
  for (const event of ['dragover', 'drop']) dialog.addEventListener(event, e => e.preventDefault());
  (host || document.body).append(dialog);
 }

 return {
  open() {
   if (isBusy() || opened) return false;
   ensureDialog();
   returnFocus = document.activeElement;
   release(); status(''); render();
   opened = true;
   if (host) dialog.hidden = false; else dialog.showModal();
   onOpen();
   document.addEventListener('securitypolicyviolation', policyViolation);
   ui.choose.focus();
   return true;
  },
  close({force = false} = {}) { return dismiss({force}); },
  get isOpen() { return opened; },
  get hasPendingWork() { return opened && (phase !== 'idle' || !!source); },
 };
}
