import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVideoStillPicker} from '../../public/video-still-picker.js';
import {VIDEO_STILL_LIMITS} from '../../public/video-still-model.js';

// Intentionally mocked DOM/media/canvas. These tests prove lifecycle behavior,
// not browser codec acceptance, actual pixel output, or the blocked live CSP.
const bytes = readFileSync(new URL('./fixtures/source-av.mp4', import.meta.url));
const file = (name = 'synthetic.mp4') => new File([bytes], name, {type: 'video/mp4'});
const flush = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const png = () => new Blob(['mock encoded PNG'], {type: 'image/png'});
const timeout = VIDEO_STILL_LIMITS.stageTimeoutMs;

function harness(onImage = async () => true, options = {}) {
 const controls = new Map(), nodes = [], videos = [], canvases = [], log = [], draws = [], closes = [];
 let nextURL = 0, autoMetadata = true, autoData = true, holdFrames = false, holdEncode = false;
 const frames = new Map(); let frameID = 0;
 class Element {
  constructor(tag = '', id = '') {
   this.tagName = tag; this.id = id; this.listeners = new Map(); this.children = []; this.value = '';
   this.open = false; this.isConnected = true; this.hidden = false; this.disabled = false;
   this.readyState = 0; this.videoWidth = 640; this.videoHeight = 360; this.duration = 4;
   this.currentTime = 0; this.paused = true; this.seeking = false; this.error = null;
  }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  async fire(name, event = {}) { for (const fn of [...(this.listeners.get(name) || [])]) await fn({preventDefault() {}, target: this, ...event}); }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { if (name === 'src') this.src = ''; else delete this[name]; }
  set src(value) { this._src = value; log.push(['src', this, value]); }
  get src() { return this._src; }
  append(child) { child.parent = this; this.children.push(child); }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); log.push(['remove', this]); }
  focus() { document.activeElement = this; }
  click() { this.clicked = true; }
  showModal() { this.open = true; }
  close() { this.open = false; closes.push(this); }
  pause() { this.paused = true; log.push(['pause', this]); }
  load() {
   log.push(['load', this, this.src]);
   if (!this.src || !autoMetadata) return;
   queueMicrotask(async () => {
    this.readyState = 1; await this.fire('loadedmetadata');
    if (autoData) { this.readyState = 2; await this.fire('loadeddata'); }
   });
  }
  getContext() { return {drawImage: (...args) => draws.push({args, time: args[0].currentTime})}; }
  toBlob(callback, type) { this.finishEncode = callback; this.encodeType = type; if (!holdEncode) queueMicrotask(() => callback(png())); }
  querySelector(selector) { return controls.get(selector); }
  querySelectorAll(selector) { return selector === '[data-video-still="close"]' ? this.closeButtons : []; }
  set innerHTML(html) {
   this.html = html; this.closeButtons = [];
   for (const match of html.matchAll(/id="([^"]+)"/g)) controls.set('#' + match[1], new Element('', match[1]));
   for (const match of html.matchAll(/data-video-still="([^"]+)"/g)) {
    const button = new Element('button'); button.dataset = {videoStill: match[1]};
    controls.set(`[data-video-still="${match[1]}"]`, button);
    if (match[1] === 'close') this.closeButtons.push(button);
   }
  }
 }
 const originals = {document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, fetch: globalThis.fetch};
 const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
 const doc = new Element('document');
 doc.activeElement = new Element('button', 'opener'); doc.body = new Element('body');
 doc.createElement = tag => { const e = new Element(tag); nodes.push(e); if (tag === 'video') videos.push(e); if (tag === 'canvas') canvases.push(e); return e; };
 globalThis.document = doc;
 globalThis.fetch = () => assert.fail('The picker must never fetch');
 globalThis.requestAnimationFrame = callback => {
  const id = ++frameID; frames.set(id, callback);
  if (!holdFrames) setImmediate(() => { const fn = frames.get(id); frames.delete(id); fn?.(0); });
  return id;
 };
 globalThis.cancelAnimationFrame = id => frames.delete(id);
 URL.createObjectURL = input => { const url = 'blob:still-' + ++nextURL; log.push(['createURL', url, input]); return url; };
 URL.revokeObjectURL = url => log.push(['revokeURL', url]);
 const picker = createVideoStillPicker({onImage, ...options});
 return {
  picker, controls, nodes, videos, canvases, log, draws, doc, frames, closes,
  get dialog() { return nodes.find(node => node.tagName === 'dialog'); },
  get status() { return controls.get('#video-still-status').textContent; },
  get captureDisabled() { return controls.get('[data-video-still="capture"]').disabled; },
  async action(name) { const target = controls.get(`[data-video-still="${name}"]`); return this.dialog.fire('click', {target: {closest: () => target}}); },
  select(input = file()) { return controls.get('#video-still-file').fire('change', {target: {files: [input], value: 'C:\\fakepath'}}); },
  deferMetadata(value = true) { autoMetadata = !value; }, deferData(value = true) { autoData = !value; },
  deferFrames(value = true) { holdFrames = value; }, deferEncode(value = true) { holdEncode = value; },
  restore() { picker.close({force: true}); Object.assign(globalThis, originals); URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; },
 };
}

