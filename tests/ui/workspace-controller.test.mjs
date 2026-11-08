import {createEditorTiming} from '../../public/editor-timing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createWorkspaceController } from '../../public/workspace-controller.js';
import { createWorkspaceClient } from '../../public/workspace-client.js';
import { createWorkspaceUI, renderWorkspaceStatus } from '../../public/workspace-ui.js';
import {
  wid, clone, payload, workspace, saved, discarded, closed, error,
  deferred, timers, settle, jsonResponse, listing,
} from './workspace-fixtures.mjs';

function harness(t, behavior = {}) {
  const clock = timers();
  const calls = { save: [], read: [], discard: [] };
  const changes = [];
  let sequence = 0;
  const client = {
    async save(request, options) {
      calls.save.push({ request: clone(request), signal: options.signal });
      return behavior.save ? behavior.save(request, options) : saved(request);
    },
    async read(workspaceId, options) {
      calls.read.push({ workspaceId, signal: options.signal });
      return behavior.read ? behavior.read(workspaceId, options) : workspace({ workspaceId });
    },
    async discard(request, options) {
      calls.discard.push({ request: clone(request), signal: options.signal });
      return behavior.discard ? behavior.discard(request, options) : discarded(request);
    },
  };
  const controller = createWorkspaceController({
    client,
    uuid: () => `generated-${String(++sequence).padStart(12, '0')}`,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    delay: 123,
    onChange: value => changes.push(value),
  });
  t.after(() => controller.destroy());
  return {
    controller, clock, calls, changes, behavior,
    get uuidCount() { return sequence; },
    open(p = payload(), restored = null) {
      return controller.open({
        sourcePostId: restored ? restored.sourcePostId : 'post-1',
        basePlannerRevision: restored ? restored.basePlannerRevision : 7,
        payload: p,
      }, restored);
    },
  };
}

const edited = text => payload({ text });

test('opening is read/write free, allocates known ID once and snapshots source plus raw content', t => {
  const h = harness(t);
  const p = payload();
  assert.equal(h.open(p), true);
  assert.equal(h.controller.snapshot.phase, 'saved');
  assert.equal(h.controller.snapshot.dirty, false);
  assert.equal(h.controller.canCloseSafely, true);
  assert.equal(h.controller.snapshot.workspaceId, 'generated-000000000001');
  assert.equal(h.uuidCount, 1);
  assert.deepEqual(h.calls, { save: [], read: [], discard: [] });
  assert.equal(h.clock.size, 0);
  p.rawTags = 'mutated outside'; p.tags.length = 0;
  assert.deepEqual(h.controller.snapshot.payload, payload());
  const snapshot = h.controller.snapshot; snapshot.payload.text = 'mutated snapshot';
  assert.equal(h.controller.snapshot.payload.text, payload().text);
  assert.equal(h.controller.snapshot.sourcePostId, 'post-1');
  assert.equal(h.controller.snapshot.basePlannerRevision, 7);
});

test('opening invalid existing metadata keeps the editor visibly dirty without throwing, then an explicit correction can save', async t => {
  const h = harness(t);
  const original = payload({ tags: ['legacy lone surrogate \ud800'] });
  const before = clone(original);
  assert.doesNotThrow(() => assert.equal(h.open(original), false));
  const invalid = h.controller.snapshot;
  assert.equal(invalid.open, true); assert.equal(invalid.activeEditor, true);
  assert.equal(invalid.valid, false); assert.equal(invalid.phase, 'invalid');
  assert.equal(invalid.dirty, true); assert.equal(invalid.canWrite, false);
  assert.equal(invalid.pendingWrite, false); assert.equal(h.controller.canCloseSafely, false);
  assert.equal(invalid.workspace, null); assert.equal(invalid.confirmedPayload, null);
  assert.equal(h.changes.at(-1).phase, 'invalid');
  assert.equal(invalid.sourcePostId, 'post-1'); assert.equal(invalid.basePlannerRevision, 7);
  const html = renderWorkspaceStatus(invalid, { available: true });
  assert.match(html, /Eingabe noch nicht sicherbar/);
  assert.match(html, /bisher wurde nichts gesichert/);
  assert.doesNotMatch(html, /<strong>Arbeitsfassung gesichert<\/strong>/);
  assert.equal(h.clock.size, 0);
  await h.controller.save(); await h.clock.fire();
  assert.deepEqual(h.calls, { save: [], read: [], discard: [] });
  assert.deepEqual(original, before);

  const corrected = payload({ tags: ['explicitly corrected label'] });
  h.controller.changed(corrected);
  assert.equal(h.controller.snapshot.valid, true);
  assert.equal(h.controller.snapshot.phase, 'dirty');
  assert.equal(h.controller.canCloseSafely, false);
  await h.controller.save();
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.calls.save[0].request.workspaceId, invalid.workspaceId);
  assert.equal(h.calls.save[0].request.expectedRevision, 0);
  assert.equal(h.calls.save[0].request.sourcePostId, 'post-1');
  assert.equal(h.calls.save[0].request.basePlannerRevision, 7);
  assert.deepEqual(h.calls.save[0].request.payload, corrected);
  assert.equal(h.controller.snapshot.phase, 'saved');
  assert.equal(h.controller.snapshot.dirty, false);
  assert.equal(h.controller.canCloseSafely, true);
});

