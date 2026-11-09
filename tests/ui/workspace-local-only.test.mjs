import {createEditorTiming} from '../../public/editor-timing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createWorkspaceController } from '../../public/workspace-controller.js';
import { renderWorkspaceStatus } from '../../public/workspace-ui.js';
import { clone, payload, workspace, saved, discarded, closed, error, deferred, timers, settle } from './workspace-fixtures.mjs';

function harness(t, behavior = {}) {
  const clock = timers(), calls = { save: [], discard: [], read: [] }, changes = [];
  let uuidCount = 0;
  const controller = createWorkspaceController({
    uuid: () => `local-only-${String(++uuidCount).padStart(12, '0')}`,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    onChange: snapshot => changes.push(snapshot),
    client: {
      async save(request, options) {
        calls.save.push({ request: clone(request), signal: options.signal });
        return behavior.save ? behavior.save(request, options) : saved(request);
      },
      async discard(request, options) {
        calls.discard.push({ request: clone(request), signal: options.signal });
        return behavior.discard ? behavior.discard(request, options) : discarded(request);
      },
      async read(id, options) {
        calls.read.push({ id, signal: options.signal });
        return behavior.read ? behavior.read(id, options) : workspace();
      },
    },
  });
  t.after(() => controller.destroy());
  return {
    controller, clock, calls, changes, behavior,
    get uuidCount() { return uuidCount; },
    open(restored = workspace()) {
      controller.open({ sourcePostId: 'post-1', basePlannerRevision: 7, payload: payload() }, restored);
    },
  };
}

function assertLocalOnly(controller, newer) {
  const state = controller.snapshot;
  assert.equal(state.phase, 'local_only');
  assert.equal(state.open, true);
  assert.equal(state.activeEditor, false);
  assert.equal(state.dirty, true);
  assert.equal(state.canWrite, false);
  assert.equal(controller.canCloseSafely, false);
  assert.deepEqual(state.payload, newer);
  const html = renderWorkspaceStatus(state, { available: true });
  assert.match(html, /Neuere Eingabe nicht gesichert/);
  assert.match(html, /kopiere|Kopiere/);
  assert.match(html, /data-workspace-action="copy-local"/);
  assert.doesNotMatch(html, /data-workspace-action="(?:resume|save)"/);
}

for (const hasWorkspace of [false, true]) {
  test(`retaining newer input after completion ${hasWorkspace ? 'with' : 'without'} a saved workspace never creates another identity or write`, async t => {
    const h = harness(t); h.open(hasWorkspace ? workspace() : null);
    const id = h.controller.snapshot.workspaceId;
    assert.equal(await h.controller.completed(), true);
    const uuidCount = h.uuidCount, discardCount = h.calls.discard.length;
    const newer = payload({ text: 'late edit after saved post' });
    h.controller.retainUnsavedInput(newer);
    assertLocalOnly(h.controller, newer);
    assert.equal(h.controller.snapshot.workspaceId, id);
    h.controller.resume(); h.controller.pause();
    h.controller.changed(payload({ text: 'must not restart automatic workspace saves' }));
    await h.controller.save(); await h.controller.completed(); await h.clock.fire();
    assertLocalOnly(h.controller, newer);
    assert.equal(h.uuidCount, uuidCount);
    assert.equal(h.calls.save.length, 0);
    assert.equal(h.calls.discard.length, discardCount);
    assert.equal(h.clock.size, 0);
  });
}

test('retained input cancels a scheduled autosave and invalid input never becomes safely saved', async t => {
  const h = harness(t); h.open();
  h.controller.changed(payload({ text: 'scheduled old input' }));
  assert.equal(h.clock.size, 1);
  h.controller.retainUnsavedInput(payload({ text: 'x'.repeat(20001) }));
  assert.equal(h.controller.snapshot.valid, false);
  assert.equal(h.controller.snapshot.phase, 'local_only');
  assert.equal(h.controller.snapshot.dirty, true);
  assert.equal(h.controller.snapshot.activeEditor, false);
  assert.equal(h.controller.canCloseSafely, false);
  assert.equal(h.clock.size, 0);
  h.controller.resume(); await h.clock.fire(); await h.controller.save();
  assert.equal(h.calls.save.length, 0);
  assert.equal(h.uuidCount, 0);
});

