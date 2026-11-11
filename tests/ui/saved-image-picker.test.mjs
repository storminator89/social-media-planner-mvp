import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSavedImagePicker} from '../../public/saved-image-picker.js';

const image = (id = 'media-one', extra = {}) => ({id, url: `/api/planner/media/${id}`, name: `${id}.png`, type: 'image/png', alt: 'Ein Garten', ...extra});
const item = (id = 'media-one', extra = {}) => ({id, media: image(id), sourceTitles: ['Beitrag eins'], usageCount: 1, ...extra});
const available = (...items) => ({available: true, items, hasUnavailableImages: false});
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };

// Native DOM/event doubles exercise the actual module and callback lifecycle.
// They do not claim real top-layer rendering, browser focus trapping, or decode.
function harness({catalog = available(item()), onChoose = async () => true, canOpen, fallbackFocus} = {}) {
 const previous = {document: globalThis.document, fetch: globalThis.fetch};
 const nodes = [], assignedSources = [], nativeCloseEvents = [];
 let current = catalog, busy = false, fallbackCalls = 0;
 class Element {
  constructor(tag) {
   this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
   this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
   this.className = ''; this.id = ''; this.open = false; this.disabled = false; this.hidden = false; this._text = '';
  }
  get isConnected() { return this === doc.body || !!this.parentElement?.isConnected; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children = []; this._text = ''; this.append(...children); }
  remove() { const parent = this.parentElement; if (parent) parent.children = parent.children.filter(node => node !== this); this.parentElement = null; }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_value) { assert.fail('The saved-image picker must use DOM construction and textContent.'); }
  set src(value) { this._src = value; assignedSources.push(value); }
  get src() { return this._src; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
  async fire(name, event = {}) {
   const evt = {target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event};
   for (const fn of this.listeners.get(name) || []) await fn(evt);
   return evt;
  }
  focus() { if (this.isConnected && !this.disabled && !this.hidden) doc.activeElement = this; }
  closest() { for (let node = this; node; node = node.parentElement) if (node.hidden || node.inert || node.tagName === 'DIALOG' && !node.open) return node; return null; }
  showModal() { this.open = true; }
  close() { this.open = false; nativeCloseEvents.push(() => this.fire('close')); }
 }
 const doc = {createElement(tag) { const node = new Element(tag); nodes.push(node); return node; }};
 doc.body = new Element('body');
 const composer = doc.createElement('dialog'); composer.open = true; doc.body.append(composer);
 const opener = doc.createElement('button'); opener.id = 'opener'; composer.append(opener); opener.focus();
 const fallback = doc.createElement('button'); fallback.id = 'fallback'; composer.append(fallback);
 const input = doc.createElement('textarea'); input.value = 'Unveränderter Entwurf'; composer.append(input);
 globalThis.document = doc;
 globalThis.fetch = () => assert.fail('The picker must not fetch media catalogs or arbitrary URLs.');
 const picker = createSavedImagePicker({
  getCatalog: () => { if (typeof current === 'function') return current(); return current; },
  canOpen: canOpen || (() => !busy), onChoose,
  fallbackFocus: fallbackFocus || (() => { fallbackCalls++; return fallback; }),
 });
 const byClass = name => nodes.find(node => node.className.split(' ').includes(name));
 return {
  picker, nodes, assignedSources, doc, opener, fallback, composer, input, nativeCloseEvents,
  set catalog(value) { current = value; }, set busy(value) { busy = value; }, get fallbackCalls() { return fallbackCalls; },
  get dialog() { return nodes.find(node => node.id === 'saved-image-picker'); },
  get apply() { return nodes.find(node => node.dataset.savedImageAction === 'apply'); },
  get cancel() { return nodes.find(node => node.dataset.savedImageAction === 'cancel'); },
  get cards() { return byClass('saved-image-list')?.children || []; },
  get notice() { return byClass('saved-image-notice'); }, get empty() { return byClass('saved-image-empty'); },
  get status() { return byClass('saved-image-status').textContent; },
  choose(index = 0) { return this.cards[index].fire('click'); },
  confirm() { return this.apply.fire('click'); },
  restore() { picker.close({force: true}); Object.assign(globalThis, previous); },
 };
}

