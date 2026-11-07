import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostingTimesController, emptyPostingSchedule } from '../../public/posting-times-controller.js';
import { findNextPostingSlots, selectPostingSlot, inspectScheduleBinding } from '../../public/workflows/posting-schedules.mjs';

const clone = value => structuredClone(value);
const now = '2026-11-09T07:00:00.000Z';
const schedule = extra => ({ schemaVersion: 1, timezone: 'Europe/Berlin', paused: false, minimumGapMinutes: 30, overlapChoice: 'reject', slots: [{ id: 'mon09', weekday: 1, time: '09:00' }, { id: 'wed09', weekday: 3, time: '09:00' }], ...extra });
const state = () => ({ schemaVersion: 2, revision: 7, settings: { timezone: 'Europe/Berlin' }, channels: [{ id: 'a', enabled: true, postingSchedule: schedule() }, { id: 'b', enabled: true, postingSchedule: null }], posts: [], ideas: [{ id: 'idea1', title: 'Untouched idea' }] });
function withPosts() {
  const value = state();
  const found = findNextPostingSlots(value, { postId: 'bound', channelIds: ['a'], after: now, displayTimezone: 'Europe/Berlin' });
  const selection = selectPostingSlot(value, found, found.suggestions[0], { now });
  const post = { id: 'bound', title: 'Keep the title', text: 'Raw content', rawTags: '  Label,  Label ', tags: ['  Label', '  Label '], variantTexts: { a: 'Separate text' }, channels: ['a'], status: 'scheduled', scheduledAt: selection.local, scheduledInstant: selection.scheduledAt, timeZone: selection.timezone, scheduleBinding: selection.scheduleBinding, media: { id: 'image1', alt: 'Stored alt' } };
  value.posts = [post, { ...clone(post), id: 'fixed', scheduledAt: '2026-11-10T12:00', scheduledInstant: '2026-11-10T11:00:00.123Z', scheduleBinding: null }];
  return value;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(t, { initial = state(), save } = {}) {
  let current = clone(initial), sequence = 0;
  const writes = [], changes = [];
  const controller = createPostingTimesController({
    getState: () => current,
    saveState: async value => {
      writes.push(clone(value));
      if (save) return save(value);
      current = { ...clone(value), revision: value.revision + 1 };
      return clone(current);
    },
    onChange: value => changes.push(value),
    newId: () => `generated_${++sequence}`,
  });
  t.after(() => controller.destroy());
  return { controller, writes, changes, get state() { return current; }, setState(value) { current = value; }, get idCount() { return sequence; } };
}

test('new schedules use the current zone, safe fold default, explicit fields, and independent slot arrays', () => {
  const first = emptyPostingSchedule('Asia/Kathmandu');
  assert.deepEqual(first, { schemaVersion: 1, timezone: 'Asia/Kathmandu', paused: false, minimumGapMinutes: 0, overlapChoice: 'reject', slots: [] });
  first.slots.push({ id: 'external', weekday: 1, time: '09:00' });
  assert.deepEqual(emptyPostingSchedule().slots, []);
  assert.equal(emptyPostingSchedule().timezone, 'UTC');
});

test('opening and local edits are isolated; no autosave, publishing, or timer starts', async t => {
  const h = harness(t, { initial: withPosts() }), before = clone(h.state), attempts = [];
  for (const name of ['fetch', 'setTimeout', 'setInterval']) t.mock.method(globalThis, name, () => { attempts.push(name); throw Error(`Unexpected ${name}`); });
  assert.equal(h.controller.open('a'), true);
  assert.equal(h.controller.snapshot.dirty, false);
  const patch = { slots: [{ id: 'mon09', weekday: 1, time: '10:15' }] };
  assert.equal(h.controller.patch(patch), true);
  patch.slots[0].time = '23:59';
  const exposed = h.controller.snapshot;
  exposed.draft.slots[0].id = 'outside'; exposed.channels[0].postingSchedule.paused = true;
  assert.equal(h.controller.snapshot.draft.slots[0].time, '10:15');
  assert.equal(h.controller.snapshot.draft.slots[0].id, 'mon09');
  assert.equal(h.controller.snapshot.channels[0].postingSchedule.paused, false);
  assert.equal(h.controller.snapshot.dirty, true);
  await Promise.resolve();
  assert.deepEqual(h.state, before); assert.deepEqual(h.writes, []); assert.deepEqual(attempts, []);
});

test('one explicit save persists the complete snapshot at its source revision and settles clean', async t => {
  const h = harness(t, { initial: withPosts() }), before = clone(h.state);
  h.controller.open('a');
  h.controller.patch({ slots: [...schedule().slots, { id: 'fri14', weekday: 5, time: '14:00' }] });
  assert.equal(await h.controller.save(), true);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].revision, 7);
  assert.deepEqual(h.writes[0].posts, before.posts); assert.deepEqual(h.writes[0].ideas, before.ideas);
  assert.deepEqual(h.writes[0].channels[1], before.channels[1]);
  assert.equal(h.state.revision, 8); assert.equal(h.controller.snapshot.dirty, false);
  assert.equal(h.controller.snapshot.blocked, false); assert.equal(h.controller.snapshot.busy, false);
  assert.equal(h.controller.snapshot.confirmation, null);
  assert.equal(inspectScheduleBinding(h.state.posts[0], h.state.channels).state, 'current');
  assert.match(h.controller.snapshot.message, /gespeichert.*unverändert/);
  assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 1);
});