test('debounce has one pending timer, restoring original input cancels it, closing never creates a copy', async t => {
  const h = harness(t); h.open();
  h.controller.changed(edited('one')); h.controller.changed(edited('two'));
  assert.equal(h.clock.size, 1); assert.deepEqual(h.clock.delays, [123]);
  h.controller.changed(payload());
  assert.equal(h.controller.snapshot.dirty, false); assert.equal(h.clock.size, 0);
  await h.clock.fire(); assert.equal(h.calls.save.length, 0);
  h.controller.changed(edited('unsaved')); h.controller.close();
  await h.clock.fire();
  assert.equal(h.calls.save.length, 0); assert.equal(h.calls.discard.length, 0);
  assert.equal(h.controller.snapshot.open, false); assert.equal(h.clock.size, 0);
});

test('new save uses CAS revision zero, later intent uses confirmed revision and a fresh write ID', async t => {
  const h = harness(t); h.open();
  const knownId = h.controller.snapshot.workspaceId;
  h.controller.changed(edited('first')); await h.clock.fire();
  assert.equal(h.controller.snapshot.phase, 'saved'); assert.equal(h.controller.snapshot.workspace.revision, 1);
  h.controller.changed(edited('second')); await h.controller.save();
  const [first, second] = h.calls.save.map(c => c.request);
  assert.equal(first.workspaceId, knownId); assert.equal(second.workspaceId, knownId);
  assert.equal(first.expectedRevision, 0); assert.equal(second.expectedRevision, 1);
  assert.notEqual(first.writeId, second.writeId); assert.notEqual(first.writeId, knownId);
  assert.equal(first.sourcePostId, 'post-1'); assert.equal(second.sourcePostId, 'post-1');
  assert.equal(first.basePlannerRevision, 7); assert.equal(second.basePlannerRevision, 7);
  assert.equal(h.uuidCount, 3); assert.equal(h.controller.snapshot.workspace.revision, 2);
  assert.equal(h.controller.canCloseSafely, true);
  assert.equal(h.calls.discard.length, 0);
});

test('resume uses the loaded workspace revision and immutable origin, not fresh planner observations', async t => {
  const h = harness(t);
  const restored = workspace({ revision: 5, currentPlannerRevision: 99, sourceExists: false });
  h.open(restored.payload, restored);
  assert.equal(h.uuidCount, 0);
  h.controller.changed(edited('after explicit resume')); await h.controller.save();
  const request = h.calls.save[0].request;
  assert.equal(request.workspaceId, wid); assert.equal(request.expectedRevision, 5);
  assert.equal(request.sourcePostId, 'post-1'); assert.equal(request.basePlannerRevision, 7);
  assert.equal(h.uuidCount, 1);
});

test('new edits during a pending save remain dirty and receive a separate later CAS intent', async t => {
  const gate = deferred();
  const h = harness(t, { save: () => gate.promise }); h.open();
  h.controller.changed(edited('submitted')); const first = h.controller.save();
  assert.equal(h.controller.snapshot.phase, 'saving'); assert.equal(h.controller.snapshot.pendingWrite, true);
  assert.equal(h.controller.canCloseSafely, false);
  const request = h.calls.save[0].request;
  h.controller.changed(edited('newer local input'));
  await h.controller.save(); await h.clock.fire();
  assert.equal(h.calls.save.length, 1); assert.equal(request.payload.text, 'submitted');
  assert.equal(h.controller.snapshot.payload.text, 'newer local input');
  gate.resolve(saved(request)); await first;
  assert.equal(h.controller.snapshot.phase, 'dirty'); assert.equal(h.controller.snapshot.dirty, true);
  assert.equal(h.controller.snapshot.confirmedPayload.text, 'submitted');
  assert.equal(h.clock.size, 1);
  h.behavior.save = undefined; await h.clock.fire();
  assert.equal(h.calls.save.length, 2);
  assert.equal(h.calls.save[1].request.expectedRevision, 1);
  assert.equal(h.calls.save[1].request.payload.text, 'newer local input');
  assert.notEqual(h.calls.save[1].request.writeId, request.writeId);
  assert.equal(h.controller.snapshot.phase, 'saved');
});