test('native dialog opens lazily and selection alone never adopts or changes composer inputs', async () => {
 const chosen = []; const h = harness({onChoose: async (...args) => { chosen.push(args); return true; }});
 try {
  assert.equal(h.dialog, undefined);
  assert.equal(h.picker.open(), true); assert.equal(h.picker.open(), false);
  assert.equal(h.dialog.tagName, 'DIALOG'); assert.equal(h.dialog.parentElement, h.doc.body);
  assert.equal(h.composer.open, true); assert.equal(h.picker.isOpen, true);
  assert.match(h.dialog.textContent, /Bild aus der Planung wählen/); assert.match(h.dialog.textContent, /geladenen Beiträgen/);
  assert.equal(h.doc.activeElement.id, 'saved-image-picker-title');
  assert.equal(h.apply.disabled, true);
  await h.confirm(); await h.choose();
  assert.equal(chosen.length, 0); assert.equal(h.apply.disabled, false);
  assert.equal(h.cards[0].getAttribute('aria-pressed'), 'true');
  assert.match(h.cards[0].textContent, /Ausgewählt/);
  assert.equal(h.input.value, 'Unveränderter Entwurf');
  await h.confirm();
  assert.equal(chosen.length, 1); assert.deepEqual(chosen[0][0], image());
  assert.ok(chosen[0][1].signal instanceof AbortSignal);
  assert.equal(chosen[0][1].signal.aborted, false);
  assert.equal(h.dialog.open, false); assert.equal(h.picker.isOpen, false);
  assert.equal(h.doc.activeElement, h.opener); assert.equal(h.composer.open, true);
 } finally { h.restore(); }
});

test('single-flight Apply blocks double-click and row changes while leaving Cancel enabled', async () => {
 const held = deferred(); const received = [];
 const h = harness({catalog: available(item(), item('media-two')), onChoose: (media, options) => { received.push({media, ...options}); return held.promise; }});
 try {
  h.picker.open(); await h.choose(); const pending = h.confirm();
  assert.equal(received.length, 1); assert.equal(h.dialog.getAttribute('aria-busy'), 'true');
  assert.equal(h.apply.disabled, true); assert.equal(h.cancel.disabled, false); assert.ok(h.cards.every(card => card.disabled));
  await h.confirm(); await h.choose(1);
  assert.equal(received.length, 1); assert.equal(h.cards[0].getAttribute('aria-pressed'), 'true');
  assert.equal(h.cards[1].getAttribute('aria-pressed'), 'false');
  held.resolve(true); await pending;
  assert.equal(h.picker.isOpen, false); assert.equal(received[0].media.id, 'media-one');
 } finally { h.restore(); }
});

for (const ending of ['cancel button', 'Escape', 'close', 'force close', 'native close']) {
 test(`${ending} aborts adoption, preserves input, restores focus, and ignores late results after reopen`, async () => {
  const held = deferred(); let signal, adoptions = 0;
  const h = harness({onChoose: async (_media, options) => { signal = options.signal; await held.promise; if (!signal.aborted) adoptions++; return true; }});
  try {
   h.picker.open(); await h.choose(); const pending = h.confirm();
   if (ending === 'cancel button') await h.cancel.fire('click');
   else if (ending === 'Escape') { const event = await h.dialog.fire('cancel'); assert.equal(event.defaultPrevented, true); }
   else if (ending === 'native close') { h.dialog.open = false; await h.dialog.fire('close'); }
   else h.picker.close({force: ending === 'force close'});
   assert.equal(signal.aborted, true); assert.equal(h.picker.isOpen, false); assert.equal(h.dialog.open, false);
   assert.equal(h.doc.activeElement, h.opener); assert.equal(h.input.value, 'Unveränderter Entwurf');
   h.catalog = available(item('new-media')); assert.equal(h.picker.open(), true);
   await h.choose(); const focus = h.doc.activeElement;
   const status = h.status;
   for (const closeEvent of h.nativeCloseEvents) await closeEvent();
   held.resolve(); await pending;
   assert.equal(adoptions, 0); assert.equal(h.picker.isOpen, true); assert.equal(h.dialog.open, true);
   assert.equal(h.status, status); assert.equal(h.doc.activeElement, focus); assert.equal(h.apply.disabled, false);
   assert.equal(h.cards[0].dataset.savedImageId, 'new-media');
  } finally { h.restore(); }
 });
}