test('creation is lazy; busy/open guards and browser/policy limitations are explicit', async () => {
 let busy = true; const h = harness(undefined, {isBusy: () => busy});
 try {
  assert.equal(h.nodes.length, 0); assert.equal(h.picker.open(), false); assert.equal(h.nodes.length, 0);
  busy = false; assert.equal(h.picker.open(), true); assert.equal(h.picker.open(), false);
  assert.equal(h.picker.hasPendingWork, false); assert.equal(h.captureDisabled, true);
  assert.match(h.dialog.html, /MP4 \/ WebM · max. 8 MiB/);
  assert.doesNotMatch(h.dialog.html, /noch nicht freigegeben/); assert.equal(h.videos.length, 0);
  await h.action('choose'); assert.equal(h.controls.get('#video-still-file').clicked, true);
  h.picker.close(); assert.equal(document.activeElement.id, 'opener'); assert.equal(h.picker.hasPendingWork, false);
 } finally { h.restore(); }
});

test('bounded synthetic source creates a fresh native video only after the read and preflight', async () => {
 const h = harness(); const read = deferred(); const input = file(); input.arrayBuffer = () => read.promise;
 try {
  h.picker.open(); const pending = h.select(input); await flush();
  assert.equal(h.videos.length, 0); assert.equal(h.log.filter(e => e[0] === 'createURL').length, 0);
  read.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); await pending;
  assert.equal(h.videos.length, 1); assert.equal(h.captureDisabled, false);
  assert.equal(h.videos[0].controls, true); assert.equal(h.videos[0].disableRemotePlayback, true);
  assert.equal(h.picker.hasPendingWork, true); assert.equal(h.controls.get('#video-still-file').value, '');
 } finally { h.restore(); }
});

test('wrong types, oversize files, malformed containers and huge dimensions create no Blob URL', async () => {
 const huge = Buffer.from(bytes), sample = huge.indexOf('avc1', huge.indexOf('stsd'));
 huge.writeUInt16BE(16384, sample + 28);
 const h = harness();
 try {
  h.picker.open();
  for (const bad of [new File(['not video'], 'spoof.mp4', {type: 'video/mp4'}), new File([bytes], 'wrong.png', {type: 'image/png'}), new File([huge], 'huge.mp4', {type: 'video/mp4'}), {type: 'video/mp4', size: 8 * 1024 * 1024 + 1, arrayBuffer() { assert.fail('Must not read'); }}]) await h.select(bad);
  assert.equal(h.videos.length, 0); assert.equal(h.log.filter(e => e[0] === 'createURL').length, 0);
  assert.equal(h.captureDisabled, true); assert.equal(h.picker.hasPendingWork, false);
 } finally { h.restore(); }
});