test('reverting during an in-flight write remains an unsaved change relative to its confirmed receipt', async t => {
  const gate = deferred(); const h = harness(t, { save: () => gate.promise }); h.open();
  h.controller.changed(edited('in flight')); const saving = h.controller.save();
  h.controller.changed(payload());
  gate.resolve(saved(h.calls.save[0].request)); await saving;
  assert.equal(h.controller.snapshot.dirty, true);
  assert.deepEqual(h.controller.snapshot.payload, payload());
  assert.equal(h.controller.snapshot.confirmedPayload.text, 'in flight');
  assert.equal(h.clock.size, 1);
});

test('invalid local input cannot be labeled safely saved by an older in-flight receipt', async t => {
  const gate = deferred(); const h = harness(t, { save: () => gate.promise }); h.open();
  h.controller.changed(edited('valid submitted text')); const saving = h.controller.save();
  h.controller.changed(payload({ text: 'x'.repeat(20001) }));
  assert.equal(h.controller.snapshot.phase, 'invalid');
  assert.equal(h.controller.canCloseSafely, false);
  gate.resolve(saved(h.calls.save[0].request)); await saving;
  assert.equal(h.controller.snapshot.phase, 'invalid');
  assert.equal(h.controller.snapshot.dirty, true);
  assert.equal(h.controller.canCloseSafely, false);
  await h.clock.fire(); await h.controller.save();
  assert.equal(h.calls.save.length, 1);
  h.controller.changed(edited('fixed local text'));
  assert.equal(h.controller.snapshot.phase, 'dirty');
  assert.equal(h.clock.size, 1);
});

test('exact reconciliation does not clear newer invalid local input or silently resume autosave', async t => {
  const h = harness(t, { save: () => { throw error(); } }); h.open();
  h.controller.changed(edited('valid submitted text')); await h.controller.save();
  const request = h.calls.save[0].request;
  h.controller.changed(payload({ text: 'x'.repeat(20001) }));
  h.behavior.read = () => saved(request); await h.controller.reconcile();
  assert.equal(h.controller.snapshot.pendingWrite, false);
  assert.equal(h.controller.snapshot.phase, 'invalid'); assert.equal(h.controller.snapshot.dirty, true);
  assert.equal(h.controller.canCloseSafely, false); assert.equal(h.clock.size, 0);
  h.controller.resume(); await h.controller.save(); await h.clock.fire();
  assert.equal(h.calls.save.length, 1);
});

test('409 conflicts and capacity/source/schema conflicts retain local text and never auto-rebase', async t => {
  for (const code of ['WORKSPACE_CONFLICT', 'WORKSPACE_WRITE_ID_REUSED', 'WORKSPACE_SOURCE_CHANGED', 'WORKSPACE_SCHEMA_CHANGED', 'WORKSPACE_CAPACITY_REACHED']) {
    const h = harness(t, { save: () => { throw error(409, code); } });
    h.open(); const id = h.controller.snapshot.workspaceId;
    h.controller.changed(edited(code)); await h.controller.save();
    assert.equal(h.controller.snapshot.phase, 'conflict'); assert.equal(h.controller.snapshot.pendingWrite, false);
    assert.equal(h.controller.snapshot.payload.text, code); assert.equal(h.controller.snapshot.dirty, true);
    h.controller.changed(edited('still local')); h.controller.resume();
    await h.clock.fire(); await h.controller.save(); await h.controller.reconcile();
    assert.equal(h.calls.save.length, 1); assert.equal(h.calls.read.length, 0);
    assert.equal(h.controller.snapshot.workspaceId, id); assert.equal(h.uuidCount, 2);
    assert.equal(h.controller.snapshot.canWrite, false);
  }
});

test('explicit conflict read preserves local content, confirmed CAS version and source baseline', async t => {
  const remote = workspace({ revision: 3, currentPlannerRevision: 22, payload: edited('other tab') });
  const h = harness(t, { save: () => { throw error(409, 'WORKSPACE_CONFLICT'); }, read: () => remote });
  const initial = workspace(); h.open(initial.payload, initial);
  h.controller.changed(edited('my unsaved input')); await h.controller.save(); await h.controller.readRemote();
  assert.equal(h.calls.read[0].workspaceId, wid);
  assert.equal(h.controller.snapshot.payload.text, 'my unsaved input');
  assert.equal(h.controller.snapshot.workspace.revision, 1);
  assert.equal(h.controller.snapshot.basePlannerRevision, 7);
  assert.deepEqual(h.controller.snapshot.remote, remote);
  assert.equal(h.controller.snapshot.phase, 'conflict'); assert.equal(h.clock.size, 0);
  await h.controller.save(); assert.equal(h.calls.save.length, 1);
});

