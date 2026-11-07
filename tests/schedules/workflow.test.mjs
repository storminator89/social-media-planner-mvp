import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostingSchedule, normalizeScheduleBinding, findNextPostingSlots, selectPostingSlot, inspectScheduleBinding, replacePostingSchedule, detachQueueBinding, validatePostScheduleBinding, scheduleLocalTime, scheduleRestoreDigest } from '../../modules/workflows/posting-schedules.mjs';

const now = '2026-11-09T07:00:00.000Z';
const schedule = extra => ({ schemaVersion: 1, timezone: 'Europe/Berlin', paused: false, minimumGapMinutes: 30, overlapChoice: 'reject', slots: [{ id: 'mon09', weekday: 1, time: '09:00' }, { id: 'mon13', weekday: 1, time: '13:00' }, { id: 'wed09', weekday: 3, time: '09:00' }], ...extra });
const snapshot = () => ({ revision: 7, channels: [{ id: 'a', enabled: true, postingSchedule: schedule() }], posts: [] });
const proposal = (state, options = {}) => findNextPostingSlots(state, { postId: 'p1', channelIds: ['a'], after: now, displayTimezone: 'Europe/Berlin', horizonDays: 14, ...options });
const code = (fn, expected) => assert.throws(fn, error => error.code === expected);
const selected = state => { const found = proposal(state); return selectPostingSlot(state, found, found.suggestions[0], { now }); };
const planned = selection => ({ id: 'p1', body: 'Content', title: 'Keep me', tags: ['  Raw  ', '  Raw  '], stage: 'planned', scheduledAt: selection.scheduledAt, timezone: selection.timezone, variants: selection.channelIds.map(channelId => ({ channelId })), scheduleBinding: selection.scheduleBinding });