test('retaining newer input preserves an uncertain save identity and exact readback cannot enable autosave', async t => {
  const gate = deferred(), h = harness(t, { save: () => gate.promise }); h.open();
  h.controller.changed(payload({ text: 'older submitted input' }));
  const saving = h.controller.save(), sent = h.calls.save[0];
  const newer = payload({ text: 'newer input only in editor' });
  h.controller.retainUnsavedInput(newer);
  assert.equal(sent.signal.aborted, true);
  assert.equal(h.controller.snapshot.phase, 'uncertain');
  assert.equal(h.controller.snapshot.pendingWrite, true);
  assert.deepEqual(h.controller.snapshot.payload, newer);
  const before = h.controller.snapshot;
  gate.resolve(saved(sent.request)); await saving;
  assert.deepEqual(h.controller.snapshot, before);
  h.behavior.read = () => saved(sent.request);
  await h.controller.reconcile();
  assertLocalOnly(h.controller, newer);
  assert.equal(h.controller.snapshot.pendingWrite, false);
  h.controller.resume(); await h.clock.fire(); await h.controller.save();
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.calls.discard.length, 0);
  assert.equal(h.uuidCount, 1);
});

test('exact uncertain discard readback cannot erase the warning or dirty state of newer retained input', async t => {
  const h = harness(t, { discard: () => { throw error(); } }); h.open();
  assert.equal(await h.controller.completed(), false);
  const newer = payload({ text: 'late input while separate cleanup was uncertain' });
  h.controller.retainUnsavedInput(newer);
  assert.equal(h.controller.snapshot.pendingWrite, true);
  assert.equal(h.controller.snapshot.phase, 'uncertain');
  h.behavior.read = () => { throw error(410, 'WORKSPACE_CLOSED', { closed: closed(h.calls.discard[0].request) }); };
  await h.controller.reconcile();
  assertLocalOnly(h.controller, newer);
  assert.equal(h.controller.snapshot.pendingWrite, false);
  h.controller.resume(); await h.controller.save(); await h.controller.completed(); await h.clock.fire();
  assert.equal(h.calls.save.length, 0);
  assert.equal(h.calls.discard.length, 1);
  assert.equal(h.uuidCount, 1);
});

test('retainUnsavedInput is inert after controller destruction', t => {
  const h = harness(t); h.open(); h.controller.destroy();
  const before = h.controller.snapshot, changes = h.changes.length;
  h.controller.retainUnsavedInput(payload({ text: 'must be ignored after destruction' }));
  assert.deepEqual(h.controller.snapshot, before);
  assert.equal(h.changes.length, changes);
  assert.equal(h.clock.size, 0);
  assert.equal(h.uuidCount, 0);
});