test('transport/503 loss freezes same-ID intent, with no automatic retry, fresh ID or background read', async t => {
  for (const failure of [Error('network response lost'), error()]) {
    const h = harness(t, { save: () => { throw failure; } }); h.open();
    h.controller.changed(edited('frozen original request')); await h.controller.save();
    const original = clone(h.calls.save[0].request);
    assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
    assert.equal(h.controller.snapshot.canWrite, false); assert.equal(h.controller.snapshot.canReconcile, true);
    h.controller.changed(edited('new local input')); h.controller.resume();
    await h.clock.fire(); await h.controller.save(); await h.controller.save();
    assert.equal(h.calls.save.length, 1); assert.equal(h.calls.read.length, 0); assert.equal(h.uuidCount, 2);
    assert.deepEqual(h.calls.save[0].request, original);
    h.behavior.read = () => saved(original);
    await h.controller.reconcile();
    assert.equal(h.calls.read[0].workspaceId, original.workspaceId);
    assert.equal(h.controller.snapshot.phase, 'paused');
    assert.equal(h.controller.snapshot.pendingWrite, false); assert.equal(h.controller.snapshot.dirty, true);
    assert.equal(h.controller.snapshot.payload.text, 'new local input');
    assert.equal(h.clock.size, 0); assert.equal(h.calls.save.length, 1);
    h.behavior.save = undefined;
    h.controller.resume(); await h.clock.fire();
    assert.equal(h.calls.save.length, 2);
    assert.equal(h.calls.save[1].request.workspaceId, original.workspaceId);
    assert.equal(h.calls.save[1].request.expectedRevision, 1);
    assert.notEqual(h.calls.save[1].request.writeId, original.writeId);
  }
});

test('exact readback confirms save without modifying raw metadata or warning and performs no mutation', async t => {
  const h = harness(t, { save: () => { throw error(); } }); h.open();
  h.controller.changed(edited('confirmed through readback')); await h.controller.save();
  const request = h.calls.save[0].request;
  h.behavior.read = () => saved(request, { currentPlannerRevision: 42, sourceExists: false });
  await h.controller.reconcile();
  assert.equal(h.controller.snapshot.phase, 'saved'); assert.equal(h.controller.snapshot.dirty, false);
  assert.equal(h.controller.snapshot.pendingWrite, false); assert.equal(h.controller.canCloseSafely, true);
  assert.deepEqual(h.controller.snapshot.payload, request.payload);
  assert.equal(h.controller.snapshot.payload.localMediaOmitted, true);
  assert.equal(h.controller.snapshot.payload.rawTags, payload().rawTags);
  assert.equal(h.controller.snapshot.basePlannerRevision, 7);
  assert.equal(h.calls.save.length, 1); assert.equal(h.calls.read.length, 1); assert.equal(h.uuidCount, 2);
  await h.clock.fire(); await h.controller.reconcile();
  assert.equal(h.calls.read.length, 1); assert.equal(h.calls.save.length, 1);
});

test('readback must match every binding; divergent receipt remains blocked and never replaces local text', async t => {
  const changes = [
    { workspaceId: 'workspace-00000002' }, { revision: 9 }, { writeId: 'operation-00000002' },
    { sourcePostId: null }, { basePlannerRevision: 8 }, { state: 'discarded' },
    { payload: edited('different body') }, { payload: payload({ text: 'intended', rawTags: 'different CSV' }) },
    { payload: payload({ text: 'intended', localMediaOmitted: false }) },
  ];
  for (const change of changes) {
    const h = harness(t, { save: () => { throw error(); } }); h.open();
    h.controller.changed(edited('intended')); await h.controller.save();
    const request = h.calls.save[0].request;
    h.behavior.read = () => saved(request, change);
    await h.controller.reconcile();
    assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
    assert.equal(h.controller.snapshot.payload.text, 'intended'); assert.equal(h.controller.snapshot.workspace, null);
    assert.equal(h.calls.read[0].workspaceId, request.workspaceId);
    await h.clock.fire(); await h.controller.save();
    assert.equal(h.calls.save.length, 1); assert.equal(h.uuidCount, 2);
  }
});

test('404, 503 and closed readback do not prove a save failed or permit a replacement workspace', async t => {
  for (const failure of [error(404, 'WORKSPACE_NOT_FOUND'), error(), error(410, 'WORKSPACE_CLOSED')]) {
    const h = harness(t, { save: () => { throw error(); }, read: () => { throw failure; } }); h.open();
    h.controller.changed(edited('possibly committed')); await h.controller.save();
    const id = h.controller.snapshot.workspaceId;
    await h.controller.reconcile(); await h.controller.save(); await h.clock.fire();
    assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
    assert.equal(h.controller.snapshot.workspaceId, id); assert.equal(h.calls.read[0].workspaceId, id);
    assert.equal(h.calls.save.length, 1); assert.equal(h.uuidCount, 2);
    assert.equal(h.open(edited('unrelated new composer')), false);
    assert.equal(h.controller.snapshot.activeEditor, false); assert.equal(h.uuidCount, 2);
    assert.equal(h.controller.snapshot.payload.text, 'possibly committed');
  }
});