test('a second explicit save uses only the newly confirmed revision', async t => {
  const h = harness(t); h.controller.open('a');
  h.controller.patch({ minimumGapMinutes: 45 }); await h.controller.save();
  h.controller.patch({ minimumGapMinutes: 60 }); await h.controller.save();
  assert.deepEqual(h.writes.map(value => value.revision), [7, 8]);
  assert.equal(h.state.revision, 9); assert.equal(h.controller.snapshot.draft.minimumGapMinutes, 60);
});

for (const [name, edit] of [
  ['slot-time edit', controller => controller.updateSlot('mon09', { time: '10:00' })],
  ['pause', controller => controller.patch({ paused: true })],
  ['slot removal', controller => controller.removeSlot('mon09')],
  ['schedule removal', controller => controller.clear()],
]) {
  test(`${name} requires affected-binding confirmation and leaves all appointments byte-for-byte unchanged`, async t => {
    const h = harness(t, { initial: withPosts() }), before = clone(h.state);
    h.controller.open('a'); edit(h.controller);
    assert.equal(await h.controller.save({ confirmed: true }), false, 'confirmation cannot be pre-bypassed');
    assert.equal(h.writes.length, 0);
    assert.equal(await h.controller.save(), false);
    assert.deepEqual(h.controller.snapshot.confirmation, { affected: ['bound'] });
    assert.deepEqual(h.state, before);
    assert.equal(await h.controller.save({ confirmed: true }), true);
    assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].posts, before.posts);
    assert.equal(inspectScheduleBinding(h.state.posts[0], h.state.channels).state, 'needs_review');
    assert.equal(inspectScheduleBinding(h.state.posts[1], h.state.channels).mode, 'fixed');
    assert.match(h.controller.snapshot.message, /1 Termin bleibt zur Prüfung/);
  });
}

test('changing a draft after a confirmation prompt invalidates that prompt', async t => {
  const h = harness(t, { initial: withPosts() }); h.controller.open('a');
  h.controller.updateSlot('mon09', { time: '10:00' }); await h.controller.save();
  assert.deepEqual(h.controller.snapshot.confirmation, { affected: ['bound'] });
  h.controller.updateSlot('mon09', { time: '11:00' });
  assert.equal(h.controller.snapshot.confirmation, null);
  assert.equal(await h.controller.save({ confirmed: true }), false); assert.equal(h.writes.length, 0);
  await h.controller.save(); assert.equal(await h.controller.save({ confirmed: true }), true);
  assert.equal(h.writes[0].channels[0].postingSchedule.slots[0].time, '11:00');
});