test('schedule schema is explicit, sorted, bounded and immutable', () => {
  const original = schedule({ slots: [{ id: 'wed', weekday: 3, time: '09:00' }, { id: 'mon', weekday: 1, time: '13:00' }] });
  const normalized = normalizePostingSchedule(original);
  assert.equal(normalized.slots[0].id, 'mon'); assert.equal(original.slots[0].id, 'wed'); assert.equal(normalizePostingSchedule(null), null);
  code(() => normalizePostingSchedule({ ...original, schemaVersion: 2 }), 'INVALID_SCHEDULE');
  code(() => normalizePostingSchedule({ ...original, minimumGapMinutes: -1 }), 'INVALID_SCHEDULE');
});
test('schedule rejects repeated IDs, repeated times and invalid clocks/zones', () => {
  code(() => normalizePostingSchedule(schedule({ slots: [{ id: 'a', weekday: 1, time: '09:00' }, { id: 'b', weekday: 1, time: '09:00' }] })), 'DUPLICATE_SLOT');
  code(() => normalizePostingSchedule(schedule({ slots: [{ id: 'a', weekday: 1, time: '24:00' }] })), 'INVALID_SCHEDULE');
  code(() => normalizePostingSchedule(schedule({ timezone: '+01:00' })), 'INVALID_TIMEZONE');
});
test('preview has no side effects and picks the next future free slot', () => {
  const state = snapshot(), before = structuredClone(state), found = proposal(state);
  assert.equal(found.suggestions[0].instant, '2026-11-09T08:00:00.000Z'); assert.equal(found.suggestions[0].local, '2026-11-09T09:00'); assert.equal(found.expectedRevision, 7); assert.deepEqual(state, before);
});
test('fixed appointments occupy queues without being queue-bound', () => {
  const state = snapshot(); state.posts.push({ id: 'fixed', stage: 'planned', scheduledAt: '2026-11-09T08:00:00Z', variants: [{ channelId: 'a' }], scheduleBinding: null });
  assert.equal(proposal(state).suggestions[0].local, '2026-11-09T13:00');
});
test('separate channel gaps do not overblock unrelated channels', () => {
  const state = snapshot(); state.channels.push({ id: 'b', postingSchedule: schedule({ minimumGapMinutes: 120 }) });
  state.posts.push({ id: 'busy-a', stage: 'planned', scheduledAt: '2026-11-09T08:40:00Z', variants: [{ channelId: 'a' }] });
  assert.equal(proposal(state, { channelIds: ['a', 'b'] }).suggestions[0].instant, '2026-11-09T08:00:00.000Z');
  state.posts[0].variants = [{ channelId: 'b' }];
  assert.equal(proposal(state, { channelIds: ['a', 'b'] }).suggestions[0].instant, '2026-11-09T12:00:00.000Z');
});
test('minimum spacing boundary and exact-time collisions are explicit', () => {
  const state = snapshot(); state.channels[0].postingSchedule.minimumGapMinutes = 0;
  state.posts.push({ id: 'busy', status: 'scheduled', scheduledAt: '2026-11-09T09:00', timeZone: 'Europe/Berlin', channels: ['a'] });
  assert.equal(proposal(state).suggestions[0].local, '2026-11-09T13:00');
  state.channels[0].postingSchedule.minimumGapMinutes = 30; state.posts[0].scheduledAt = '2026-11-09T09:30';
  assert.equal(proposal(state).suggestions[0].local, '2026-11-09T09:00');
});
test('multi-channel intersection uses absolute time across zones', () => {
  const state = snapshot(); state.channels.push({ id: 'b', postingSchedule: schedule({ timezone: 'America/New_York', slots: [{ id: 'ny03', weekday: 1, time: '03:00' }] }) });
  const found = proposal(state, { channelIds: ['a', 'b'] });
  assert.equal(found.suggestions[0].instant, '2026-11-09T08:00:00.000Z'); assert.equal(found.suggestions[0].refs[1].local, '2026-11-09T03:00');
});
test('missing, paused, empty and disjoint queues have meaningful outcomes', () => {
  const state = snapshot(); state.channels[0].postingSchedule = null;
  code(() => proposal(state), 'SCHEDULE_MISSING');
  state.channels[0].postingSchedule = schedule({ paused: true }); assert.equal(proposal(state).reason, 'queue_paused');
  state.channels[0].postingSchedule = schedule({ slots: [] }); assert.equal(proposal(state).reason, 'queue_empty');
  state.channels[0].postingSchedule = schedule(); state.channels.push({ id: 'b', postingSchedule: schedule({ slots: [{ id: 'tue', weekday: 2, time: '17:00' }] }) });
  assert.equal(proposal(state, { channelIds: ['a', 'b'] }).reason, 'no_shared_slot');
});
test('DST gap is reported and not silently normalized', () => {
  const state = snapshot(); state.channels[0].postingSchedule = schedule({ slots: [{ id: 'sun', weekday: 0, time: '02:30' }] });
  const found = proposal(state, { after: '2027-03-27T00:00:00Z', horizonDays: 3 });
  assert.equal(found.suggestions.length, 0); assert.equal(found.warnings[0].code, 'DST_GAP');
});
test('fold requires explicit saved policy and keeps the exact selected instant', () => {
  const state = snapshot(); state.channels[0].postingSchedule = schedule({ slots: [{ id: 'sun', weekday: 0, time: '02:30' }] });
  let found = proposal(state, { after: '2027-10-30T00:00:00Z', horizonDays: 3 });
  assert.equal(found.warnings[0].code, 'DST_AMBIGUOUS');
  state.channels[0].postingSchedule.overlapChoice = 'later';
  found = proposal(state, { after: '2027-10-30T00:00:00Z', horizonDays: 3 });
  const selection = selectPostingSlot(state, found, found.suggestions[0], { now: '2027-10-30T00:00:00Z' });
  assert.equal(selection.scheduledAt, '2027-10-31T01:30:00.000Z');
  assert.equal(normalizeScheduleBinding(selection.scheduleBinding).instant, selection.scheduledAt);
  const uiPost = { id: 'p1', status: 'scheduled', scheduledAt: selection.local, timeZone: selection.timezone, channels: ['a'], scheduleBinding: selection.scheduleBinding };
  assert.equal(inspectScheduleBinding(uiPost, state.channels).state, 'current');
});
test('half-hour zones and half-hour DST changes are preserved', () => {
  const state = snapshot(); state.channels[0].postingSchedule = schedule({ timezone: 'Australia/Lord_Howe', overlapChoice: 'later', slots: [{ id: 'sun', weekday: 0, time: '01:45' }] });
  const found = proposal(state, { after: '2027-04-03T00:00:00Z', displayTimezone: 'Australia/Lord_Howe', horizonDays: 3 });
  assert.equal(found.suggestions[0].instant, '2027-04-03T15:15:00.000Z');
});
test('old snapshot revision blocks selection without changing state', () => {
  const state = snapshot(), found = proposal(state); state.revision++;
  code(() => selectPostingSlot(state, found, found.suggestions[0], { now }), 'REVISION_CONFLICT'); assert.equal(state.posts.length, 0);
});
test('unsaved rule edits and new occupancy are rechecked on selection', () => {
  const state = snapshot(), found = proposal(state); state.channels[0].postingSchedule.minimumGapMinutes = 60;
  code(() => selectPostingSlot(state, found, found.suggestions[0], { now }), 'SCHEDULE_CHANGED');
  state.channels[0].postingSchedule.minimumGapMinutes = 30;
  state.posts.push({ id: 'busy', stage: 'planned', scheduledAt: found.suggestions[0].instant, variants: [{ channelId: 'a' }] });
  code(() => selectPostingSlot(state, found, found.suggestions[0], { now }), 'SLOT_TAKEN');
});
test('selection must be a shown proposal and must still be in the future', () => {
  const state = snapshot(), found = proposal(state);
  code(() => selectPostingSlot(state, found, { ...found.suggestions[0], local: '2026-11-09T17:00' }, { now }), 'SELECTION_REQUIRED');
  code(() => selectPostingSlot(state, found, found.suggestions[0], { now: found.suggestions[0].instant }), 'PAST_TIME');
});
test('selection does not increment revision, create jobs or publish', () => {
  const state = snapshot(), result = selected(state);
  assert.equal(result.expectedRevision, 7); assert.equal(state.revision, 7); assert.equal(state.posts.length, 0); assert.equal(result.publishedAt, undefined); assert.equal(result.scheduleBinding.mode, 'queue');
});
test('changing a bound slot marks review but preserves every fixed instant and raw metadata', () => {
  const state = snapshot(), bound = planned(selected(state)); state.posts = [bound, { ...bound, id: 'fixed', scheduleBinding: null }];
  const before = structuredClone(state.posts), changed = replacePostingSchedule(state, { channelId: 'a', postingSchedule: schedule({ slots: [{ id: 'mon09', weekday: 1, time: '10:00' }] }), expectedRevision: 7 });
  assert.deepEqual(changed.snapshot.posts, before); assert.equal(changed.snapshot.revision, 7); assert.deepEqual(changed.affected.map(item => item.postId), ['p1']); assert.equal(changed.affected[0].state, 'needs_review');
  assert.equal(inspectScheduleBinding(changed.snapshot.posts[1], changed.snapshot.channels).mode, 'fixed');
});
test('adding unrelated slots does not invalidate an existing selected slot', () => {
  const state = snapshot(); state.posts = [planned(selected(state))];
  const changed = replacePostingSchedule(state, { channelId: 'a', postingSchedule: schedule({ slots: [...schedule().slots, { id: 'fri', weekday: 5, time: '15:00' }] }), expectedRevision: 7 });
  assert.deepEqual(changed.affected, []); assert.equal(inspectScheduleBinding(changed.snapshot.posts[0], changed.snapshot.channels).state, 'current');
});
test('pause or removal requires review but never moves a queued appointment', () => {
  const state = snapshot(); state.posts = [planned(selected(state))];
  for (const changedSchedule of [schedule({ paused: true }), null]) {
    const changed = replacePostingSchedule(state, { channelId: 'a', postingSchedule: changedSchedule, expectedRevision: 7 });
    assert.equal(changed.affected.length, 1); assert.equal(changed.snapshot.posts[0].scheduledAt, state.posts[0].scheduledAt);
  }
});
test('queue detachment requires explicit action and retains date/content', () => {
  const post = planned(selected(snapshot())); code(() => detachQueueBinding(post), 'DETACH_CONFIRMATION_REQUIRED');
  const detached = detachQueueBinding(post, { confirmed: true }); assert.equal(detached.scheduleBinding, null); assert.equal(detached.scheduledAt, post.scheduledAt); assert.deepEqual(detached.tags, post.tags); assert.ok(post.scheduleBinding);
});
test('server binding validation rejects mismatched post instant or target', () => {
  const post = planned(selected(snapshot())); assert.ok(validatePostScheduleBinding(post));
  code(() => validatePostScheduleBinding({ ...post, scheduledAt: '2026-11-10T08:00:00Z' }), 'INVALID_BINDING');
  code(() => validatePostScheduleBinding({ ...post, variants: [{ channelId: 'b' }] }), 'INVALID_BINDING');
  code(() => validatePostScheduleBinding({ ...post, stage: 'draft' }), 'INVALID_BINDING');
});
test('inconsistent multi-channel binding references reject rather than normalize', () => {
  const binding = selected(snapshot()).scheduleBinding;
  code(() => normalizeScheduleBinding({ ...binding, refs: [...binding.refs, { ...binding.refs[0], channelId: 'b', local: '2026-11-09T10:00' }] }), 'INVALID_BINDING');
});
test('invalid existing fixed local time stops false availability', () => {
  const state = snapshot(); state.posts = [{ id: 'bad', status: 'scheduled', channels: ['a'], scheduledAt: '2027-03-28T02:30', timeZone: 'Europe/Berlin' }];
  code(() => proposal(state), 'EXISTING_SCHEDULE_INVALID');
});
test('queue state detects target and stored instant changes', () => {
  const state = snapshot(), post = planned(selected(state));
  assert.ok(inspectScheduleBinding({ ...post, scheduledAt: '2026-11-10T08:00:00Z' }, state.channels).reasons.includes('INSTANT_CHANGED'));
  assert.ok(inspectScheduleBinding({ ...post, variants: [{ channelId: 'b' }] }, state.channels).reasons.includes('TARGETS_CHANGED'));
});
test('calendar display conversion never changes the canonical instant', () => {
  const chosen = '2026-11-09T08:00:00.000Z'; assert.equal(scheduleLocalTime(chosen, 'America/New_York'), '2026-11-09T03:00'); assert.equal(scheduleLocalTime(chosen, 'Asia/Kathmandu'), '2026-11-09T13:45');
});