test('a mismatching successful write response is uncertain, never silently accepted', async t => {
  const h = harness(t, { save: request => saved(request, { payload: edited('not the submitted content') }) });
  h.open(); h.controller.changed(edited('submitted')); await h.controller.save();
  assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
  assert.equal(h.controller.snapshot.workspace, null); assert.equal(h.controller.snapshot.payload.text, 'submitted');
  await h.clock.fire(); assert.equal(h.calls.save.length, 1);
});

test('close aborts pending request and ignores late success; reopening cannot escape unresolved identity', async t => {
  const gate = deferred(); const h = harness(t, { save: () => gate.promise }); h.open();
  h.controller.changed(edited('in-flight old editor')); const saving = h.controller.save();
  const original = h.calls.save[0].request;
  h.controller.close();
  assert.equal(h.calls.save[0].signal.aborted, true);
  assert.equal(h.controller.snapshot.open, false); assert.equal(h.controller.snapshot.phase, 'uncertain');
  assert.equal(h.open(edited('new editor must not inherit old autosave')), false);
  assert.equal(h.controller.snapshot.activeEditor, false);
  h.controller.changed(edited('must be ignored'));
  gate.resolve(saved(original)); await saving;
  assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
  assert.equal(h.controller.snapshot.workspace, null);
  assert.equal(h.controller.snapshot.payload.text, 'in-flight old editor');
  assert.equal(h.uuidCount, 2); assert.equal(h.calls.save.length, 1);
  h.behavior.read = () => saved(original); await h.controller.reconcile();
  assert.equal(h.controller.snapshot.phase, 'local_only'); assert.equal(h.controller.snapshot.activeEditor, false);
  h.controller.resume(); await h.clock.fire(); assert.equal(h.calls.save.length, 1);
  assert.equal(h.open(edited('explicit new editor')), true);
  assert.notEqual(h.controller.snapshot.workspaceId, original.workspaceId);
  assert.equal(h.uuidCount, 3);
});

test('pause aborts an in-flight save and requires exact reconciliation before autosave can resume', async t => {
  const gate = deferred(); const h = harness(t, { save: () => gate.promise }); h.open();
  h.controller.changed(edited('sent')); const saving = h.controller.save();
  const request = h.calls.save[0].request;
  h.controller.pause();
  assert.equal(h.calls.save[0].signal.aborted, true); assert.equal(h.controller.snapshot.phase, 'uncertain');
  h.controller.changed(edited('new local input after pause'));
  gate.reject(new DOMException('Aborted', 'AbortError')); await saving;
  h.controller.resume(); await h.clock.fire(); assert.equal(h.calls.save.length, 1);
  h.behavior.read = () => saved(request); await h.controller.reconcile();
  assert.equal(h.controller.snapshot.phase, 'paused'); assert.equal(h.clock.size, 0);
  h.behavior.save = undefined; h.controller.resume(); await h.clock.fire();
  assert.equal(h.calls.save.length, 2); assert.equal(h.calls.save[1].request.expectedRevision, 1);
});

test('close/reopen isolates late read responses and destroy suppresses all later effects', async t => {
  const gate = deferred(); const h = harness(t, { read: () => gate.promise });
  h.open(payload(), workspace());
  const reading = h.controller.readRemote();
  h.controller.close(); assert.equal(h.calls.read[0].signal.aborted, true);
  h.open(edited('new composer'));
  const newId = h.controller.snapshot.workspaceId;
  gate.resolve(workspace({ revision: 9, payload: edited('late old response') })); await reading;
  assert.equal(h.controller.snapshot.workspaceId, newId); assert.equal(h.controller.snapshot.remote, null);
  assert.equal(h.controller.snapshot.payload.text, 'new composer');
  assert.equal(h.controller.snapshot.phase, 'saved');
  h.controller.changed(edited('timer before destruction')); h.controller.destroy();
  const notifications = h.changes.length;
  await h.clock.fire(); await h.controller.save(); await h.controller.reconcile();
  assert.equal(h.open(), false); h.controller.changed(edited('ignored'));
  assert.equal(h.changes.length, notifications); assert.equal(h.calls.save.length, 0);
});

test('definitive rejected/closed saves retain text and do not automatically allocate replacement IDs', async t => {
  for (const status of [400, 404, 410, 413]) {
    const h = harness(t, { save: () => { throw error(status, status === 410 ? 'WORKSPACE_CLOSED' : 'WORKSPACE_INPUT_INVALID'); } });
    h.open(); h.controller.changed(edited(`rejected-${status}`)); await h.controller.save();
    assert.equal(h.controller.snapshot.phase, status === 410 ? 'closed' : 'error');
    assert.equal(h.controller.snapshot.pendingWrite, false); assert.equal(h.controller.snapshot.payload.text, `rejected-${status}`);
    h.controller.changed(edited('still retained')); await h.clock.fire(); await h.controller.save();
    assert.equal(h.calls.save.length, 1); assert.equal(h.uuidCount, 2);
    assert.equal(h.controller.snapshot.canWrite, false);
  }
});