test('slot IDs survive editing and sorting; newly added slots receive IDs only once', async t => {
  const h = harness(t); h.controller.open('a');
  h.controller.updateSlot('mon09', { id: 'attempted-replacement', weekday: 5, time: '15:30' });
  h.controller.addSlot(); h.controller.updateSlot('generated_1', { weekday: 2, time: '10:00' });
  assert.equal(h.idCount, 1); assert.equal(h.controller.snapshot.draft.slots[0].id, 'mon09');
  assert.equal(await h.controller.save(), true);
  assert.deepEqual(h.state.channels[0].postingSchedule.slots.map(slot => slot.id), ['generated_1', 'wed09', 'mon09']);
  assert.equal(h.idCount, 1);
});

for (const [name, slots] of [
  ['duplicate time', [{ id: 'first', weekday: 1, time: '09:00' }, { id: 'second', weekday: 1, time: '09:00' }]],
  ['duplicate ID', [{ id: 'same', weekday: 1, time: '09:00' }, { id: 'same', weekday: 3, time: '12:00' }]],
]) {
  test(`${name} is visible without writing or discarding the local draft`, async t => {
    const h = harness(t); h.controller.open('a'); h.controller.patch({ slots });
    assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 0);
    assert.match(h.controller.snapshot.error, /doppelt/);
    assert.equal(h.controller.snapshot.dirty, true); assert.equal(h.controller.snapshot.blocked, false);
    assert.deepEqual(h.controller.snapshot.draft.slots, slots);
    h.controller.patch({ slots: [slots[0]] }); assert.equal(await h.controller.save(), true);
  });
}

test('new schedule creation is local, bounded to 56 slots, and reports the limit without allocating another ID', t => {
  const h = harness(t); h.controller.open('b'); h.controller.addSlot();
  assert.equal(h.controller.snapshot.draft.timezone, 'Europe/Berlin'); assert.equal(h.idCount, 1);
  const slots = Array.from({ length: 56 }, (_, i) => ({ id: `slot_${i}`, weekday: Math.floor(i / 8), time: `${String(i % 8).padStart(2, '0')}:00` }));
  h.controller.patch({ slots }); h.controller.addSlot();
  assert.equal(h.controller.snapshot.draft.slots.length, 56); assert.equal(h.idCount, 1);
  assert.match(h.controller.snapshot.error, /56/); assert.equal(h.writes.length, 0);
});

test('dirty close and channel switching require explicit discard; clean reopen uses current state', t => {
  const h = harness(t); h.controller.open('a'); h.controller.patch({ paused: true });
  assert.equal(h.controller.close(), false); assert.equal(h.controller.open('b'), false);
  assert.equal(h.controller.snapshot.channelId, 'a'); assert.equal(h.controller.snapshot.dirty, true);
  assert.equal(h.controller.close({ discard: true }), true);
  assert.equal(h.controller.snapshot.open, false); assert.equal(h.writes.length, 0);
  assert.equal(h.controller.open('b'), true); assert.equal(h.controller.snapshot.draft, null);
  assert.equal(h.controller.close(), true);
});

test('an observed revision change blocks before any write and retains an exportable draft', async t => {
  const h = harness(t); h.controller.open('a'); h.controller.patch({ minimumGapMinutes: 75 });
  const draft = h.controller.exportDraft(); h.state.revision++;
  assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 0);
  assert.equal(h.controller.snapshot.blocked, true); assert.equal(h.controller.snapshot.dirty, true);
  assert.equal(h.controller.exportDraft(), draft); assert.match(h.controller.snapshot.error, /geändert/);
  assert.equal(h.controller.patch({ minimumGapMinutes: 99 }), false);
  assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 0);
});

for (const [name, failure] of [
  ['409 response', Object.assign(Error('CAS conflict'), { status: 409 })],
  ['uncertain transport response', Error('Connection ended after possible commit')],
]) {
  test(`${name} blocks retry, keeps the draft, and does not claim persistence`, async t => {
    const h = harness(t, { save: async () => { throw failure; } });
    const before = clone(h.state); h.controller.open('a'); h.controller.patch({ minimumGapMinutes: 90 });
    const draft = h.controller.exportDraft();
    assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 1);
    assert.equal(h.controller.snapshot.busy, false); assert.equal(h.controller.snapshot.blocked, true);
    assert.equal(h.controller.snapshot.dirty, true); assert.equal(h.controller.snapshot.message, '');
    assert.equal(h.controller.exportDraft(), draft); assert.deepEqual(h.state, before);
    assert.equal(await h.controller.save(), false); assert.equal(await h.controller.save({ confirmed: true }), false);
    assert.equal(h.controller.patch({ paused: true }), false); h.controller.clear(); h.controller.addSlot();
    assert.equal(h.writes.length, 1); assert.equal(h.controller.exportDraft(), draft);
    assert.match(h.controller.snapshot.error, failure.status === 409 ? /Speicherkonflikt/ : /Keine automatische Wiederholung/);
  });
}

