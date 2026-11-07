import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedQueueController } from '../../public/saved-queue-panel.js';
import { inspectScheduleBinding, normalizeScheduleBinding } from '../../public/workflows/posting-schedules.mjs';

const clone = value => structuredClone(value);
const instant = '2026-11-09T07:00:00.000Z';
const schedule = extra => ({ schemaVersion: 1, timezone: 'Europe/Berlin', paused: false, minimumGapMinutes: 30, overlapChoice: 'reject', slots: [{ id: 'mon09', weekday: 1, time: '09:00' }, { id: 'mon13', weekday: 1, time: '13:00' }, { id: 'wed09', weekday: 3, time: '09:00' }], ...extra });
const state = () => ({ schemaVersion: 2, revision: 7, settings: { timezone: 'Europe/Berlin' }, channels: [{ id: 'a', enabled: true, postingSchedule: schedule() }, { id: 'b', enabled: true, postingSchedule: schedule({ timezone: 'America/New_York', slots: [{ id: 'ny03', weekday: 1, time: '03:00' }] }) }], posts: [], ideas: [] });
const post = extra => ({ id: 'p1', text: 'Untouched text', title: 'Title', tags: ['  raw  ', '  raw  '], rawTags: '  raw  ,  raw  ', variantTexts: { a: 'Own variant' }, channels: ['a'], status: 'draft', scheduledAt: null, scheduledInstant: null, scheduleBinding: null, timeZone: 'Europe/Berlin', media: { id: 'media1', alt: 'Alt' }, ...extra });
function harness(t, { initialState = state(), initialPost = post(), initialNow = instant } = {}) {
  let currentState = clone(initialState), currentPost = clone(initialPost), busy = false, now = initialNow;
  const applied = [], changes = [];
  const controller = createSavedQueueController({ getState: () => currentState, getPost: () => currentPost, isBusy: () => busy, now: () => now, onApply: value => applied.push(value), onChange: value => changes.push(value) });
  t.after(() => controller.destroy());
  return { controller, applied, changes, get state() { return currentState; }, get post() { return currentPost; }, setState(value) { currentState = value; }, setPost(value) { currentPost = value; }, setBusy(value) { busy = value; }, setNow(value) { now = value; } };
}

test('search is read-only and explicit selection produces a local copy without saves, provider calls, or timers', async t => {
  const h = harness(t), before = clone(h.state), original = clone(h.post), attempts = [];
  for (const name of ['fetch', 'setTimeout', 'setInterval']) t.mock.method(globalThis, name, () => { attempts.push(name); throw Error(`Unexpected ${name}`); });
  h.controller.search();
  const found = h.controller.snapshot.proposal;
  assert.equal(found.expectedRevision, 7); assert.equal(found.suggestions.length, 3); assert.equal(h.applied.length, 0);
  assert.deepEqual(h.state, before); assert.deepEqual(h.post, original);
  assert.equal(h.controller.choose(0), true); assert.equal(h.applied.length, 1);
  const selected = h.applied[0];
  assert.deepEqual(selected, { ...original, status: 'scheduled', scheduledAt: '2026-11-09T09:00', scheduledInstant: '2026-11-09T08:00:00.000Z', scheduleBinding: { schemaVersion: 1, mode: 'queue', instant: '2026-11-09T08:00:00.000Z', selectedAt: instant, sourceRevision: 7, refs: [{ channelId: 'a', slotId: 'mon09', local: '2026-11-09T09:00', timezone: 'Europe/Berlin', overlapChoice: 'reject', minimumGapMinutes: 30 }] } });
  selected.variantTexts.a = 'Outside mutation'; selected.tags.push('Outside mutation');
  await Promise.resolve();
  assert.deepEqual(h.post, original); assert.deepEqual(h.state, before); assert.deepEqual(attempts, []);
  assert.equal(h.controller.snapshot.proposal, null); assert.equal(h.controller.snapshot.pending, null);
  assert.match(h.controller.snapshot.message, /Erst das Einplanen speichert/);
  assert.equal(h.controller.choose(0), false); assert.equal(h.applied.length, 1);
});