test('confirmed planner completion discards only matching workspace CAS revision with a minimal receipt', async t => {
  const h = harness(t); h.open();
  h.controller.changed(edited('saved work')); await h.controller.save();
  const confirmed = h.controller.snapshot.workspace;
  assert.equal(await h.controller.completed(), true);
  const request = h.calls.discard[0].request;
  assert.deepEqual(Object.keys(request).sort(), ['expectedRevision', 'workspaceId', 'writeId']);
  assert.equal(request.workspaceId, confirmed.workspaceId); assert.equal(request.expectedRevision, confirmed.revision);
  assert.notEqual(request.writeId, confirmed.writeId);
  assert.equal(h.controller.snapshot.open, false); assert.equal(h.controller.snapshot.activeEditor, false);
  assert.equal(h.controller.snapshot.pendingWrite, false);
  assert.deepEqual(h.controller.snapshot.workspace, discarded(request));
  assert.equal(h.calls.save.length, 1); assert.equal(h.calls.discard.length, 1);
});

test('completed is inert after destruction and does not issue another discard after confirmed closure', async t => {
  const destroyed = harness(t); destroyed.open(payload(), workspace()); destroyed.controller.destroy();
  await destroyed.controller.completed();
  assert.equal(destroyed.calls.discard.length, 0);
  assert.equal(destroyed.uuidCount, 0);
  const completed = harness(t); completed.open(payload(), workspace());
  await completed.controller.completed();
  const ids = completed.uuidCount;
  await completed.controller.completed();
  assert.equal(completed.calls.discard.length, 1);
  assert.equal(completed.uuidCount, ids);
});

test('completion without a workspace makes no discard and uncertain save completion retains workspace intent', async t => {
  const clean = harness(t); clean.open();
  assert.equal(await clean.controller.completed(), true); assert.equal(clean.calls.discard.length, 0);
  const uncertain = harness(t, { save: () => { throw error(); } }); uncertain.open();
  uncertain.controller.changed(edited('unknown canonical save must not erase this')); await uncertain.controller.save();
  assert.equal(await uncertain.controller.completed(), false);
  assert.equal(uncertain.calls.discard.length, 0); assert.equal(uncertain.controller.snapshot.pendingWrite, true);
  assert.equal(uncertain.controller.snapshot.open, false);
});

test('discard conflict keeps newer server revision intact, with no forced retry or new identity', async t => {
  const remote = workspace({ revision: 2, payload: edited('concurrent work') });
  const h = harness(t, { discard: () => { throw error(409, 'WORKSPACE_CONFLICT'); }, read: () => remote });
  h.open(payload(), workspace());
  assert.equal(await h.controller.completed(), false);
  assert.equal(h.calls.discard[0].request.expectedRevision, 1);
  assert.equal(h.controller.snapshot.pendingWrite, false); assert.equal(h.controller.snapshot.activeEditor, false);
  await h.clock.fire(); await h.controller.save();
  assert.equal(h.calls.discard.length, 1); assert.equal(h.calls.save.length, 0);
  assert.equal(h.uuidCount, 1); assert.equal(remote.revision, 2); assert.equal(remote.payload.text, 'concurrent work');
});

test('lost discard response is confirmed only by exact minimal 410 readback, without fetching retained payload', async t => {
  const h = harness(t, { discard: () => { throw error(); } }); h.open(payload(), workspace());
  assert.equal(await h.controller.completed(), false);
  const request = h.calls.discard[0].request;
  assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
  h.behavior.read = () => { throw error(410, 'WORKSPACE_CLOSED', { closed: closed(request) }); };
  await h.controller.reconcile();
  assert.equal(h.calls.read[0].workspaceId, request.workspaceId);
  assert.equal(h.controller.snapshot.phase, 'closed'); assert.equal(h.controller.snapshot.pendingWrite, false);
  assert.equal(h.controller.snapshot.workspace, null); assert.equal(h.controller.snapshot.activeEditor, false);
  assert.equal(h.controller.snapshot.dirty, false);
  assert.equal(h.calls.discard.length, 1); assert.equal(h.calls.save.length, 0); assert.equal(h.uuidCount, 1);
});