function actualAppFunction(name) {
  const source = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} exists in the application`);
  const end = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, end < 0 ? undefined : start + end + 1);
}

function appHarness(t, behavior) {
  const h = harness(t, behavior); h.open();
  let current = payload({ text: 'submitted text' }), closes = 0, retainCalls = 0;
  const persisted = [], notices = [], warnings = [], busy = [];
  const fields = {
    '#post-tags': { value: '' }, '#post-zone': { value: 'Europe/Berlin' },
    '#post-date': { value: '' }, '#post-time': { value: '' }, '#search': { value: '' },
    '#form-errors': { hidden: true, textContent: '', innerHTML: '' },
  };
  const workspaceUI = {
    beforePostSave: () => h.controller.pause(),
    afterPostSave: () => h.controller.completed(),
    retainNewerInput() { retainCalls++; h.controller.retainUnsavedInput(current); },
    get canCloseSafely() { return h.controller.canCloseSafely; },
    get hasUnsavedLocalInput() { return h.controller.snapshot.localOnly === true; },
  };
  const context = vm.createContext({
    composerTiming:createEditorTiming(),saving: false, mediaLoading: false, composerMissingMedia: false,
    state: { posts: [{ id: 'post-1', status: 'draft', text: 'old stored post', createdAt: '2026-01-01' }] },
    editingId: 'post-1', initialEditor: '{}', composerLabelState: { title: '', tags: [], baseline: '' },
    composerBaseText: current.text, composerVariantTexts: {}, composerMedia: null, composerCover: null,
    composerIdeaFingerprint: null, view: 'drafts', workspaceUI,
    $: selector => fields[selector], $$: () => [{ value: 'linkedin' }],
    editedPostLabels: () => [], currentComposerRawTags: () => '', selectedVariantTexts: () => ({}),
    validatePost: () => [], editorSnapshot: () => JSON.stringify(current),
    setComposerBusy: value => busy.push(value),
    async persist(next) {
      persisted.push(clone(next));
      const success = behavior.persist ? await behavior.persist(next) : true;
      if (success) context.state = next;
      return success;
    },
    notify: message => notices.push(message), render() {},
    closeComposer() { closes++; h.controller.close(); },
    showInfo: (...args) => warnings.push(args), restoreDeletedPost() {},
  });
  for (const name of ['savePost', 'deletePost', 'askDiscard']) vm.runInContext(actualAppFunction(name), context);
  return {
    ...h, context, persisted, notices, warnings, busy,
    get closes() { return closes; }, get retainCalls() { return retainCalls; },
    changeInput(newer) { current = clone(newer); context.composerBaseText = newer.text; },
  };
}

test('actual delete close warning survives a late edit that exactly matches the original editor snapshot', async t => {
  const gate = deferred(), h = appHarness(t, { discard: () => gate.promise });
  const originalInput = payload({ text: 'original editor before later submitted changes' });
  h.context.initialEditor = JSON.stringify(originalInput);
  const deleting = h.context.deletePost();
  await settle();
  assert.equal(h.calls.discard.length, 1);
  h.changeInput(originalInput);
  gate.resolve(discarded(h.calls.discard[0].request));
  await deleting;
  assert.equal(h.context.editorSnapshot(), h.context.initialEditor);
  assert.equal(h.context.state.posts.length, 0);
  assert.equal(h.context.editingId, null);
  assert.equal(h.context.workspaceUI.hasUnsavedLocalInput, true);
  assertLocalOnly(h.controller, originalInput);
  h.context.askDiscard();
  assert.equal(h.closes, 0);
  assert.equal(h.warnings.length, 1);
  assert.equal(h.warnings[0][0], 'Änderungen verwerfen?');
  assert.equal(h.calls.save.length, 0);
  assert.equal(h.calls.discard.length, 1);
  assert.equal(h.persisted.length, 1);
});

for (const operation of ['savePost', 'deletePost']) {
  for (const phase of ['persist', 'cleanup']) {
    test(`actual ${operation} retains late input during ${phase}, warns before closing, and does not write it automatically`, async t => {
      const gate = deferred();
      const h = appHarness(t, phase === 'persist' ? { persist: () => gate.promise } : { discard: () => gate.promise });
      const pending = operation === 'savePost' ? h.context.savePost('draft') : h.context.deletePost();
      await settle();
      assert.equal(h.context.saving, true);
      assert.equal(h.persisted.length, 1);
      assert.equal(h.calls.discard.length, phase === 'cleanup' ? 1 : 0);
      const newer = payload({ text: `new local edit during ${operation}/${phase}`, rawTags: 'unfinished,"raw' });
      h.changeInput(newer);
      gate.resolve(phase === 'persist' ? true : discarded(h.calls.discard[0].request));
      await pending;
      assert.equal(h.closes, 0);
      assert.equal(h.retainCalls, 1);
      assert.equal(h.context.saving, false);
      assert.equal(h.busy.at(-1), false);
      assertLocalOnly(h.controller, newer);
      if (operation === 'savePost') {
        assert.equal(h.context.editingId, 'post-1');
        assert.equal(h.context.state.posts.length, 1);
        assert.equal(h.context.state.posts[0].text, 'submitted text');
        assert.equal(h.calls.discard.length, phase === 'cleanup' ? 1 : 0);
      } else {
        assert.equal(h.context.editingId, null);
        assert.equal(h.context.composerIdeaFingerprint, null);
        assert.equal(h.context.state.posts.length, 0);
        assert.equal(h.calls.discard.length, 1);
      }
      h.context.askDiscard();
      assert.equal(h.closes, 0);
      assert.equal(h.warnings.length, 1);
      assert.equal(h.warnings[0][0], 'Änderungen verwerfen?');
      assert.match(h.warnings[0][1], /gehen beim Schließen verloren/);
      h.controller.resume(); await h.controller.save(); await h.controller.completed(); await h.clock.fire();
      assert.equal(h.calls.save.length, 0);
      assert.equal(h.persisted.length, 1);
      assertLocalOnly(h.controller, newer);
    });
  }
}

test('actual beforeunload warns for local-only input equal to the old editor baseline, without warning after deliberate close',()=>{
 const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
 const start=source.indexOf("window.addEventListener('beforeunload'");assert.ok(start>=0);
 const code=source.slice(start,source.indexOf('\n',start));
 for(const [open,localOnly,current,ideaOpen,ideaCurrent,warn] of [[true,true,'same',false,'idea',true],[true,false,'same',false,'idea',false],[false,true,'same',false,'idea',false],[true,false,'changed',false,'idea',true],[false,false,'same',true,'changed idea',true]]){
  let listener,prevented=0;
  const context=vm.createContext({imageStudio:{hasPendingWork:false},postingTimesUI:null,window:{addEventListener:(name,fn)=>{assert.equal(name,'beforeunload');listener=fn;}},$:id=>({open:id==='#composer'?open:ideaOpen}),workspaceUI:{hasUnsavedLocalInput:localOnly},initialEditor:'same',editorSnapshot:()=>current,initialIdeaEditor:'idea',ideaEditorSnapshot:()=>ideaCurrent});
  vm.runInContext(code,context);const event={preventDefault:()=>prevented++};listener(event);assert.equal(prevented,warn?1:0);assert.equal(event.returnValue,warn?'':undefined);
 }
});
