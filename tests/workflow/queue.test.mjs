import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueueRules, suggestQueueSlots, applyQueueSuggestion, duplicateTaktDraft } from '../../modules/workflows/queue.mjs';

const now = '2026-11-09T07:00:00.000Z'; // Monday, 08:00 Berlin.
const post = () => ({ id: 'p1', text: 'Eine gute Idee', channels: ['linkedin'], status: 'draft', scheduledAt: null, timeZone: 'Europe/Berlin', cover: null, mediaItems:[], createdAt: now, updatedAt: now });
const rule = (channelId = 'linkedin', overrides = {}) => ({ channelId, timezone: 'Europe/Berlin', slots: [{ weekday: 1, time: '09:00' }, { weekday: 1, time: '13:00' }, { weekday: 3, time: '09:00' }], ...overrides });
const opts = overrides => ({ post: post(), posts: [], rules: [rule()], after: now, horizonDays: 14, ...overrides });
const code = (fn, expected) => assert.throws(fn, error => error.code === expected);

test('queue previews are ordered, bounded and do not mutate the draft', () => {
  const input = opts({ limit: 3 }); const before = structuredClone(input);
  const result = suggestQueueSlots(input);
  assert.deepEqual(result.suggestions.map(s => s.local), ['2026-11-09T09:00', '2026-11-09T13:00', '2026-11-11T09:00']);
  assert.equal(result.suggestions[0].instant, '2026-11-09T08:00:00.000Z'); assert.equal(result.suggestions[0].mode, 'editorial_only'); assert.deepEqual(input, before);
});
test('queue never returns a slot equal to or before the supplied clock', () => {
  const result = suggestQueueSlots(opts({ after: '2026-11-09T08:00:00.000Z' }));
  assert.equal(result.suggestions[0].local, '2026-11-09T13:00');
});
test('shared posts only get times matching all selected channel queues', () => {
  const p = post(); p.channels.push('instagram');
  const result = suggestQueueSlots(opts({ post: p, rules: [rule(), rule('instagram', { slots: [{ weekday: 1, time: '13:00' }] })] }));
  assert.equal(result.suggestions[0].local, '2026-11-09T13:00'); assert.deepEqual(result.suggestions[0].channelIds, ['linkedin', 'instagram']);
});
test('channel queues in different zones intersect by instant, not wall time', () => {
  const p = post(); p.channels.push('bluesky');
  const result = suggestQueueSlots(opts({ post: p, rules: [rule(), rule('bluesky', { timezone: 'America/New_York', slots: [{ weekday: 1, time: '03:00' }] })] }));
  assert.equal(result.suggestions[0].instant, '2026-11-09T08:00:00.000Z');
});
test('disjoint channel queues explain why there is no common suggestion', () => {
  const p = post(); p.channels.push('instagram');
  const result = suggestQueueSlots(opts({ post: p, rules: [rule(), rule('instagram', { slots: [{ weekday: 2, time: '13:00' }] })] }));
  assert.deepEqual(result.suggestions, []); assert.equal(result.reason, 'no_shared_slot');
});
test('same-channel collisions and minimum spacing are avoided', () => {
  const busy = { ...post(), id: 'busy', status: 'scheduled', scheduledAt: '2026-11-09T09:15' };
  assert.equal(suggestQueueSlots(opts({ posts: [busy] })).suggestions[0].local, '2026-11-09T13:00');
  busy.scheduledAt = '2026-11-09T09:30';
  assert.equal(suggestQueueSlots(opts({ posts: [busy] })).suggestions[0].local, '2026-11-09T09:00');
});
test('different-channel posts and drafts do not occupy this channel queue', () => {
  const other = { ...post(), id: 'other', channels: ['instagram'], status: 'scheduled', scheduledAt: '2026-11-09T09:00' };
  const draft = { ...post(), id: 'draft', scheduledAt: '2026-11-09T09:00' };
  assert.equal(suggestQueueSlots(opts({ posts: [other, draft] })).suggestions[0].local, '2026-11-09T09:00');
});
test('rescheduling excludes only the current post from occupancy', () => {
  const p = { ...post(), status: 'scheduled', scheduledAt: '2026-11-09T09:00' };
  assert.equal(suggestQueueSlots(opts({ post: p, posts: [p] })).suggestions[0].local, '2026-11-09T09:00');
});
test('invalid existing scheduled times stop availability rather than suggesting false space', () => {
  const busy = { ...post(), id: 'bad', status: 'scheduled', scheduledAt: '2027-03-28T02:30' };
  code(() => suggestQueueSlots(opts({ posts: [busy] })), 'INVALID_EXISTING_TIME');
});
test('paused and empty queues have distinct states', () => {
  assert.equal(suggestQueueSlots(opts({ rules: [rule('linkedin', { paused: true })] })).reason, 'queue_paused');
  assert.equal(suggestQueueSlots(opts({ rules: [rule('linkedin', { slots: [] })] })).reason, 'queue_empty');
});
test('malformed, duplicate and missing queue rules are rejected', () => {
  code(() => normalizeQueueRules([rule(), rule()]), 'INVALID_QUEUE_RULES');
  code(() => normalizeQueueRules([rule('linkedin', { slots: [{ weekday: 1, time: '09:00' }, { weekday: 1, time: '09:00' }] })]), 'DUPLICATE_SLOT');
  code(() => normalizeQueueRules([rule('linkedin', { slots: [{ weekday: 7, time: '24:00' }] })]), 'INVALID_QUEUE_RULES');
  code(() => suggestQueueSlots(opts({ rules: [] })), 'QUEUE_RULE_MISSING');
});
test('DST gap is reported and not silently shifted', () => {
  const result = suggestQueueSlots(opts({ after: '2027-03-27T00:00:00Z', horizonDays: 3, rules: [rule('linkedin', { slots: [{ weekday: 0, time: '02:30' }] })] }));
  assert.equal(result.suggestions.length, 0); assert.equal(result.warnings[0].code, 'DST_GAP');
});
test('DST fold rejects by default and an explicit choice is represented in UTC', () => {
  const options = opts({ after: '2027-10-30T00:00:00Z', horizonDays: 3, timezone: 'UTC', rules: [rule('linkedin', { slots: [{ weekday: 0, time: '02:30' }] })] });
  assert.equal(suggestQueueSlots(options).warnings[0].code, 'DST_AMBIGUOUS');
  options.rules[0].overlapChoice = 'later';
  assert.equal(suggestQueueSlots(options).suggestions[0].instant, '2027-10-31T01:30:00.000Z');
});
test('current UI never receives a fold projection it cannot persist unambiguously', () => {
  const result = suggestQueueSlots(opts({ after: '2027-10-30T00:00:00Z', horizonDays: 3, rules: [rule('linkedin', { slots: [{ weekday: 0, time: '02:30' }], overlapChoice: 'later' })] }));
  assert.equal(result.suggestions.length, 0); assert.equal(result.warnings[0].code, 'DISPLAY_TIME_AMBIGUOUS');
});
test('applying a suggestion is explicit and returns a new scheduled draft without publishing', () => {
  const p = post(), rules = [rule()], suggestion = suggestQueueSlots(opts({ post: p })).suggestions[0];
  const next = applyQueueSuggestion({ post: p, rules, suggestion, now });
  assert.equal(next.status, 'scheduled'); assert.equal(next.scheduledAt, '2026-11-09T09:00'); assert.equal(p.status, 'draft'); assert.equal(next.publishedAt, undefined);
});
test('a slot taken since preview is rejected at application time', () => {
  const p = post(), suggestion = suggestQueueSlots(opts({ post: p })).suggestions[0];
  const busy = { ...post(), id: 'busy', status: 'scheduled', scheduledAt: suggestion.local };
  code(() => applyQueueSuggestion({ post: p, posts: [busy], rules: [rule()], suggestion, now }), 'SLOT_TAKEN');
});
test('changed text, channel variants, rules and spacing invalidate stale suggestions', () => {
  const p = post(), suggestion = suggestQueueSlots(opts({ post: p })).suggestions[0];
  code(() => applyQueueSuggestion({ post: { ...p, text: 'Neu' }, rules: [rule()], suggestion, now }), 'SUGGESTION_STALE');
  code(() => applyQueueSuggestion({ post: { ...p, variantTexts: { linkedin: 'Eigene Fassung' } }, rules: [rule()], suggestion, now }), 'SUGGESTION_STALE');
  code(() => applyQueueSuggestion({ post: p, rules: [rule('linkedin', { paused: true })], suggestion, now }), 'QUEUE_RULE_CHANGED');
  code(() => applyQueueSuggestion({ post: p, rules: [rule()], suggestion, now, minimumGapMinutes: 60 }), 'QUEUE_RULE_CHANGED');
});
test('a suggestion that elapsed while open is rejected', () => {
  const p = post(), suggestion = suggestQueueSlots(opts({ post: p })).suggestions[0];
  code(() => applyQueueSuggestion({ post: p, rules: [rule()], suggestion, now: suggestion.instant }), 'PAST_TIME');
});
test('absolute instants cannot be silently normalized from invalid dates', () => {
  code(() => suggestQueueSlots(opts({ after: '2026-02-30T00:00:00Z' })), 'INVALID_INSTANT');
  code(() => suggestQueueSlots(opts({ after: '2026-11-09T24:00:00Z' })), 'INVALID_INSTANT');
});
test('safe duplication preserves variants and media but removes workflow and outcome evidence', () => {
  const original = { ...post(), title: 'Redaktioneller Titel', tags: ['Kampagne'], variantTexts: { linkedin: '' }, status: 'scheduled', scheduledAt: '2026-11-09T09:00', mediaItems: [{ id: 'img',url:'/api/planner/media/img',alt:'Bild',name:'image.png',type:'image/png' },{id:'img-second',url:'/api/planner/media/img-second',alt:'Zweites Bild',name:'second.png',type:'image/png'}], review: { status: 'approved' }, deliveries: [{ status: 'published' }], publishedAt: now };
  const copy = duplicateTaktDraft(original, { id: 'p2', now });
  assert.equal(copy.status, 'draft'); assert.equal(copy.scheduledAt, null); assert.equal(copy.variantTexts.linkedin, ''); assert.equal(copy.review, undefined); assert.equal(copy.deliveries, undefined); assert.equal(copy.publishedAt, undefined);
  assert.equal(copy.title, original.title); assert.deepEqual(copy.tags, original.tags); copy.tags.push('Neu'); assert.deepEqual(original.tags, ['Kampagne']);
  assert.deepEqual(copy.mediaItems,original.mediaItems);assert.notEqual(copy.mediaItems,original.mediaItems);assert.notEqual(copy.mediaItems[1],original.mediaItems[1]);
  copy.mediaItems[0].alt = 'Anders'; assert.equal(original.mediaItems[0].alt, 'Bild');
});
test('duplicate IDs are rejected rather than overwriting the original', () => code(() => duplicateTaktDraft(post(), { id: 'p1', now }), 'NEW_ID_REQUIRED'));
test('new-state duplicates explicitly clear canonical time and saved queue binding', () => {
  const copied = duplicateTaktDraft({ ...post(), scheduledInstant: now, scheduleBinding: { mode: 'queue' } }, { id: 'copy', now });
  assert.equal(copied.scheduledInstant, null); assert.equal(copied.scheduleBinding, null);
});
test('temporary queue helper cannot silently detach a persisted queue binding', () => {
  const p = { ...post(), scheduleBinding: { mode: 'queue' } }, suggestion = suggestQueueSlots(opts({ post: p })).suggestions[0];
  code(() => applyQueueSuggestion({ post: p, rules: [rule()], suggestion, now }), 'PERSISTED_QUEUE_BINDING');
});