test('wrong-ID/revision/write/operation/expiry 410 cannot confirm an uncertain discard', async t => {
  const variants = [
    { workspaceId: 'workspace-00000002' }, { currentRevision: 9 },
    { writeId: 'operation-00000002' }, { lastOperation: 'save' }, { state: 'expired', lastOperation: 'expire' },
  ];
  for (const mismatch of variants) {
    const h = harness(t, { discard: () => { throw error(); } }); h.open(payload(), workspace());
    await h.controller.completed();
    const request = h.calls.discard[0].request;
    h.behavior.read = () => { throw error(410, 'WORKSPACE_CLOSED', { closed: closed(request, mismatch) }); };
    await h.controller.reconcile();
    assert.equal(h.controller.snapshot.phase, 'uncertain'); assert.equal(h.controller.snapshot.pendingWrite, true);
    await h.controller.save(); await h.clock.fire();
    assert.equal(h.calls.discard.length, 1); assert.equal(h.calls.save.length, 0); assert.equal(h.uuidCount, 1);
  }
});

test('end-to-end client/controller recovery proves a lost discard using actual 410 error parsing', async t => {
  const calls = []; let discardRequest;
  const client = createWorkspaceClient({ fetcher: async (path, options) => {
    calls.push({ path, method: options.method });
    if (options.method === 'POST') {
      discardRequest = { workspaceId: wid, ...JSON.parse(options.body) };
      throw Error('synthetic post-commit response loss');
    }
    assert.equal(options.method, 'GET');
    return jsonResponse({ error: { code: 'WORKSPACE_CLOSED', details: closed(discardRequest) } }, 410);
  } });
  const controller = createWorkspaceController({ client, uuid: () => 'operation-00000099' });
  t.after(() => controller.destroy());
  controller.open({ sourcePostId: 'post-1', basePlannerRevision: 7, payload: payload() }, workspace());
  assert.equal(await controller.completed(), false); await controller.reconcile();
  assert.equal(controller.snapshot.phase, 'closed'); assert.equal(controller.snapshot.pendingWrite, false);
  assert.deepEqual(calls, [
    { path: `/api/planner/workspaces/${wid}/discard`, method: 'POST' },
    { path: `/api/planner/workspaces/${wid}`, method: 'GET' },
  ]);
});

test('two controllers using real clients race on the same CAS revision; loser cannot overwrite winner', async t => {
  // This synthetic in-memory service models atomic CAS only. It is not a live DB acceptance test.
  let remote = workspace(); const calls = [];
  const fetcher = async (path, options) => {
    calls.push({ path, method: options.method });
    if (options.method === 'GET') return jsonResponse({ schemaVersion: 1, workspace: clone(remote) });
    const request = { workspaceId: wid, ...JSON.parse(options.body) };
    if (request.expectedRevision !== remote.revision) return jsonResponse({ error: { code: 'WORKSPACE_CONFLICT' } }, 409);
    remote = saved(request);
    return jsonResponse({ schemaVersion: 1, workspace: clone(remote) });
  };
  const controllers = ['operation-tab-a-0001', 'operation-tab-b-0001'].map(id => {
    const controller = createWorkspaceController({ client: createWorkspaceClient({ fetcher }), uuid: () => id });
    t.after(() => controller.destroy());
    controller.open({ sourcePostId: 'post-1', basePlannerRevision: 7, payload: payload() }, workspace());
    return controller;
  });
  controllers[0].changed(edited('tab A')); controllers[1].changed(edited('tab B'));
  await Promise.all(controllers.map(c => c.save()));
  assert.deepEqual(controllers.map(c => c.snapshot.phase), ['saved', 'conflict']);
  assert.equal(remote.revision, 2); assert.equal(remote.payload.text, 'tab A');
  assert.equal(controllers[1].snapshot.payload.text, 'tab B');
  controllers[1].changed(edited('tab B still local')); await controllers[1].save();
  assert.equal(calls.filter(c => c.method === 'PUT').length, 2);
  await controllers[1].readRemote();
  assert.equal(controllers[1].snapshot.remote.payload.text, 'tab A');
  assert.equal(controllers[1].snapshot.payload.text, 'tab B still local');
  assert.equal(remote.payload.text, 'tab A');
});

function actualAppFunction(name) {
  const source = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0);
  const end = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, end < 0 ? undefined : start + end + 1);
}