test('capture pauses and draws the settled selected time, handing only a PNG to the image editor', async () => {
 const received = []; const h = harness(async image => { received.push(image); return true; });
 try {
  h.picker.open(); const sourceFile = file(); await h.select(sourceFile);
  h.videos[0].currentTime = 2.5; h.videos[0].paused = false;
  assert.equal(received.length, 0); await h.action('capture');
  assert.equal(received.length, 1); assert.notEqual(received[0], sourceFile);
  assert.ok(received[0] instanceof File); assert.equal(received[0].type, 'image/png'); assert.equal(received[0].name, 'video-standbild.png');
  assert.equal(h.draws.length, 1); assert.equal(h.draws[0].time, 2.5); assert.deepEqual(h.draws[0].args.slice(1), [0, 0, 640, 360]);
  assert.equal(h.canvases[0].encodeType, 'image/png'); assert.equal(h.canvases[0].width, 0); assert.equal(h.canvases[0].height, 0);
  assert.equal(h.dialog.open, false); assert.equal(h.picker.hasPendingWork, false);
 } finally { h.restore(); }
});

for (const outcome of ['false', 'undefined', 'reject']) test(`onImage ${outcome} preserves the paused video and permits explicit retry`, async () => {
 let succeeds = false, calls = 0;
 const h = harness(async () => { calls++; if (succeeds) return true; if (outcome === 'reject') throw Error('Übernahme verweigert'); return outcome === 'false' ? false : undefined; });
 try {
  h.picker.open(); await h.select(); const video = h.videos[0]; video.currentTime = 1.2;
  await h.action('capture'); assert.equal(calls, 1); assert.equal(h.dialog.open, true); assert.equal(h.captureDisabled, false);
  assert.equal(h.videos[0], video); assert.equal(video.currentTime, 1.2); assert.equal(video.paused, true); assert.match(h.status, /übernommen|verweigert/);
  succeeds = true; await h.action('capture'); assert.equal(calls, 2); assert.equal(h.dialog.open, false);
 } finally { h.restore(); }
});

for (const value of [null, undefined, false, 0, '']) for (const mode of ['reject', 'throw']) {
 test(`onImage ${mode} with falsy ${String(value)} aborts its signal and preserves the picker`, async () => {
  let signal;
  const h = harness((_image, options) => { signal = options.signal; if (mode === 'throw') throw value; return Promise.reject(value); });
  try {
   h.picker.open(); await h.select(); await h.action('capture');
   assert.equal(signal.aborted, true); assert.equal(h.dialog.open, true); assert.equal(h.captureDisabled, false);
   assert.match(h.status, /fehlgeschlagen/); assert.equal(h.picker.hasPendingWork, true);
  } finally { h.restore(); }
 });
}

for (const stage of ['read', 'metadata', 'first-frame', 'settle', 'encode']) for (const ending of ['close', 'cancel', 'timeout']) {
 test(`${stage} ${ending}: independently settles, releases resources, and ignores late work after reopen`, async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); let adoptions = 0;
  const h = harness(async () => { adoptions++; return true; }); const held = deferred();
  try {
   h.picker.open(); let pending, late;
   if (stage === 'read') { const input = file(); input.arrayBuffer = () => held.promise; pending = h.select(input); late = () => held.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
   else if (stage === 'metadata' || stage === 'first-frame') {
    if (stage === 'metadata') h.deferMetadata(); else h.deferData();
    pending = h.select(); await flush(); const video = h.videos[0];
    const oldListeners = [...(video.listeners.get(stage === 'metadata' ? 'loadedmetadata' : 'loadeddata') || [])];
    late = () => { video.readyState = 2; for (const fn of oldListeners) fn(); };
   } else {
    await h.select(); if (stage === 'settle') h.deferFrames(); else h.deferEncode();
    pending = h.action('capture'); await flush(); await flush(); await flush();
    late = stage === 'settle' ? () => { for (const fn of h.frames.values()) fn(); } : () => h.canvases[0].finishEncode(png());
   }
   await flush();
   assert.equal(h.dialog['aria-busy'], 'true'); assert.ok(h.dialog.closeButtons.every(button => !button.disabled));
   if (ending === 'timeout') t.mock.timers.tick(timeout);
   else if (ending === 'cancel') await h.dialog.fire('cancel'); else h.picker.close();
   await pending;
   assert.equal(adoptions, 0); assert.equal(h.dialog['aria-busy'], 'false');
   if (ending === 'timeout') { assert.equal(h.dialog.open, true); assert.match(h.status, /rechtzeitig/); h.picker.close(); }
   else assert.equal(h.dialog.open, false);
   for (const canvas of h.canvases) assert.equal(canvas.width, 0);
   h.deferMetadata(false); h.deferData(false); h.deferFrames(false); h.deferEncode(false);
   h.picker.open(); await h.select(file('new.mp4')); const video = h.videos.at(-1), draws = h.draws.length;
   late(); await flush(); t.mock.timers.tick(timeout); await flush();
   assert.equal(h.dialog.open, true); assert.equal(h.videos.at(-1), video); assert.equal(h.captureDisabled, false);
   assert.equal(h.controls.get('#video-still-filename').textContent, 'new.mp4'); assert.equal(adoptions, 0); assert.equal(h.draws.length, draws);
  } finally { h.restore(); }
 });
}

