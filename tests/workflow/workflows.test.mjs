import test from 'node:test';
import assert from 'node:assert/strict';
import { createPost, resolveVariant, editPost, markSaved, validatePost, transitionPost, resolveLocalTime, dateKeyAt, monthGrid, publishingEligibility, summarizeDelivery, retryableTargets, createAutosaver, createLocalStore } from '../../modules/workflows/workflows.mjs';

const fixture = () => createPost({ id: 'p1', text: 'Hallo Welt', targets: [{ id: 'a1', channel: 'example' }] });
const caps = { example: { maxText: 100, maxMedia: 4, mediaTypes: ['image', 'video'], publishingVerified: true } };
const saved = post => markSaved(post, post.revision);
const context = { now: '2026-11-07T00:00:00.000Z', capabilities: caps };
const plan = { type: 'plan', date: '2026-11-08', time: '09:00', timeZone: 'Europe/Berlin' };
const throwsCode = (fn, code) => assert.throws(fn, error => error.code === code);

test('a custom empty caption is not silently replaced by the base', () => {
  const post = fixture(); post.targets[0].overrides.text = '';
  assert.equal(resolveVariant(post, 'a1').text, '');
  assert.equal(resolveVariant(post, 'a1').custom, true);
});
test('base changes preserve custom variants and invalidate approval/plan', () => {
  const post = fixture(); post.targets[0].overrides.text = 'Eigenständig'; post.review = { status: 'approved', revision: 1 }; post.plan = plan;
  const next = editPost(post, { base: { text: 'Neue Basis' } });
  assert.equal(resolveVariant(next, 'a1').text, 'Eigenständig'); assert.equal(next.review, null); assert.equal(next.plan, null); assert.equal(next.revision, 2); assert.equal(post.revision, 1);
});
test('validation is target-specific and distinguishes warnings', () => {
  const post = fixture(); post.base.text = 'x'.repeat(101); post.base.media = [{ id: 'm1', type: 'image', state: 'ready', alt: '' }];
  const issues = validatePost(post, caps);
  assert.ok(issues.some(i => i.targetId === 'a1' && i.code === 'TEXT_TOO_LONG' && i.severity === 'error'));
  assert.ok(issues.some(i => i.code === 'ALT_MISSING' && i.severity === 'warning'));
});
test('unknown provider rules are disclosed and not invented', () => assert.ok(validatePost(fixture()).some(i => i.code === 'RULES_UNKNOWN')));
test('provider text counters can override code point counts', () => {
  const rules = { example: { maxText: 3, countText: () => 4 } }; assert.ok(validatePost(fixture(), rules).some(i => i.code === 'TEXT_TOO_LONG'));
});
test('no targets and duplicate targets block validation', () => {
  const p = fixture(); p.targets = []; assert.equal(validatePost(p)[0].code, 'NO_TARGETS');
  p.targets = [{ id: 'a', channel: 'example' }, { id: 'a', channel: 'example' }]; assert.ok(validatePost(p, caps).some(i => i.code === 'DUPLICATE_TARGET'));
});
test('unsaved content cannot be planned', () => throwsCode(() => transitionPost(fixture(), plan, context), 'UNSAVED'));
test('a saved editorial plan never implies automatic publication', () => {
  const p = transitionPost(saved(fixture()), plan, context);
  assert.equal(p.stage, 'planned'); assert.equal(p.plan.mode, 'editorial_only'); assert.equal(p.plan.instant, '2026-11-08T08:00:00.000Z'); assert.deepEqual(p.deliveries, []);
});
test('approval requires the current requested revision and an identified reviewer', () => {
  const post = saved(fixture()); post.requireReview = true;
  throwsCode(() => transitionPost(post, plan, context), 'APPROVAL_REQUIRED');
  throwsCode(() => transitionPost(post, { type: 'approve' }, context), 'REVIEW_STALE');
  const review = transitionPost(post, { type: 'request_review' }, context);
  throwsCode(() => transitionPost(review, { type: 'approve' }, context), 'REVIEWER_REQUIRED');
  const approved = transitionPost(review, { type: 'approve' }, { ...context, reviewerId: 'editor' });
  assert.equal(transitionPost(approved, plan, context).stage, 'planned');
});
test('change requests require a useful reason', () => {
  const review = transitionPost(saved(fixture()), { type: 'request_review' }, context);
  throwsCode(() => transitionPost(review, { type: 'request_changes', reason: ' ' }), 'REASON_REQUIRED');
  assert.equal(transitionPost(review, { type: 'request_changes', reason: 'Link prüfen' }).review.reason, 'Link prüfen');
});
test('past times reject and trash can be restored', () => {
  const p = saved(fixture()); throwsCode(() => transitionPost(p, { ...plan, date: '2026-11-06' }, context), 'PAST_TIME');
  const removed = transitionPost(p, { type: 'trash' }, context);
  throwsCode(() => transitionPost(removed, plan, context), 'POST_DELETED');
  assert.equal(transitionPost(removed, { type: 'restore' }).deletedAt, null);
});
test('old save acknowledgements cannot mark a newer revision as saved', () => {
  const p = editPost(saved(fixture()), { base: { text: 'Neu' } });
  assert.equal(markSaved(p, 1).savedRevision, 1); throwsCode(() => markSaved(p, 5), 'INVALID_REVISION');
});
test('Berlin DST gap is rejected', () => throwsCode(() => resolveLocalTime('2027-03-28', '02:30', 'Europe/Berlin'), 'DST_GAP'));
test('Berlin repeated hour needs an explicit choice', () => {
  throwsCode(() => resolveLocalTime('2027-10-31', '02:30', 'Europe/Berlin'), 'DST_AMBIGUOUS');
  assert.equal(resolveLocalTime('2027-10-31', '02:30', 'Europe/Berlin', 'earlier').instant, '2027-10-31T00:30:00.000Z');
  assert.equal(resolveLocalTime('2027-10-31', '02:30', 'Europe/Berlin', 'later').instant, '2027-10-31T01:30:00.000Z');
});
test('New York DST and date boundaries are independent of host timezone', () => {
  throwsCode(() => resolveLocalTime('2027-03-14', '02:30', 'America/New_York'), 'DST_GAP');
  assert.equal(resolveLocalTime('2026-11-08', '00:30', 'America/New_York').instant, '2026-11-08T05:30:00.000Z');
  assert.equal(dateKeyAt('2026-11-02T00:30:00.000Z', 'America/Los_Angeles'), '2026-11-01');
});
test('non-hour offset and half-hour DST transitions resolve correctly', () => {
  assert.equal(resolveLocalTime('2026-11-08', '09:00', 'Asia/Kathmandu').instant, '2026-11-08T03:15:00.000Z');
  throwsCode(() => resolveLocalTime('2027-10-03', '02:15', 'Australia/Lord_Howe'), 'DST_GAP');
  throwsCode(() => resolveLocalTime('2027-04-04', '01:45', 'Australia/Lord_Howe'), 'DST_AMBIGUOUS');
});
test('invalid dates, 24:00 and unknown zones reject instead of normalizing', () => {
  for (const [date, time] of [['2026-02-30', '09:00'], ['2026-11-08', '24:00'], ['2026-11-08', '09:60']]) throwsCode(() => resolveLocalTime(date, time, 'UTC'), 'INVALID_LOCAL_TIME');
  throwsCode(() => resolveLocalTime('2026-11-08', '09:00', 'Moon/Sea'), 'INVALID_TIMEZONE');
});
test('month grid is complete at Sunday boundaries and leap February', () => {
  const may = monthGrid(2026, 5, 0); assert.equal(may.length, 42); assert.equal(may[0].date, '2026-04-26'); assert.equal(may.at(-1).date, '2026-06-06');
  assert.equal(monthGrid(2028, 2).filter(d => d.inMonth).length, 29);
  assert.equal(monthGrid(2026, 11)[0].date, '2026-10-26');
});
test('provider availability is separate from editorial planning', () => {
  const post = transitionPost(saved(fixture()), plan, context);
  assert.equal(publishingEligibility(post).eligible, false);
  assert.equal(publishingEligibility(post, { capabilities: caps, accounts: { a1: { connected: true } }, executorReady: true }).eligible, true);
  assert.equal(publishingEligibility(post, { capabilities: caps, accounts: { a1: { connected: false } }, executorReady: true }).eligible, false);
});
test('partial success and uncertain delivery outcomes do not become total failure', () => {
  assert.equal(summarizeDelivery([]), 'not_sent');
  assert.equal(summarizeDelivery([{ status: 'published' }, { status: 'failed' }]), 'partially_published');
  assert.equal(summarizeDelivery([{ status: 'published' }, { status: 'unknown' }]), 'needs_reconciliation');
  assert.equal(summarizeDelivery([{ status: 'published' }, { status: 'sending' }]), 'in_progress');
});
test('retry excludes successful and unknown targets', () => assert.deepEqual(retryableTargets([{ targetId: 'a', status: 'published', retryable: true }, { targetId: 'b', status: 'unknown', retryable: true }, { targetId: 'c', status: 'failed', retryable: true }]), ['c']));
test('autosave serializes requests and persists the newest snapshot before flush resolves', async () => {
  const writes = [], releases = [];
  const saver = createAutosaver((value, revision) => new Promise(resolve => { writes.push({ value, revision }); releases.push(resolve); }));
  saver.update({ text: 'Eins' }); const flushing = saver.flush();
  saver.update({ text: 'Zwei' }); saver.update({ text: 'Drei' });
  assert.equal(writes.length, 1); releases[0](); await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 2); assert.equal(writes[1].value.text, 'Drei'); releases[1](); await flushing;
  assert.equal(saver.hasUnsavedChanges(), false); assert.equal(saver.getState().savedRevision, 3);
});
test('failed autosave retains dirty work and explicit retry succeeds', async () => {
  let fail = true; const saver = createAutosaver(async () => { if (fail) throw new Error('quota'); });
  saver.update({ text: 'Wichtig' }); await assert.rejects(saver.flush(), /quota/);
  assert.equal(saver.getState().status, 'error'); assert.equal(saver.hasUnsavedChanges(), true);
  fail = false; await saver.flush(); assert.equal(saver.hasUnsavedChanges(), false);
});
test('local storage exceptions propagate and corrupt data remains exportable', () => {
  const quota = createLocalStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  assert.throws(() => quota.save({ schemaVersion: 1, posts: [] }), /quota/);
  const corrupt = createLocalStore({ getItem: () => 'broken', setItem: () => {} });
  throwsCode(() => corrupt.load(), 'STORAGE_CORRUPT'); assert.equal(corrupt.exportRaw(), 'broken');
});
test('local save scope is explicit and round trips', () => {
  let raw = null; const store = createLocalStore({ getItem: () => raw, setItem: (_, value) => { raw = value; } });
  const data = { schemaVersion: 1, posts: [fixture()] }; assert.equal(store.save(data).scope, 'this_browser'); assert.deepEqual(store.load(), data);
});
