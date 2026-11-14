import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceUI } from '../../public/workspace-ui.js';
import {
  wid, clone, payload as legacyPayload, workspace as legacyWorkspace, saved, discarded, closed, error,
  deferred, settle, listing,
} from './workspace-fixtures.mjs';

const payload=(extra={})=>legacyPayload({localMediaOmitted:false,...extra});
const workspace=(extra={})=>legacyWorkspace({payload:payload(),...extra});

// This file gets its own document under Node's normal per-file test isolation.
// Keep real listener identities and previously saved callbacks independently:
// successful deregistration alone must not hide an already queued callback.
function harness(t, behavior = {}) {
  const previousDocument = globalThis.document;
  const effects = [], nodes = [];
  const calls = { list: [], read: [], save: [], discard: [], refresh: [], restore: [] };
  const counts = { capture: 0, canRestore: 0, uuid: 0 };
  let document;

  function node(name, parent = null) {
    const listeners = new Map(), added = [], removed = [], children = new Map();
    const values = { innerHTML: '', textContent: '', disabled: false, hidden: false, open: false };
    const element = {
      name, parent, listeners, added, removed, children,
      dataset: {}, isConnected: true, tagName: 'DIV',
      addEventListener(type, callback, options) {
        added.push({ type, callback, options });
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback, options) {
        removed.push({ type, callback, options });
        listeners.get(type)?.delete(callback);
      },
      contains(other) {
        for (let current = other; current; current = current.parent) {
          if (current === element) return true;
        }
        return false;
      },
      setAttribute(key, value) { effects.push([name, 'setAttribute', key, value]); },
      focus() { effects.push([name, 'focus']); document.activeElement = element; },
      select() { effects.push([name, 'select']); },
      showModal() { effects.push([name, 'showModal']); element.open = true; },
      close() { effects.push([name, 'close']); element.open = false; },
      closest(selector) { return selector === '[data-workspace-action]' && element.dataset.workspaceAction ? element : null; },
      querySelector(selector) {
        if (children.has(selector)) return children.get(selector);
        const action = selector.match(/^\[data-workspace-action="([^"]+)"\]$/)?.[1];
        if (action && values.innerHTML.includes(`data-workspace-action="${action}"`)) {
          const child = node(`${name}:${action}`, element);
          child.dataset.workspaceAction = action;
          children.set(selector, child);
          return child;
        }
        return null;
      },
      querySelectorAll() { return []; },
      async dispatch(type, event = {}) {
        for (const callback of [...(listeners.get(type) || [])]) await callback(event);
      },
    };
    for (const key of Object.keys(values)) Object.defineProperty(element, key, {
      get: () => values[key],
      set(value) {
        values[key] = value;
        if (key === 'innerHTML') children.clear();
        effects.push([name, key, value]);
      },
    });
    nodes.push(element);
    return element;
  }

  document = node('document');
  document.activeElement = null;
  const statusContainer = node('status'), dialog = node('dialog'), openButton = node('open');
  const content = node('content', dialog), title = node('title', dialog), copyArea = node('copy', dialog);
  const notice = node('notice'), returnFocus = node('return-focus');
  const dialogQuery = dialog.querySelector;
  dialog.querySelector = selector => ({
    '[data-workspace-content]': content,
    '#workspace-title': title,
    '#workspace-copy-text': copyArea,
  })[selector] || dialogQuery(selector);
  document.querySelector = selector => selector === '#workspace-global-notice' ? notice : null;
  globalThis.document = document;

  const decision = { supported: true, sameSource: true, requiresCopy: false, reasons: [] };
  const client = {
    async list(options) {
      calls.list.push({ signal: options?.signal });
      return behavior.list ? behavior.list(options) : listing();
    },
    async read(id, options) {
      calls.read.push({ id, signal: options?.signal });
      return behavior.read ? behavior.read(id, options) : workspace({ workspaceId: id, payload:payload({localMediaOmitted:false}) });
    },
    async save(request, options) {
      calls.save.push({ request: clone(request), signal: options?.signal });
      return behavior.save ? behavior.save(request, options) : saved(request);
    },
    async discard(request, options) {
      calls.discard.push({ request: clone(request), signal: options?.signal });
      return behavior.discard ? behavior.discard(request, options) : discarded(request);
    },
  };
  const ui = createWorkspaceUI({
    statusContainer, dialog, openButton, client,
    isCarousel:()=>!!behavior.carousel,
    capture() { counts.capture++; return behavior.capture ? behavior.capture() : payload(); },
    canRestore() { counts.canRestore++; return true; },
    async refreshPlanner(value) {
      calls.refresh.push(clone(value));
      return behavior.refresh ? behavior.refresh(value) : clone(decision);
    },
    applyRestore(...args) { calls.restore.push(clone(args)); behavior.restore?.(...args); },
    uuid: () => `lifecycle-${String(++counts.uuid).padStart(12, '0')}`,
  });
  t.after(() => {
    ui.destroy();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  function event(action, id = wid, parent = dialog) {
    const target = {
      dataset: { workspaceAction: action, workspaceId: id }, disabled: false, parent,
      closest: selector => selector === '[data-workspace-action]' ? target : null,
    };
    return { target, preventDefault() {} };
  }
  function snapshot() {
    return {
      effects: effects.length,
      calls: Object.fromEntries(Object.entries(calls).map(([key, value]) => [key, value.length])),
      counts: { ...counts },
      controller: ui.controller.snapshot,
      dialogOpen: dialog.open,
    };
  }
  return {
    ui, calls, counts, behavior, decision, document, nodes, effects,
    statusContainer, dialog, openButton, content, returnFocus, event, snapshot,
    action: (action, id = wid) => dialog.dispatch('click', event(action, id)),
    async ready() { await ui.init(); ui.open({ refresh: false }); },
    async selected() { await this.ready(); await this.action('select'); },
  };
}

function finish(gate, outcome, value) {
  if (outcome === 'resolve') gate.resolve(value);
  else gate.reject(error());
}

test('live UI still initializes, explicitly restores, saves and discards before teardown', async t => {
  const h = harness(t);
  await h.selected();
  assert.equal(h.calls.list.length, 1);
  assert.equal(h.calls.read.length, 1);
  assert.equal(h.calls.refresh.length, 1);
  assert.match(h.content.innerHTML, /Arbeitsfassung wiederaufnehmen/);
  await h.action('restore-source');
  assert.equal(h.calls.refresh.length, 2);
  assert.equal(h.calls.restore.length, 1);
  assert.deepEqual(h.calls.restore[0][2], { asCopy: false });
  assert.equal(h.ui.controller.snapshot.open, true);
  assert.equal(h.dialog.open, false);
  h.ui.controller.changed(payload({ text: 'explicit local edit' }));
  await h.ui.controller.save();
  assert.equal(h.calls.save.length, 1);
  h.ui.editorClosed();
  h.ui.open({ refresh: false });
  await h.action('discard-confirm');
  await settle();
  assert.equal(h.calls.discard.length, 1);
  assert.ok(h.calls.discard[0].signal instanceof AbortSignal);
  assert.equal(h.calls.discard[0].signal.aborted, false);
  assert.equal(h.calls.list.length, 2);
});

test('destroy removes each exact registered listener once and is idempotent', async t => {
  const h = harness(t);
  await h.ready();
  const registered = h.nodes.flatMap(node => node.added.map(listener => ({ node, ...listener })));
  assert.deepEqual(registered.map(({ node, type }) => [node.name, type]).sort(), [
    ['dialog', 'cancel'], ['dialog', 'click'], ['document', 'visibilitychange'],
    ['open', 'click'], ['status', 'click'],
  ]);
  h.ui.destroy();
  for (const { node, type, callback, options } of registered) {
    assert.equal(node.listeners.get(type)?.size || 0, 0, `${node.name}:${type} still attached`);
    assert.equal(node.removed.filter(item => item.type === type && item.callback === callback && item.options === options).length, 1);
  }
  const after = h.snapshot();
  const removedCount = h.nodes.reduce((n, node) => n + node.removed.length, 0);
  h.ui.destroy();
  assert.deepEqual(h.snapshot(), after);
  assert.equal(h.nodes.reduce((n, node) => n + node.removed.length, 0), removedCount);
});

test('stale API references and saved callbacks are inert after destroy, even if invoked directly', async t => {
  const h = harness(t);
  await h.selected();
  h.ui.editorOpened({ sourcePostId: 'post-1', basePlannerRevision: 7 }, workspace());
  const api = {
    init: h.ui.init, open: h.ui.open, captureChanged: h.ui.captureChanged,
    editorOpened: h.ui.editorOpened, editorClosed: h.ui.editorClosed,
    beforePostSave: h.ui.beforePostSave, afterPostSave: h.ui.afterPostSave,
    retainNewerInput: h.ui.retainNewerInput,
  };
  const savedCallbacks = h.nodes.flatMap(node => node.added.map(listener => ({ node, ...listener })));
  h.document.hidden = true;
  h.ui.destroy();
  const after = h.snapshot();
  await api.init();
  api.open();
  api.captureChanged();
  api.editorOpened({ sourcePostId: 'post-1', basePlannerRevision: 7 }, workspace());
  api.editorClosed();
  api.beforePostSave();
  api.retainNewerInput();
  await api.afterPostSave();
  assert.equal(h.ui.canCloseSafely, false);
  assert.equal(h.ui.hasUnsavedLocalInput, false);
  for (const { node, type, callback } of savedCallbacks) {
    if (type !== 'click' || node === h.openButton) {
      await callback({ preventDefault() {} });
      continue;
    }
    for (const action of [
      'open', 'close', 'refresh', 'select', 'back', 'restore-source', 'restore-copy',
      'copy-server', 'copy-local', 'save', 'resume', 'reconcile', 'read-remote',
      'ask-discard', 'discard-confirm', 'reconcile-discard',
    ]) await callback(h.event(action, wid, node));
  }
  await settle();
  assert.deepEqual(h.snapshot(), after);
});

test('retained newer UI input stays visibly unsaved, copyable, and cannot resume automatic writes', async t => {
  const newer = payload({ text: 'newer <local> input', rawTags: 'unfinished,"new label' });
  const h = harness(t);
  await h.ready();
  assert.equal(h.ui.hasUnsavedLocalInput, false);
  h.ui.editorOpened({ sourcePostId: 'post-1', basePlannerRevision: 7 }, workspace());
  assert.equal(await h.ui.afterPostSave(), true);
  h.behavior.capture = () => clone(newer);
  h.ui.retainNewerInput();
  const s = h.ui.controller.snapshot;
  assert.equal(s.phase, 'local_only');
  assert.equal(s.open, true);
  assert.equal(s.dirty, true);
  assert.equal(s.activeEditor, false);
  assert.equal(s.canWrite, false);
  assert.equal(h.ui.canCloseSafely, false);
  assert.equal(h.ui.hasUnsavedLocalInput, true);
  assert.deepEqual(s.payload, newer);
  assert.match(h.statusContainer.innerHTML, /Neuere Eingabe nicht gesichert/);
  assert.match(h.statusContainer.innerHTML, /data-workspace-action="copy-local"/);
  assert.doesNotMatch(h.statusContainer.innerHTML, /data-workspace-action="(?:save|resume)"/);
  const counts = { uuid: h.counts.uuid, list: h.calls.list.length, save: h.calls.save.length, discard: h.calls.discard.length };
  await h.action('copy-local');
  assert.match(h.content.innerHTML, /newer &lt;local&gt; input/);
  assert.match(h.content.innerHTML, /unfinished/);
  await h.action('resume');
  await h.action('save');
  h.ui.captureChanged();
  await h.ui.afterPostSave();
  await settle();
  assert.deepEqual({ uuid: h.counts.uuid, list: h.calls.list.length, save: h.calls.save.length, discard: h.calls.discard.length }, counts);
  assert.equal(h.ui.controller.snapshot.phase, 'local_only');
});

for (const outcome of ['resolve', 'reject']) {
  test(`pending list ${outcome} after destroy is aborted and cannot render or change controller state`, async t => {
    const gate = deferred(), h = harness(t, { list: () => gate.promise });
    const loading = h.ui.init();
    assert.equal(h.calls.list.length, 1);
    assert.equal(h.calls.list[0].signal.aborted, false);
    h.ui.destroy();
    assert.equal(h.calls.list[0].signal.aborted, true);
    const after = h.snapshot();
    finish(gate, outcome, listing());
    await loading;
    assert.deepEqual(h.snapshot(), after);
  });

  test(`pending select read ${outcome} after destroy cannot start a planner refresh`, async t => {
    const gate = deferred(), h = harness(t, { read: () => gate.promise });
    await h.ready();
    const selecting = h.action('select');
    assert.equal(h.calls.read.length, 1);
    h.ui.destroy();
    assert.equal(h.calls.read[0].signal.aborted, true);
    const after = h.snapshot();
    finish(gate, outcome, workspace());
    await selecting;
    assert.deepEqual(h.snapshot(), after);
    assert.equal(h.calls.refresh.length, 0);
  });

  test(`pending select planner refresh ${outcome} after destroy cannot render a selected workspace`, async t => {
    const gate = deferred(), h = harness(t, { refresh: () => gate.promise });
    await h.ready();
    const selecting = h.action('select');
    await settle();
    assert.equal(h.calls.refresh.length, 1);
    h.ui.destroy();
    const after = h.snapshot();
    finish(gate, outcome, h.decision);
    await selecting;
    assert.deepEqual(h.snapshot(), after);
  });

  test(`pending restore refresh ${outcome} after destroy cannot restore an editor or start writes`, async t => {
    const h = harness(t);
    await h.selected();
    const gate = deferred();
    h.behavior.refresh = () => gate.promise;
    const restoring = h.action('restore-copy');
    await settle();
    assert.equal(h.calls.refresh.length, 2);
    h.ui.destroy();
    const after = h.snapshot();
    finish(gate, outcome, h.decision);
    await restoring;
    assert.deepEqual(h.snapshot(), after);
    assert.equal(h.calls.restore.length, 0);
    assert.equal(h.calls.save.length, 0);
    assert.equal(h.calls.discard.length, 0);
  });
}

for (const outcome of ['receipt', 'conflict', 'uncertain']) {
  test(`pending discard ${outcome} after destroy is aborted without late rendering or automatic list refresh`, async t => {
    const gate = deferred(), h = harness(t, { discard: () => gate.promise });
    await h.ready();
    const discarding = h.action('discard-confirm');
    assert.equal(h.calls.discard.length, 1);
    const call = h.calls.discard[0];
    assert.ok(call.signal instanceof AbortSignal, 'discard must receive its own cancellation signal');
    assert.equal(call.signal.aborted, false);
    h.ui.destroy();
    assert.equal(call.signal.aborted, true);
    const after = h.snapshot();
    if (outcome === 'receipt') gate.resolve(discarded(call.request));
    else gate.reject(outcome === 'conflict' ? error(409, 'WORKSPACE_CONFLICT') : error());
    await discarding;
    await settle();
    assert.deepEqual(h.snapshot(), after);
    assert.equal(h.calls.list.length, 1);
  });
}

for (const outcome of ['active', 'closed']) {
  test(`pending discard readback returns ${outcome} after destroy without updating the UI`, async t => {
    const h = harness(t, { discard: () => { throw error(); } });
    await h.ready();
    await h.action('discard-confirm');
    const gate = deferred();
    h.behavior.read = () => gate.promise;
    const checking = h.action('reconcile-discard');
    assert.equal(h.calls.read.length, 1);
    h.ui.destroy();
    assert.equal(h.calls.read[0].signal.aborted, true);
    const after = h.snapshot();
    if (outcome === 'active') gate.resolve(workspace());
    else gate.reject(error(410, 'WORKSPACE_CLOSED', { closed: closed(h.calls.discard[0].request) }));
    await checking;
    assert.deepEqual(h.snapshot(), after);
    assert.equal(h.calls.discard.length, 1);
  });
}

test('in-flight reconcile action cannot focus a detached status control after destroy', async t => {
  const h = harness(t, { save: () => { throw error(); } });
  await h.ready();
  h.ui.editorOpened({ sourcePostId: 'post-1', basePlannerRevision: 7 });
  h.ui.controller.changed(payload({ text: 'uncertain write' }));
  await h.ui.controller.save();
  const gate = deferred();
  h.behavior.read = () => gate.promise;
  const checking = h.statusContainer.dispatch('click', h.event('reconcile', wid, h.statusContainer));
  assert.equal(h.calls.read.length, 1);
  h.ui.destroy();
  assert.equal(h.calls.read[0].signal.aborted, true);
  const after = h.snapshot();
  gate.resolve(saved(h.calls.save[0].request));
  await checking;
  assert.deepEqual(h.snapshot(), after);
});

test('in-flight read-remote action cannot reopen the dialog from an earlier remote snapshot after destroy', async t => {
  const h = harness(t);
  await h.ready();
  h.ui.editorOpened({ sourcePostId: 'post-1', basePlannerRevision: 7 }, workspace());
  await h.action('read-remote');
  assert.ok(h.ui.controller.snapshot.remote);
  const gate = deferred();
  h.behavior.read = () => gate.promise;
  const reading = h.action('read-remote');
  assert.equal(h.calls.read.length, 2);
  h.ui.destroy();
  assert.equal(h.calls.read[1].signal.aborted, true);
  const after = h.snapshot();
  gate.resolve(workspace({ revision: 2 }));
  await reading;
  assert.deepEqual(h.snapshot(), after);
  assert.equal(h.dialog.open, false);
});


const image=i=>({kind:'planner_image',id:`image-${i}`,alt:`Alt ${i}`,name:`${i}.png`,type:'image/png'});
function carousel(items,extra={}){const {media,localMediaOmitted,...p}=payload();return {...p,schemaVersion:2,mediaItems:items,...extra};}
function carouselWorkspace(items,extra={}){const {resolvedMedia,...w}=workspace();return {...w,payload:carousel(items),resolvedMediaItems:items.map(m=>m.kind==='local_omitted'?null:{id:m.id,url:`/api/planner/media/${m.id}`,alt:m.alt,name:m.name,type:m.type}),...extra};}
test('add, reorder and remove keep the same workspace ID and never retire a checkpoint',async t=>{
 const h=harness(t,{capture:()=>carousel([image(0)])});await h.ui.init();h.ui.editorOpened({},carouselWorkspace([image(0)]));
 for(const items of [[image(0),image(1)],[image(1),image(0)],[image(1)]]){h.behavior.capture=()=>carousel(items);h.ui.captureChanged();await h.ui.controller.save();assert.deepEqual(h.calls.save.at(-1).request.payload.mediaItems,items);}
 assert.equal(new Set(h.calls.save.map(x=>x.request.workspaceId)).size,1);assert.equal(h.calls.save[0].request.workspaceId,wid);assert.equal(h.calls.discard.length,0);assert.equal(h.ui.canCloseSafely,true);
});
for(const index of [0,4,9])test(`confirmed omitted slot ${index} never permits safe close`,async t=>{
 const items=Array.from({length:10},(_,i)=>image(i));items[index]={kind:'local_omitted',alt:'Missing image alt',name:'local.png',type:'image/png'};
 const h=harness(t,{capture:()=>carousel(items)});await h.ui.init();h.ui.editorOpened({});h.behavior.capture=()=>carousel(items,{text:'edited'});h.ui.captureChanged();await h.ui.controller.save();assert.equal(h.ui.controller.snapshot.dirty,false);assert.equal(h.ui.canCloseSafely,false);assert.equal(h.ui.hasUnsavedLocalInput,true);
 await h.action('copy-local');assert.match(h.content.innerHTML,/Ohne lokale Dateien/);assert.match(h.content.innerHTML,/Missing image alt/);assert.equal(h.calls.discard.length,0);
});
test('ten saved images resume together without creating a new workspace',async t=>{
 const w=carouselWorkspace(Array.from({length:10},(_,i)=>image(i)));const h=harness(t,{read:async()=>clone(w)});await h.selected();await h.action('restore-source');assert.equal(h.calls.restore.length,1);assert.equal(h.calls.restore[0][1].mediaItems.length,10);assert.equal(h.calls.read.length,2);assert.equal(h.calls.refresh.length,2);assert.equal(h.ui.controller.snapshot.workspaceId,wid);assert.equal(h.ui.canCloseSafely,true);
});
test('metadata drift on fresh workspace read requires new explicit review before applying',async t=>{
 const w=carouselWorkspace([image(0)]),h=harness(t,{read:async()=>clone(w)});await h.selected();w.resolvedMediaItems[0].name='Changed.png';w.mediaMetadataConflict=true;await h.action('restore-source');assert.equal(h.calls.restore.length,0);assert.match(h.content.innerHTML,/erneut prüfen/);assert.match(h.content.innerHTML,/Changed.png/);assert.match(h.content.innerHTML,/workspace-canonical-alt/);
});
test('workspace revision drift on fresh read cannot overwrite the reviewed checkpoint',async t=>{
 const w=carouselWorkspace([image(0)]),h=harness(t,{read:async()=>clone(w)});await h.selected();w.revision++;w.payload.text='Other session';await h.action('restore-copy');assert.equal(h.calls.restore.length,0);assert.match(h.content.innerHTML,/erneut prüfen/);
});
test('opening and closing another editor while fresh read waits invalidates restore session',async t=>{
 const w=carouselWorkspace([image(0)]),h=harness(t,{read:async()=>clone(w)});await h.selected();const gate=deferred();h.behavior.read=()=>gate.promise;const pending=h.action('restore-copy');h.ui.editorOpened({});h.ui.editorClosed();gate.resolve(clone(w));await pending;assert.equal(h.calls.restore.length,0);
});
test('typing and reordering while save is pending retains same ID and checkpoints newer input next',async t=>{
 const gate=deferred();let submitted;const h=harness(t,{capture:()=>carousel([image(0)]),save:r=>{submitted=r;return gate.promise}});await h.ui.init();h.ui.editorOpened({});h.behavior.capture=()=>carousel([image(0),image(1)]);h.ui.captureChanged();const pending=h.ui.controller.save();h.behavior.capture=()=>carousel([image(1),image(0)],{text:'newer'});h.ui.captureChanged();gate.resolve(saved(submitted));await pending;assert.equal(h.ui.controller.snapshot.dirty,true);assert.equal(h.ui.canCloseSafely,false);h.behavior.save=async r=>saved(r);await h.ui.controller.save();assert.equal(h.calls.save.length,2);assert.equal(h.calls.save[0].request.workspaceId,h.calls.save[1].request.workspaceId);assert.equal(h.calls.save[1].request.payload.text,'newer');assert.equal(h.calls.discard.length,0);
});
test('uncertain carousel save uses exact readback without new workspace or resend',async t=>{
 let submitted;const h=harness(t,{capture:()=>carousel([image(0)]),save:async r=>{submitted=r;throw error()},read:async()=>saved(submitted)});await h.ui.init();h.ui.editorOpened({});h.behavior.capture=()=>carousel([image(0),image(1)]);h.ui.captureChanged();await h.ui.controller.save();assert.equal(h.ui.canCloseSafely,false);await h.ui.controller.save();assert.equal(h.calls.save.length,1);await h.ui.controller.reconcile();assert.equal(h.ui.canCloseSafely,true);assert.equal(h.calls.discard.length,0);
});
test('quota conflict leaves full carousel local without new ID or retry',async t=>{
 const h=harness(t,{capture:()=>carousel([image(0)]),save:async()=>{throw error(409)}});await h.ui.init();h.ui.editorOpened({});const id=h.ui.controller.snapshot.workspaceId;h.behavior.capture=()=>carousel([image(0),image(1)]);h.ui.captureChanged();await h.ui.controller.save();await h.ui.controller.save();assert.equal(h.ui.controller.snapshot.phase,'conflict');assert.equal(h.ui.controller.snapshot.workspaceId,id);assert.equal(h.ui.controller.snapshot.payload.mediaItems.length,2);assert.equal(h.calls.save.length,1);assert.equal(h.calls.discard.length,0);assert.equal(h.ui.canCloseSafely,false);
});


test('capture exceptions invalidate open/change/retained protection and copy failure is visible without stale copy',async t=>{
 const h=harness(t);await h.ui.init();h.ui.editorOpened({});assert.equal(h.ui.canCloseSafely,true);
 h.behavior.capture=()=>{throw Error('private capture failure');};h.ui.captureChanged();assert.equal(h.ui.controller.snapshot.valid,false);assert.equal(h.ui.canCloseSafely,false);assert.equal(h.ui.hasUnsavedLocalInput,true);assert.equal(h.calls.save.length,0);
 await h.action('copy-local');assert.match(h.content.innerHTML,/nicht verlustfrei kopiert/);assert.doesNotMatch(h.content.innerHTML,/private capture failure|Kopierbare Arbeitsfassung/);
 h.ui.retainNewerInput();assert.equal(h.ui.controller.snapshot.localOnly,true);assert.equal(h.ui.controller.snapshot.valid,false);h.ui.editorClosed();h.ui.editorOpened({});assert.equal(h.ui.controller.snapshot.phase,'invalid');assert.equal(h.ui.canCloseSafely,false);
});