test('read, metadata and first-frame decode receive separate full deadlines', async t => {
 t.mock.timers.enable({apis: ['setTimeout']}); const h = harness(), read = deferred(), input = file(); input.arrayBuffer = () => read.promise;
 try {
  h.picker.open(); h.deferMetadata(); h.deferData(); const pending = h.select(input); await flush();
  t.mock.timers.tick(timeout - 1); read.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); await flush();
  t.mock.timers.tick(timeout - 1); assert.equal(h.dialog['aria-busy'], 'true'); const video = h.videos[0]; video.readyState = 1; await video.fire('loadedmetadata'); await flush();
  t.mock.timers.tick(timeout - 1); assert.equal(h.dialog['aria-busy'], 'true'); video.readyState = 2; await video.fire('loadeddata'); await pending;
  assert.equal(h.captureDisabled, false); t.mock.timers.tick(timeout); assert.equal(h.captureDisabled, false);
 } finally { h.restore(); }
});

test('native seeking has its own deadline and never prevents Close', async t => {
 t.mock.timers.enable({apis: ['setTimeout']}); const h = harness();
 try {
  h.picker.open(); await h.select(); const video = h.videos[0]; video.seeking = true; await video.fire('seeking');
  assert.equal(h.captureDisabled, true); assert.ok(h.dialog.closeButtons.every(button => !button.disabled));
  t.mock.timers.tick(timeout); assert.equal(h.dialog.open, true); assert.match(h.status, /Zeitpunkt.*rechtzeitig/);
  assert.equal(video.src, ''); assert.equal(h.picker.hasPendingWork, false); h.picker.close(); assert.equal(h.dialog.open, false);
 } finally { h.restore(); }
});

test('native seek must finish before the settled frame can be drawn', async () => {
 const h = harness(async () => false);
 try {
  h.picker.open(); await h.select(); const video = h.videos[0]; video.seeking = true; await video.fire('seeking');
  const pending = h.action('capture'); await flush(); await flush(); assert.equal(h.draws.length, 0);
  video.currentTime = 3; video.seeking = false; await video.fire('seeked'); await pending;
  assert.equal(h.draws.length, 1); assert.equal(h.draws[0].time, 3); assert.equal(h.dialog.open, true);
 } finally { h.restore(); }
});

test('only onImage locks ordinary Close; forced close cancels the wait and late success cannot close a new session', async () => {
 const adoption = deferred(); let calls = 0, signal; const h = harness((_image, options) => { calls++; signal = options.signal; return adoption.promise; });
 try {
  h.picker.open(); await h.select(); const pending = h.action('capture'); await flush(); await flush(); await flush();
  assert.equal(calls, 1); assert.ok(h.dialog.closeButtons.every(button => button.disabled)); assert.equal(h.picker.close(), false);
  await h.dialog.fire('cancel'); await h.action('capture'); assert.equal(calls, 1); assert.equal(h.dialog.open, true);
  assert.equal(signal.aborted, false); assert.equal(h.picker.close({force: true}), true); assert.equal(signal.aborted, true); await pending;
  h.picker.open(); await h.select(file('new.mp4')); adoption.resolve(true); await flush();
  assert.equal(h.dialog.open, true); assert.equal(h.captureDisabled, false); assert.equal(h.controls.get('#video-still-filename').textContent, 'new.mp4');
 } finally { h.restore(); }
});