test('a late rejection after reopening cannot erase a new selection or display the old error', async () => {
 const held = deferred(); const h = harness({onChoose: () => held.promise});
 try {
  h.picker.open(); await h.choose(); const pending = h.confirm(); h.picker.close();
  h.picker.open(); await h.choose(); const status = h.status;
  held.reject(Error('Internal old request details')); await pending;
  assert.equal(h.status, status); assert.equal(h.picker.isOpen, true); assert.equal(h.apply.disabled, false);
 } finally { h.restore(); }
});

for (const failure of ['throw', 'reject', 'undefined', 'false']) {
 test(`${failure} retains selection and reports only fixed safe error text, allowing explicit retry`, async () => {
  let succeeds = false, signal;
  const h = harness({onChoose: (_media, options) => {
   signal = options.signal;
   if (succeeds) return true;
   if (failure === 'throw') throw Error('Server path /private/secret and <script>');
   if (failure === 'reject') return Promise.reject('internal details');
   return failure === 'false' ? false : undefined;
  }});
  try {
   h.picker.open(); await h.choose(); await h.confirm();
   assert.equal(h.picker.isOpen, true); assert.equal(h.cards[0].getAttribute('aria-pressed'), 'true');
   assert.equal(h.apply.disabled, false); assert.equal(h.doc.activeElement, h.apply); assert.equal(signal.aborted, true);
   assert.equal(h.status, 'Das Bild konnte nicht übernommen werden. Die bisherige Auswahl bleibt erhalten. Bitte versuche es erneut.');
   assert.doesNotMatch(h.dialog.textContent, /private|internal|script/);
   succeeds = true; await h.confirm(); assert.equal(h.picker.isOpen, false);
  } finally { h.restore(); }
 });
}

test('unavailable, malformed and thrown catalogs are not mislabeled empty', () => {
 for (const catalog of [{available: false, items: []}, {available: true, items: null}, null, () => { throw Error('backend internal'); }]) {
  const h = harness({catalog});
  try {
   assert.equal(h.picker.open(), true); assert.equal(h.cards.length, 0); assert.equal(h.apply.disabled, true);
   assert.equal(h.empty.hidden, false); assert.match(h.empty.textContent, /gerade nicht verfügbar/);
   assert.doesNotMatch(h.empty.textContent, /noch keine/);
  } finally { h.restore(); }
 }
});

test('empty and partial catalogs have distinct honest notices', () => {
 const h = harness({catalog: available()});
 try {
  h.picker.open(); assert.match(h.empty.textContent, /Keine wiederverwendbaren Bilder in den geladenen Beiträgen/); assert.equal(h.notice.hidden, true);
  h.picker.close(); h.catalog = {...available(item()), hasUnavailableImages: true}; h.picker.open();
  assert.equal(h.empty.hidden, true); assert.equal(h.notice.hidden, false); assert.match(h.notice.textContent, /Einige Bilder können nicht verwendet werden/);
  h.picker.close(); h.catalog = {...available(), hasUnavailableImages: true}; h.picker.open();
  assert.equal(h.notice.hidden, false); assert.match(h.empty.textContent, /Keine wiederverwendbaren Bilder/); assert.doesNotMatch(h.empty.textContent, /noch keine gespeicherten/);
 } finally { h.restore(); }
});