for (const [name, receipt] of [
  ['missing receipt', () => undefined],
  ['old revision', value => clone(value)],
  ['jumped revision', value => ({ ...clone(value), revision: value.revision + 2 })],
  ['old schema', value => ({ ...clone(value), schemaVersion: 1, revision: value.revision + 1 })],
  ['missing channel', value => ({ ...clone(value), revision: value.revision + 1, channels: [] })],
  ['different rules', value => { const next = clone(value); next.revision++; next.channels[0].postingSchedule.paused = true; return next; }],
]) {
  test(`${name} is an uncertain save, not a clean confirmation`, async t => {
    const h = harness(t, { save: async value => receipt(value) }); h.controller.open('a'); h.controller.patch({ minimumGapMinutes: 75 });
    const draft = h.controller.exportDraft(); assert.equal(await h.controller.save(), false);
    assert.equal(h.controller.snapshot.blocked, true); assert.equal(h.controller.snapshot.dirty, true);
    assert.equal(h.controller.snapshot.message, ''); assert.equal(h.controller.exportDraft(), draft);
    assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 1);
  });
}

test('an in-flight write blocks duplicate saves, edits, close, and another channel', async t => {
  const gate = deferred(), h = harness(t, { save: () => gate.promise });
  h.controller.open('a'); h.controller.patch({ minimumGapMinutes: 75 });
  const pending = h.controller.save(), submitted = clone(h.writes[0]), draft = h.controller.exportDraft();
  assert.equal(h.controller.snapshot.busy, true);
  assert.equal(await h.controller.save(), false); assert.equal(h.controller.patch({ paused: true }), false);
  h.controller.addSlot(); h.controller.updateSlot('mon09', { time: '15:00' }); h.controller.removeSlot('wed09'); h.controller.clear();
  assert.equal(h.controller.close({ discard: true }), false); assert.equal(h.controller.open('b'), false);
  assert.equal(h.controller.exportDraft(), draft); assert.equal(h.writes.length, 1);
  gate.resolve({ ...submitted, revision: submitted.revision + 1 });
  assert.equal(await pending, true); assert.equal(h.controller.snapshot.busy, false); assert.equal(h.controller.snapshot.dirty, false);
});

for (const outcome of ['success', 'failure']) {
  test(`destroy ignores a late save ${outcome} and cannot reopen or write`, async t => {
    const gate = deferred(), h = harness(t, { save: () => gate.promise });
    h.controller.open('a'); h.controller.patch({ minimumGapMinutes: 75 }); const pending = h.controller.save();
    const count = h.changes.length; h.controller.destroy(); h.controller.destroy();
    if (outcome === 'success') gate.resolve({ ...clone(h.writes[0]), revision: 8 });
    else gate.reject(Error('Late transport failure'));
    assert.equal(await pending, false); assert.equal(h.changes.length, count); assert.equal(h.controller.snapshot.open, false);
    assert.equal(h.controller.open('a'), false); assert.equal(h.controller.patch({ paused: true }), false);
    assert.equal(await h.controller.save(), false); assert.equal(h.writes.length, 1);
  });
}

test('unconfirmed snapshots and missing channels cannot begin a settings session', t => {
  for (const initial of [{ ...state(), schemaVersion: 1 }, { ...state(), revision: null }, { ...state(), revision: 1.5 }, { ...state(), channels: [] }]) {
    const h = harness(t, { initial });
    assert.throws(() => h.controller.open('a'), /bestätigten Planungsstand/);
    assert.equal(h.controller.snapshot.open, false); assert.equal(h.writes.length, 0);
  }
});