test('actual post-save bridge locks cleanup and rechecks unexpected late local changes before close', async () => {
  const gate = deferred(); let closes = 0, currentInput = 'submitted editor', cleanupStarted = false;
  const fields = {
    '#post-tags': { value: '' }, '#post-zone': { value: 'Europe/Berlin' },
    '#post-date': { value: '' }, '#post-time': { value: '' }, '#search': { value: '' },
    '#form-errors': { hidden: true, textContent: '', innerHTML: '' },
  };
  const context = vm.createContext({
    composerTiming:createEditorTiming(),saving: false, mediaLoading: false, composerMissingMedia: false,
    state: { posts: [{ id: 'post-1', status: 'draft', createdAt: '2026-01-01' }] },
    editingId: 'post-1', initialEditor: '{}', composerLabelState: { title: '', tags: [], baseline: '' },
    composerBaseText: 'submitted text', composerVariantTexts: {}, composerAttachments: [], composerMedia: null, composerCover: null,
    composerIdeaFingerprint: null, view: 'drafts',
    $: selector => fields[selector], $$: () => [{ value: 'linkedin' }],
    editedPostLabels: () => [], currentComposerRawTags: () => '', selectedVariantTexts: () => ({}),
    validatePost: () => [], editorSnapshot: () => currentInput,
    workspaceUI: { beforePostSave() {}, afterPostSave() { cleanupStarted = true; return gate.promise; } },
    setComposerBusy() {}, persist: async () => true, notify() {}, render() {},
    closeComposer() { closes++; },
  });
  vm.runInContext(actualAppFunction('savePost'), context);
  const saving = context.savePost('draft'); await settle();
  assert.equal(cleanupStarted, true);
  assert.equal(context.saving, true);
  // Simulate a delayed input event despite disabled controls, exercising the second guard too.
  currentInput = 'new unsaved local input';
  gate.resolve(true); await saving;
  assert.equal(closes, 0);
  assert.equal(context.editingId, 'post-1');
  assert.equal(context.saving, false);
});

test('actual delete bridge locks cleanup; late edits remain an unsaved new copy and never recreate the deleted post', async () => {
  for (const hasLateEdit of [false, true]) {
    const gate = deferred(); let currentInput = 'submitted editor', closes = 0, persists = 0;
    const context = vm.createContext({
      saving: false, editingId: 'post-1', composerIdeaFingerprint: 'old-fingerprint',
      state: { posts: [{ id: 'post-1', status: 'draft' }] },
      editorSnapshot: () => currentInput,
      workspaceUI: { beforePostSave() {}, afterPostSave: () => gate.promise },
      setComposerBusy() {},
      persist: async state => { persists++; assert.equal(state.posts.length, 0); return true; },
      notify() {}, closeComposer() { closes++; }, restoreDeletedPost() {},
    });
    vm.runInContext(actualAppFunction('deletePost'), context);
    const deleting = context.deletePost(); await settle();
    assert.equal(context.saving, true);
    if (hasLateEdit) currentInput = 'new local input';
    gate.resolve(true); await deleting;
    assert.equal(closes, hasLateEdit ? 0 : 1);
    if (hasLateEdit) {
      assert.equal(context.editingId, null);
      assert.equal(context.composerIdeaFingerprint, null);
    }
    assert.equal(persists, 1); assert.equal(context.saving, false);
  }
});

function fakeElement() {
  const handlers = new Map();
  return {
    handlers, innerHTML: '', textContent: '', open: false, isConnected: true,
    contains: () => false, querySelectorAll: () => [], setAttribute() {}, focus() {},
    addEventListener(name, listener) { handlers.set(name, listener); }, removeEventListener() {},
    showModal() { this.open = true; }, close() { this.open = false; },
    querySelector() { return null; },
    async action(action, workspaceId) {
      const target = { dataset: { workspaceAction: action, workspaceId }, disabled: false };
      return handlers.get('click')({ target: { closest: () => target }, preventDefault() {} });
    },
  };
}

test('dialog close/reopen during discard readback cannot race into null receipt state or repeat discard', async t => {
  const oldDocument = globalThis.document;
  const content = fakeElement(), dialog = fakeElement(), statusContainer = fakeElement(), openButton = fakeElement();
  dialog.querySelector = selector => selector === '[data-workspace-content]' ? content : fakeElement();
  globalThis.document = { activeElement: null, hidden: false, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
  let discardRequest, discardCalls = 0; const reads = [];
  const client = {
    list: async () => listing(),
    discard: async request => { discardCalls++; discardRequest = clone(request); throw error(); },
    read: (_id, options) => { const gate = deferred(); reads.push({ ...gate, signal: options.signal }); return gate.promise; },
  };
  const ui = createWorkspaceUI({
    statusContainer, dialog, openButton, capture: payload, canRestore: () => true,
    refreshPlanner: async () => ({}), applyRestore() {}, client, uuid: () => 'operation-00000077',
  });
  t.after(() => { ui.destroy(); if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  await ui.init(); ui.open(); await settle();
  await dialog.action('discard-confirm', wid);
  const first = dialog.action('reconcile-discard');
  dialog.handlers.get('cancel')({ preventDefault() {} });
  assert.equal(reads[0].signal.aborted, true);
  ui.open();
  const second = dialog.action('reconcile-discard');
  assert.equal(reads.length, 2);
  reads[0].reject(error(410, 'WORKSPACE_CLOSED', { closed: closed(discardRequest) }));
  await first;
  assert.match(content.innerHTML, /noch unklar/);
  reads[1].reject(error(410, 'WORKSPACE_CLOSED', { closed: closed(discardRequest) }));
  await assert.doesNotReject(second);
  assert.equal(discardCalls, 1);
  assert.match(content.innerHTML, /Verwerfen dieser Arbeitsfassung wurde bestätigt/);
});