test('metadata is literal text, thumbnails noninteractive, and passed references are copied without extra properties', async () => {
 const dangerous = '<img src="https://evil.invalid" onerror="alert(1)"> & <script>bad</script>';
 const media = image('safe', {name: dangerous, alt: dangerous, extra: 'not a media field'});
 const entry = item('safe', {media, sourceTitles: [dangerous, 'Beitrag zwei'], usageCount: 2});
 let chosen;
 const h = harness({catalog: available(entry), onChoose: value => { chosen = value; return true; }});
 try {
  h.picker.open();
  const images = h.nodes.filter(node => node.tagName === 'IMG'); assert.equal(images.length, 1);
  assert.deepEqual(h.assignedSources, ['/api/planner/media/safe']);
  assert.equal(images[0].alt, ''); assert.notEqual(images[0].tabIndex, 0); assert.equal(images[0].draggable, false);
  assert.equal(h.cards[0].type, 'button'); assert.match(h.cards[0].textContent, /In 2 Beiträgen verwendet/);
  assert.ok(h.cards[0].textContent.includes(dangerous)); assert.ok(h.cards[0].textContent.includes('Bildbeschreibung: ' + dangerous));
  await h.choose(); await h.confirm();
  assert.notEqual(chosen, media); assert.equal(chosen.extra, undefined); assert.equal(chosen.name, dangerous); assert.equal(chosen.alt, dangerous);
 } finally { h.restore(); }
});

test('unsafe and inconsistent sources are excluded before any thumbnail URL assignment', () => {
 const badURLs = ['https://example.com/image.png', '//example.com/image.png', 'data:image/png;base64,AAAA', 'blob:image', 'javascript:alert(1)', '/api/planner/media/other', '/api/planner/media/bad?x=1', '/api/planner/media/bad#fragment', '/api/planner/media/../bad'];
 const entries = badURLs.map((url, i) => item('bad-' + i, {media: image('bad-' + i, {url})}));
 entries.push(item('svg', {media: image('svg', {type: 'image/svg+xml'})}), item('inline', {media: image('inline', {dataUrl: 'data:image/png;base64,AAAA'})}), item('mismatch', {media: image('other')}));
 entries.push(item('invalid-title', {sourceTitles: ['text', {}]}), item('invalid-count', {usageCount: NaN}), item('blank-alt', {media: image('blank-alt', {alt: '  '})}));
 const h = harness({catalog: available(...entries, item())});
 try {
  h.picker.open(); assert.equal(h.cards.length, 1); assert.equal(h.notice.hidden, false);
  assert.deepEqual(h.assignedSources, ['/api/planner/media/media-one']);
 } finally { h.restore(); }
});

test('duplicate safe images create one card and conflicting media identities fail closed', () => {
 const h = harness({catalog: available(item(), item())});
 try {
  h.picker.open(); assert.equal(h.cards.length, 1); h.picker.close(); h.assignedSources.length = 0;
  h.catalog = available(item(), item('media-one', {media: image('media-one', {alt: 'Changed description'})}), item('safe-other'));
  h.picker.open(); assert.equal(h.cards.length, 1); assert.equal(h.notice.hidden, false);
  assert.deepEqual(h.assignedSources, ['/api/planner/media/safe-other']);
 } finally { h.restore(); }
});

test('thumbnail failure has a fixed placeholder and never uses an alternate source', async () => {
 const h = harness();
 try {
  h.picker.open(); const preview = h.nodes.find(node => node.tagName === 'IMG'); await preview.fire('error');
  assert.equal(preview.hidden, true); assert.ok(h.dialog.textContent.includes('Vorschau nicht verfügbar'));
  assert.deepEqual(h.assignedSources, ['/api/planner/media/media-one']);
 } finally { h.restore(); }
});

test('busy guards run before opening and applying, not after the callback sets its own busy flag', async () => {
 let calls = 0;
 const h = harness({onChoose: async () => { calls++; h.busy = true; return true; }});
 try {
  h.busy = true; assert.equal(h.picker.open(), false); assert.equal(h.dialog, undefined);
  h.busy = false; h.picker.open(); await h.choose(); h.busy = true; await h.confirm();
  assert.equal(calls, 0); assert.equal(h.picker.isOpen, true); assert.match(h.status, /beschäftigt/);
  h.busy = false; await h.confirm(); assert.equal(calls, 1); assert.equal(h.picker.isOpen, false);
 } finally { h.restore(); }
});