test('adoption deadline unlocks Close without accepting an unconfirmed result', async t => {
 t.mock.timers.enable({apis: ['setTimeout']}); let signal; const adoption = deferred(), h = harness((_image, options) => { signal = options.signal; return adoption.promise; });
 try {
  h.picker.open(); await h.select(); const pending = h.action('capture'); await flush(); await flush(); await flush();
  assert.equal(signal.aborted, false); t.mock.timers.tick(timeout); assert.equal(signal.aborted, true); await pending; assert.equal(h.dialog.open, true); assert.equal(h.captureDisabled, false); assert.match(h.status, /Übernahme.*rechtzeitig/);
  adoption.resolve(true); await flush(); assert.equal(h.dialog.open, true); assert.equal(h.picker.close(), true);
 } finally { h.restore(); }
});

test('source is paused, detached and removed before its Blob URL is revoked; repeated selections use new elements', async () => {
 const h = harness();
 try {
  h.picker.open(); await h.select(file('first.mp4')); const first = h.videos[0]; await h.select(file('second.mp4'));
  assert.equal(h.videos.length, 2); assert.notEqual(h.videos[1], first);
  const revokeIndex = h.log.findIndex(e => e[0] === 'revokeURL'), detachIndex = h.log.findIndex(e => e[0] === 'src' && e[1] === first && e[2] === ''), removeIndex = h.log.findIndex(e => e[0] === 'remove' && e[1] === first);
  assert.ok(detachIndex >= 0 && detachIndex < removeIndex && removeIndex < revokeIndex);
  assert.equal([...first.listeners.values()].reduce((n, list) => n + list.size, 0), 0);
 } finally { h.restore(); }
});

test('enforced exact-URL Blob media CSP violation stops work with a clear error and no retry', async () => {
 let calls = 0; const h = harness(() => { calls++; return true; });
 try {
  h.picker.open(); h.deferMetadata(); const pending = h.select(); await flush();
  await h.doc.fire('securitypolicyviolation', {effectiveDirective: 'media-src', blockedURI: h.videos[0].src, disposition: 'enforce'}); await pending;
  assert.match(h.status, /Sicherheitsrichtlinie.*blockiert/); assert.equal(h.dialog.open, true); assert.equal(h.captureDisabled, true);
  assert.equal(h.log.filter(e => e[0] === 'createURL').length, 1); assert.equal(h.videos[0].src, ''); assert.equal(calls, 0);
 } finally { h.restore(); }
});

test('queued old generic or exact-URL CSP violations cannot mutate a newer selection', async () => {
 const h = harness();
 try {
  h.picker.open(); await h.select(file('old.mp4')); const oldURL = h.videos[0].src;
  const stale = {effectiveDirective: 'media-src', blockedURI: 'blob', disposition: 'enforce'};
  await h.select(file('new.mp4')); const current = h.videos[1], status = h.status;
  await h.doc.fire('securitypolicyviolation', stale);
  await h.doc.fire('securitypolicyviolation', {...stale, blockedURI: oldURL});
  assert.equal(h.status, status); assert.equal(h.captureDisabled, false); assert.equal(h.videos.at(-1), current);
  assert.equal(h.controls.get('#video-still-filename').textContent, 'new.mp4');
 } finally { h.restore(); }
});