test('multiple channels offer only their common UTC instants across distinct IANA zones', t => {
  const h = harness(t, { initialPost: post({ channels: ['a', 'b'], timeZone: 'Asia/Kathmandu' }) }); h.controller.search();
  const found = h.controller.snapshot.proposal;
  assert.deepEqual(found.channelIds, ['a', 'b']); assert.equal(found.suggestions.length, 3);
  assert.deepEqual(found.suggestions.map(item => item.instant), ['2026-11-09T08:00:00.000Z', '2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
  assert.equal(found.suggestions[0].local, '2026-11-09T13:45');
  assert.deepEqual(found.suggestions[0].refs.map(ref => [ref.channelId, ref.slotId, ref.local]), [['a', 'mon09', '2026-11-09T09:00'], ['b', 'ny03', '2026-11-09T03:00']]);
  assert.equal(h.controller.choose(0), true); assert.equal(h.applied[0].timeZone, 'Asia/Kathmandu');
  assert.equal(inspectScheduleBinding(h.applied[0], h.state.channels).state, 'current');
});

test('an occupied common slot and channel-specific spacing are excluded without moving existing posts', t => {
  const initialState = state();
  initialState.channels[1].postingSchedule = schedule({ minimumGapMinutes: 120 });
  initialState.posts.push(post({ id: 'fixed', status: 'scheduled', scheduledAt: '2026-11-09T09:40', scheduledInstant: '2026-11-09T08:40:00.000Z', channels: ['a'] }));
  const h = harness(t, { initialState, initialPost: post({ channels: ['a', 'b'] }) }), before = clone(h.state.posts);
  h.controller.search(); assert.equal(h.controller.snapshot.proposal.suggestions[0].instant, '2026-11-09T08:00:00.000Z');
  h.state.posts[0].channels = ['b']; h.controller.search();
  assert.equal(h.controller.snapshot.proposal.suggestions[0].instant, '2026-11-09T12:00:00.000Z');
  h.state.posts[0].channels = ['a']; assert.deepEqual(h.state.posts, before); assert.equal(h.applied.length, 0);
});

for (const [name, configure, reason, text] of [
  ['paused channel', value => { value.channels[1].postingSchedule.paused = true; }, 'queue_paused', /pausiert/],
  ['empty channel', value => { value.channels[1].postingSchedule.slots = []; }, 'queue_empty', /fehlen Wochenzeiten/],
  ['disjoint channel', value => { value.channels[1].postingSchedule.slots = [{ id: 'tue', weekday: 2, time: '03:00' }]; }, 'no_shared_slot', /keinen gemeinsamen Zeitpunkt/],
]) {
  test(`${name} produces no fabricated fallback suggestions`, t => {
    const initialState = state(); configure(initialState);
    const h = harness(t, { initialState, initialPost: post({ channels: ['a', 'b'] }) }), before = clone(h.state);
    h.controller.search(); assert.equal(h.controller.snapshot.proposal.reason, reason);
    assert.deepEqual(h.controller.snapshot.proposal.suggestions, []); assert.match(h.controller.snapshot.message, text);
    assert.equal(h.controller.choose(0), false); assert.deepEqual(h.applied, []); assert.deepEqual(h.state, before);
  });
}

test('missing saved rules ask for setup rather than using temporary or default slots', t => {
  const h = harness(t); h.state.channels[0].postingSchedule = null; h.controller.search();
  assert.equal(h.controller.snapshot.proposal, null); assert.match(h.controller.snapshot.message, /Richte zuerst die Posting-Zeiten/);
  assert.equal(h.controller.choose(0), false); assert.deepEqual(h.applied, []);
});

for (const [name, change, expected] of [
  ['revision', h => { h.state.revision++; }, /inzwischen geändert/],
  ['selected channels', h => { h.post.channels = ['a', 'b']; }, /Eingabe hat sich geändert/],
  ['display timezone', h => { h.post.timeZone = 'UTC'; }, /Eingabe hat sich geändert/],
  ['post identity', h => { h.post.id = 'different'; }, /Eingabe hat sich geändert/],
  ['local planned time', h => { h.post.scheduledAt = '2026-11-10T10:00'; }, /Eingabe hat sich geändert/],
  ['canonical planned instant', h => { h.post.scheduledInstant = '2026-11-10T09:00:00.000Z'; }, /Eingabe hat sich geändert/],
  ['saved rules', h => { h.state.channels[0].postingSchedule.minimumGapMinutes = 120; }, /Posting-Zeiten wurden geändert/],
  ['channel timezone', h => { h.state.channels[0].postingSchedule.timezone = 'UTC'; }, /Posting-Zeiten wurden geändert/],
  ['saved pause', h => { h.state.channels[0].postingSchedule.paused = true; }, /Posting-Zeiten wurden geändert/],
]) {
  test(`${name} changes invalidate displayed suggestions before applying`, t => {
    const h = harness(t); h.controller.search(); assert.ok(h.controller.snapshot.proposal.suggestions.length);
    change(h); const before = clone(h.post), planning = clone(h.state);
    assert.equal(h.controller.choose(0), false); assert.equal(h.controller.snapshot.proposal, null); assert.equal(h.controller.snapshot.pending, null);
    assert.match(h.controller.snapshot.message, expected); assert.deepEqual(h.applied, []);
    assert.deepEqual(h.post, before); assert.deepEqual(h.state, planning);
    assert.equal(h.controller.choose(0, { confirmed: true }), false);
  });
}

test('selection rechecks newly occupied slots even if revision has not changed', t => {
  const h = harness(t); h.controller.search();
  h.state.posts.push(post({ id: 'newly_occupied', status: 'scheduled', scheduledAt: '2026-11-09T09:00', scheduledInstant: '2026-11-09T08:00:00.000Z' }));
  const before = clone(h.state);
  assert.equal(h.controller.choose(0), false); assert.match(h.controller.snapshot.message, /inzwischen belegt/);
  assert.equal(h.controller.snapshot.proposal, null); assert.deepEqual(h.applied, []); assert.deepEqual(h.state, before);
});

test('selection rejects a suggestion that elapsed since search', t => {
  const h = harness(t); h.controller.search(); h.setNow(h.controller.snapshot.proposal.suggestions[0].instant);
  assert.equal(h.controller.choose(0), false); assert.match(h.controller.snapshot.message, /inzwischen verstrichen/);
  assert.equal(h.controller.snapshot.proposal, null); assert.deepEqual(h.applied, []);
});

test('replacing an existing fixed appointment requires confirmation for that exact displayed choice', t => {
  const h = harness(t, { initialPost: post({ status: 'scheduled', scheduledAt: '2026-11-10T10:00', scheduledInstant: '2026-11-10T09:00:00.123Z' }) }), original = clone(h.post);
  h.controller.search();
  assert.equal(h.controller.choose(0, { confirmed: true }), false); assert.deepEqual(h.applied, []);
  assert.equal(h.controller.choose(0), false); assert.equal(h.controller.snapshot.pending, 0);
  assert.match(h.controller.snapshot.message, /erst nach deiner Bestätigung/); assert.deepEqual(h.post, original);
  assert.equal(h.controller.choose(1, { confirmed: true }), false); assert.deepEqual(h.applied, []);
  assert.equal(h.controller.choose(0, { confirmed: true }), true); assert.equal(h.applied.length, 1);
  assert.equal(h.applied[0].scheduledInstant, '2026-11-09T08:00:00.000Z'); assert.deepEqual(h.post, original);
});

test('new search or explicit invalidation cancels a pending appointment-replacement confirmation', t => {
  const h = harness(t, { initialPost: post({ status: 'scheduled', scheduledAt: '2026-11-10T10:00', scheduledInstant: '2026-11-10T09:00:00.000Z' }) });
  h.controller.search(); h.controller.choose(0); h.controller.search();
  assert.equal(h.controller.snapshot.pending, null); assert.equal(h.controller.choose(0, { confirmed: true }), false);
  h.controller.choose(0); h.controller.invalidate();
  assert.equal(h.controller.snapshot.pending, null); assert.equal(h.controller.snapshot.proposal, null);
  assert.equal(h.controller.choose(0, { confirmed: true }), false); assert.deepEqual(h.applied, []);
});

test('snapshot changes also cancel a pending confirmed replacement', t => {
  const h = harness(t, { initialPost: post({ status: 'scheduled', scheduledAt: '2026-11-10T10:00', scheduledInstant: '2026-11-10T09:00:00.000Z' }) });
  h.controller.search(); h.controller.choose(0); h.state.revision++;
  assert.equal(h.controller.choose(0, { confirmed: true }), false); assert.deepEqual(h.applied, []);
  assert.equal(h.controller.snapshot.pending, null); assert.equal(h.controller.snapshot.proposal, null);
});

test('reselecting the identical canonical instant does not manufacture a replacement prompt', t => {
  const h = harness(t, { initialPost: post({ status: 'scheduled', scheduledAt: '2026-11-09T09:00', scheduledInstant: '2026-11-09T08:00:00.000Z' }) });
  h.controller.search(); assert.equal(h.controller.choose(0), true);
  assert.equal(h.applied[0].scheduledInstant, h.post.scheduledInstant); assert.equal(h.controller.snapshot.pending, null);
});

test('spring DST gaps are skipped with an explicit warning and never silently shifted', t => {
  const initialState = state(); initialState.channels[0].postingSchedule = schedule({ slots: [{ id: 'sun0230', weekday: 0, time: '02:30' }] });
  const h = harness(t, { initialState, initialNow: '2027-03-27T00:00:00.000Z' }); h.controller.search();
  const found = h.controller.snapshot.proposal;
  assert.ok(found.warnings.some(value => value.code === 'DST_GAP' && value.local === '2027-03-28T02:30'));
  assert.equal(found.suggestions[0].local, '2027-04-04T02:30');
  assert.ok(found.suggestions.every(value => !value.local.startsWith('2027-03-28')));
  assert.equal(h.controller.choose(0), true); assert.equal(h.applied[0].scheduledInstant, '2027-04-04T00:30:00.000Z');
});

test('fall DST folds default to rejection with a visible ambiguity warning', t => {
  const initialState = state(); initialState.channels[0].postingSchedule = schedule({ slots: [{ id: 'sun0230', weekday: 0, time: '02:30' }] });
  const h = harness(t, { initialState, initialNow: '2027-10-30T00:00:00.000Z' }); h.controller.search();
  const found = h.controller.snapshot.proposal;
  assert.ok(found.warnings.some(value => value.code === 'DST_AMBIGUOUS' && value.local === '2027-10-31T02:30'));
  assert.equal(found.suggestions[0].local, '2027-11-07T02:30');
  assert.ok(found.suggestions.every(value => !value.local.startsWith('2027-10-31'))); assert.deepEqual(h.applied, []);
});

for (const [policy, expected] of [['earlier', '2027-10-31T00:30:00.000Z'], ['later', '2027-10-31T01:30:00.000Z']]) {
  test(`explicit ${policy} fold policy preserves the exact UTC instant and binding on apply`, t => {
    const initialState = state(); initialState.channels[0].postingSchedule = schedule({ overlapChoice: policy, slots: [{ id: 'sun0230', weekday: 0, time: '02:30' }] });
    const h = harness(t, { initialState, initialNow: '2027-10-30T00:00:00.000Z' }); h.controller.search();
    assert.equal(h.controller.snapshot.proposal.suggestions[0].instant, expected);
    assert.equal(h.controller.snapshot.proposal.warnings.length, 0); assert.equal(h.controller.choose(0), true);
    const chosen = h.applied[0]; assert.equal(chosen.scheduledAt, '2027-10-31T02:30'); assert.equal(chosen.scheduledInstant, expected);
    assert.equal(normalizeScheduleBinding(chosen.scheduleBinding).instant, expected);
    assert.equal(chosen.scheduleBinding.refs[0].overlapChoice, policy); assert.equal(inspectScheduleBinding(chosen, h.state.channels).state, 'current');
  });
}

test('busy state blocks search and selection; invalidation removes stale candidates', t => {
  const h = harness(t); h.setBusy(true); const changes = h.changes.length;
  h.controller.search(); assert.equal(h.changes.length, changes); assert.equal(h.controller.snapshot.proposal, null);
  h.setBusy(false); h.controller.search(); const found = h.controller.snapshot.proposal;
  h.setBusy(true); assert.equal(h.controller.choose(0), false); h.controller.search();
  assert.deepEqual(h.controller.snapshot.proposal, found); assert.deepEqual(h.applied, []);
  h.controller.invalidate(); assert.equal(h.controller.snapshot.proposal, null);
  h.setBusy(false); assert.equal(h.controller.choose(0), false); h.controller.search(); assert.equal(h.controller.choose(0), true);
});

test('reset and destroy cannot apply stale suggestions or emit after disposal', t => {
  const h = harness(t); h.controller.search(); h.controller.reset();
  assert.equal(h.controller.snapshot.proposal, null); assert.equal(h.controller.snapshot.pending, null);
  assert.equal(h.controller.choose(0), false); assert.match(h.controller.snapshot.message, /gespeicherten Kanalzeiten/);
  h.controller.search(); const changes = h.changes.length; h.controller.destroy(); h.controller.destroy();
  h.controller.search(); h.controller.reset(); h.controller.invalidate();
  assert.equal(h.controller.choose(0), false); assert.equal(h.changes.length, changes); assert.deepEqual(h.applied, []);
  assert.equal(h.controller.snapshot.proposal, null);
});

test('invalid indices and mutated returned snapshots cannot choose an invented slot', t => {
  const h = harness(t); h.controller.search(); const found = h.controller.snapshot.proposal;
  found.suggestions[0].instant = '2030-01-01T00:00:00.000Z'; found.channelIds.push('invented');
  for (const index of [-1, 3, 0.5, NaN, '0', Infinity]) assert.equal(h.controller.choose(index), false);
  assert.deepEqual(h.applied, []); assert.equal(h.controller.choose(0), true);
  assert.equal(h.applied[0].scheduledInstant, '2026-11-09T08:00:00.000Z'); assert.deepEqual(h.applied[0].channels, ['a']);
});