test('a throwing canOpen guard fails closed', () => {
 const h = harness({canOpen: () => { throw Error('busy state missing'); }});
 try { assert.equal(h.picker.open(), false); assert.equal(h.dialog, undefined); } finally { h.restore(); }
});

for (const change of ['removed', 'replaced', 'unavailable', 'in-place mutation']) {
 test(`fresh ${change} catalog is revalidated before onChoose`, async () => {
  const original = item(); let calls = 0;
  const h = harness({catalog: available(original), onChoose: async () => { calls++; return true; }});
  try {
   h.picker.open(); await h.choose();
   if (change === 'removed') h.catalog = available();
   if (change === 'replaced') h.catalog = available(item('media-one', {media: image('media-one', {alt: 'New alt'})}));
   if (change === 'unavailable') h.catalog = {available: false};
   if (change === 'in-place mutation') original.media.alt = 'Mutation after open';
   await h.confirm(); assert.equal(calls, 0); assert.equal(h.picker.isOpen, true);
   assert.match(h.status, /nicht mehr unverändert verfügbar|gerade nicht verfügbar/);
   assert.equal(h.cards[0].getAttribute('aria-pressed'), 'true');
  } finally { h.restore(); }
 });
}

for (const state of ['removed', 'disabled', 'hidden', 'closed composer']) {
 test(`focus falls back when the opener is ${state}`, async () => {
  const h = harness();
  try {
   h.picker.open();
   if (state === 'removed') h.opener.remove();
   if (state === 'disabled') h.opener.disabled = true;
   if (state === 'hidden') h.opener.hidden = true;
   if (state === 'closed composer') { h.composer.open = false; h.doc.body.append(h.fallback); }
   await h.cancel.fire('click'); assert.equal(h.fallbackCalls, 1); assert.equal(h.doc.activeElement, h.fallback);
  } finally { h.restore(); }
 });
}

test('old detached card handlers cannot select a row in a reopened dialog', async () => {
 const h = harness();
 try {
  h.picker.open(); const oldCard = h.cards[0]; h.picker.close(); h.catalog = available(item('new')); h.picker.open();
  await oldCard.fire('click'); assert.equal(h.apply.disabled, true); assert.equal(h.cards[0].getAttribute('aria-pressed'), 'false');
 } finally { h.restore(); }
});

test('picker styles include visible focus, narrow layout, and short-viewport scrolling', () => {
 const css = readFileSync(new URL('../../public/saved-image-picker.css', import.meta.url), 'utf8');
 assert.match(css, /:focus-visible/); assert.match(css, /@media\(max-width:500px\)/);
 assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/); assert.match(css, /grid-template-columns:1fr/);
 assert.match(css, /@media\(max-height:480px\)/); assert.match(css, /::backdrop/);
});

test('valid long stored descriptions survive display and explicit adoption exactly', async () => {
 const alt = 'Beschreibung mit Umlauten äöü. '.repeat(60); assert.ok(alt.length > 500 && alt.length <= 2000);
 let chosen;
 const h = harness({catalog: available(item('long-alt', {media: image('long-alt', {alt})})), onChoose: media => { chosen = media; return true; }});
 try {
  h.picker.open(); assert.equal(h.cards.length, 1); assert.ok(h.cards[0].textContent.includes(alt));
  await h.choose(); await h.confirm(); assert.equal(chosen.alt, alt);
 } finally { h.restore(); }
});

test('Cancel without applying preserves composition and returns focus without invoking onChoose', async () => {
 let called = false;
 const h = harness({onChoose: () => { called = true; return true; }});
 try {
  h.picker.open(); await h.choose(); await h.cancel.fire('click');
  assert.equal(called, false); assert.equal(h.doc.activeElement, h.opener); assert.equal(h.input.value, 'Unveränderter Entwurf');
  assert.equal(h.picker.close(), true); assert.equal(h.picker.isOpen, false);
 } finally { h.restore(); }
});