test('a generic CSP event is non-mutating, while its current element error still fails closed', async () => {
 const h = harness();
 try {
  h.picker.open(); h.deferMetadata(); const pending = h.select(); await flush(); const current = h.videos[0];
  await h.doc.fire('securitypolicyviolation', {effectiveDirective: 'media-src', blockedURI: 'blob', disposition: 'enforce'});
  assert.equal(current.src, 'blob:still-1'); current.error = {code: 4}; await current.fire('error'); await pending;
  assert.equal(h.captureDisabled, true); assert.match(h.status, /Sicherheitsrichtlinie/); assert.equal(current.src, '');
  assert.equal(h.log.filter(e => e[0] === 'createURL').length, 1);
 } finally { h.restore(); }
});

test('unrelated or report-only CSP events do not invalidate an already decoded source', async () => {
 const h = harness();
 try {
  h.picker.open(); await h.select();
  for (const event of [{effectiveDirective: 'img-src', blockedURI: 'blob', disposition: 'enforce'}, {effectiveDirective: 'media-src', blockedURI: 'blob', disposition: 'report'}, {effectiveDirective: 'media-src', blockedURI: 'blob:other', disposition: 'enforce'}]) await h.doc.fire('securitypolicyviolation', event);
  assert.equal(h.captureDisabled, false);
 } finally { h.restore(); }
});

for (const failure of ['duration', 'dimensions', 'media-error', 'resize']) test(`${failure} validation never permits a derived image`, async () => {
 let calls = 0; const h = harness(() => { calls++; return true; });
 try {
  h.picker.open(); h.deferMetadata(); const pending = h.select(); await flush(); const video = h.videos[0];
  if (failure === 'duration') video.duration = Infinity;
  if (failure === 'dimensions') video.videoWidth = 16384;
  if (failure === 'media-error') { video.error = {code: 4}; await video.fire('error'); }
  else { video.readyState = 2; await video.fire('loadedmetadata'); }
  await pending;
  if (failure === 'resize') { video.videoWidth = 16000; await video.fire('resize'); }
  assert.equal(h.captureDisabled, true); assert.equal(calls, 0); assert.equal(video.src, ''); assert.equal(h.dialog.open, true);
 } finally { h.restore(); }
});

for (const result of ['null', 'empty', 'wrong-type', 'oversize']) test(`invalid ${result} PNG output preserves source and calls no image callback`, async () => {
 let calls = 0; const h = harness(() => { calls++; return true; });
 try {
  h.picker.open(); await h.select(); h.deferEncode(); const pending = h.action('capture'); await flush(); await flush(); await flush();
  const blob = result === 'null' ? null : result === 'empty' ? new Blob([], {type: 'image/png'}) : result === 'wrong-type' ? new Blob(['x'], {type: 'image/jpeg'}) : {type: 'image/png', size: VIDEO_STILL_LIMITS.imageBytes + 1};
  h.canvases[0].finishEncode(blob); await pending; assert.equal(calls, 0); assert.match(h.status, /PNG/); assert.equal(h.dialog.open, true); assert.equal(h.captureDisabled, false); assert.equal(h.canvases[0].width, 0);
 } finally { h.restore(); }
});

test('external busy state appearing during encoding prevents image adoption', async () => {
 let busy = false, calls = 0; const h = harness(() => { calls++; return true; }, {isBusy: () => busy});
 try {
  h.picker.open(); await h.select(); h.deferEncode(); const pending = h.action('capture'); await flush(); await flush(); await flush();
  busy = true; h.canvases[0].finishEncode(png()); await pending; assert.equal(calls, 0); assert.match(h.status, /beschäftigt/); assert.equal(h.dialog.open, true);
 } finally { h.restore(); }
});

test('close restores fallback only once; successful adoption does not steal image-editor focus', async () => {
 let fallback = 0; const h = harness(async () => { document.activeElement = {id: 'image-editor'}; return true; }, {fallbackFocus: () => fallback++});
 try {
  const opener = document.activeElement; h.picker.open(); opener.isConnected = false; h.picker.close(); h.picker.close(); assert.equal(fallback, 1);
  h.picker.open(); await h.select(); await h.action('capture'); assert.equal(document.activeElement.id, 'image-editor'); assert.equal(fallback, 1);
  assert.equal(h.doc.listeners.get('securitypolicyviolation').size, 0);
 } finally { h.restore(); }
});