test('restore identity and binding canonicalization never invoke locale-sensitive comparison',async()=>{
 const previous=String.prototype.localeCompare;let digest;
 try{String.prototype.localeCompare=()=>{throw Error('Locale is not an identity rule')};
  const post={id:'post',variants:[{id:'i',channelId:'linkedin',body:'B'},{id:'I',channelId:'instagram',body:'A'}]};
  digest=await scheduleRestoreDigest(post);assert.equal(post.variants[0].id,'i');
  const bound={schemaVersion:1,mode:'queue',instant:'2099-01-01T09:00:00.000Z',selectedAt:'2098-12-01T00:00:00.000Z',sourceRevision:1,refs:['i','I'].map(channelId=>({channelId,slotId:'slot',local:'2099-01-01T09:00',timezone:'UTC',overlapChoice:'reject',minimumGapMinutes:0}))};
  assert.deepEqual(normalizeScheduleBinding(bound).refs.map(r=>r.channelId),['I','i']);
  assert.deepEqual(normalizePostingSchedule(schedule({slots:[{id:'i',weekday:1,time:'09:00'},{id:'I',weekday:1,time:'08:00'}]})).slots.map(x=>x.id),['I','i']);
 }finally{String.prototype.localeCompare=previous;}
 const canonical='{"id":"post","variants":[{"body":"A","channelId":"instagram","id":"I"},{"body":"B","channelId":"linkedin","id":"i"}]}';
 const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))).map(b=>b.toString(16).padStart(2,'0')).join('');assert.equal(digest,expected);
});