test('a detached Apply callback from a canceled generation cannot close a new active adoption', async () => {
 const first = deferred(), second = deferred(); let calls = 0, signals = [];
 const h = harness({onChoose: (_media, {signal}) => { signals.push(signal); calls++; return calls === 1 ? first.promise : second.promise; }});
 try {
  h.picker.open(); await h.choose(); const old = h.confirm(); h.picker.close();
  h.picker.open(); await h.choose(); const current = h.confirm();
  first.resolve(true); await old;
  assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false); assert.equal(h.picker.isOpen, true);
  assert.equal(h.dialog.getAttribute('aria-busy'), 'true'); assert.equal(h.apply.disabled, true);
  second.resolve(true); await current; assert.equal(h.picker.isOpen, false);
 } finally { h.restore(); }
});


test('shared image cards bound source-title display while keeping the full usage count',()=>{
 const h=harness({catalog:available(item('shared',{sourceTitles:['First','Second','Third hidden title'],usageCount:100}))});
 try{h.picker.open();assert.ok(h.cards[0].textContent.includes('First · Second · …'));assert.ok(h.cards[0].textContent.includes('In 100 Beiträgen'));assert.ok(!h.cards[0].textContent.includes('Third hidden title'));}finally{h.restore()}
});

// Structural guard only; actual whole-image fitting is checked in the native browser.
test('thumbnail uses a fixed-height flex box instead of an intrinsic grid track',()=>{
 const css=readFileSync(new URL('../../public/saved-image-picker.css',import.meta.url),'utf8');
 assert.match(css,/\.saved-image-thumbnail\{display:flex;align-items:center;justify-content:center;[^}]*height:132px/);
 assert.match(css,/\.saved-image-thumbnail img\{[^}]*min-width:0;min-height:0;[^}]*object-fit:contain/);
});

test('append toggles in first-selected order, reselection appends, and limit leaves deselection enabled',async()=>{
 const chosen=[];const h=harness({catalog:available(item('a'),item('b'),item('c')),onChoose:async value=>{chosen.push(value);return true}});
 try{h.picker.open({intent:'add',remaining:2});await h.choose(1);await h.choose(0);assert.equal(h.apply.textContent,'2 Bilder übernehmen');assert.equal(h.cards[2].disabled,true);assert.equal(h.cards[1].disabled,false);assert.equal(h.cards[1].children[1].children.at(-1).textContent,'1');await h.choose(1);await h.choose(2);await h.choose(0);await h.choose(1);await h.confirm();assert.deepEqual(chosen[0].map(x=>x.id),['c','b']);}finally{h.restore()}
});
test('replacement retains exactly one selection and zero capacity cannot select',async()=>{
 for(const remaining of [0,10]){const chosen=[];const h=harness({catalog:available(item('a'),item('b')),onChoose:async value=>{chosen.push(value);return true}});try{h.picker.open({intent:'replace',remaining});await h.choose(0);await h.choose(1);await h.choose(1);await h.confirm();assert.equal(chosen[0].id,'b');assert.equal(Array.isArray(chosen[0]),false);}finally{h.restore()}}
 const h=harness();try{h.picker.open({intent:'add',remaining:0});await h.choose();assert.equal(h.apply.disabled,true);assert.equal(h.cards[0].disabled,true);}finally{h.restore()}
});
test('invalid middle selection rejects entire batch before callback',async()=>{
 let calls=0;const h=harness({catalog:available(item('a'),item('b'),item('c')),onChoose:async()=>{calls++;return true}});try{h.picker.open({intent:'add',remaining:10});for(let i=0;i<3;i++)await h.choose(i);h.catalog=available(item('a'),item('c'));await h.confirm();assert.equal(calls,0);assert.equal(h.picker.isOpen,true);}finally{h.restore()}
});
