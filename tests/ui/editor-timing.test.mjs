import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorTiming } from '../../public/editor-timing.js';
import { createIdea, prepareIdeaDraft, commitIdeaDraft } from '../../public/workflows/ideas.mjs';
import { normalizeScheduleBinding } from '../../public/workflows/posting-schedules.mjs';
import { workspaceRestoreDecision } from '../../public/workspace-restore.js';
import { payload, workspace, clone } from './workspace-fixtures.mjs';

const now = '2027-10-30T00:00:00.000Z';
const binding = (choice = 'later') => ({ schemaVersion: 1, mode: 'queue', instant: choice === 'later' ? '2027-10-31T01:30:00.000Z' : '2027-10-31T00:30:00.000Z', selectedAt: now, sourceRevision: 7, refs: [{ channelId: 'instagram', slotId: 'sun0230', local: '2027-10-31T02:30', timezone: 'Europe/Berlin', overlapChoice: choice, minimumGapMinutes: 30 }] });
const bound = (choice = 'later') => ({ id: 'post-1', status: 'scheduled', channels: ['instagram'], scheduledAt: '2027-10-31T02:30', scheduledInstant: binding(choice).instant, scheduleBinding: binding(choice), timeZone: 'Europe/Berlin' });
const fixed = (scheduledInstant = '2027-10-31T01:30:23.456Z') => ({ ...bound(), scheduleBinding: null, scheduledInstant });
const saveArgs = (post = bound(), extra = {}) => ({ status: post.status, local: post.scheduledAt, zone: post.timeZone, channels: post.channels, ...extra });
const planning = post => ({ schemaVersion: 1, scheduleBinding: clone(post.scheduleBinding), scheduledInstant: post.scheduledInstant });
const recovery = (post = bound(), extra = {}) => payload({ channels: [...post.channels], variantTexts: {}, activeTextTarget: 'base', date: post.scheduledAt.slice(0, 10), time: post.scheduledAt.slice(11), timeZone: post.timeZone, planning: planning(post), ...extra });
const empty = { scheduleBinding: null, scheduledInstant: null };

test('new editors start with explicit null timing and isolated planning snapshots', () => {
  const timing = createEditorTiming(); timing.open();
  assert.deepEqual(timing.snapshot, { ...empty, needsReplan: false }); assert.deepEqual(timing.planning, { schemaVersion: 1, ...empty });
  assert.deepEqual(timing.forSave({ status: 'draft' }), empty);
  timing.open(bound()); const a = timing.snapshot, b = timing.planning;
  a.scheduleBinding.refs[0].slotId = 'mutated'; b.scheduleBinding.refs.length = 0;
  assert.deepEqual(timing.snapshot.scheduleBinding, binding());
});

for (const exact of ['2027-10-31T00:30:23.456Z', '2027-10-31T01:30:59.999Z']) {
  test(`confirmed fixed fold instant ${exact} survives unchanged saves with seconds and milliseconds`, () => {
    const timing = createEditorTiming(), post = fixed(exact), before = clone(post); timing.open(post);
    timing.changed(post.scheduledAt, post.timeZone);
    assert.deepEqual(timing.forSave(saveArgs(post)), { scheduleBinding: null, scheduledInstant: exact });
    assert.deepEqual(timing.forSave(saveArgs(post)), { scheduleBinding: null, scheduledInstant: exact });
    assert.deepEqual(post, before); assert.equal(timing.snapshot.needsReplan, false);
    post.scheduledInstant = 'outside change'; assert.equal(timing.snapshot.scheduledInstant, exact);
  });
}

for (const choice of ['earlier', 'later']) {
  test(`confirmed ${choice} bound fold stays exactly bound, including when opened and saved again`, () => {
    const post = bound(choice), timing = createEditorTiming(); timing.open(post);
    const saved = timing.forSave(saveArgs(post));
    assert.deepEqual(saved, { scheduleBinding: post.scheduleBinding, scheduledInstant: post.scheduledInstant });
    assert.equal(normalizeScheduleBinding(saved.scheduleBinding).instant, post.scheduledInstant);
    saved.scheduleBinding.refs[0].slotId = 'external mutation'; assert.deepEqual(timing.snapshot.scheduleBinding, post.scheduleBinding);
    timing.open({ ...post, ...timing.forSave(saveArgs(post)) }); assert.deepEqual(timing.forSave(saveArgs(post)).scheduleBinding, post.scheduleBinding);
  });
}

test('manual time or zone edits clear a fixed UTC override permanently until a new selection', () => {
  for (const extra of [{ local: '2027-11-01T02:30' }, { zone: 'UTC' }]) {
    const post = fixed(), timing = createEditorTiming(); timing.open(post);
    assert.deepEqual(timing.forSave(saveArgs(post, extra)), empty);
    assert.deepEqual(timing.forSave(saveArgs(post)), empty, 'reverting the visible input cannot restore stale authority');
  }
  const timing = createEditorTiming(), post = fixed(); timing.open(post); timing.changed('2027-11-01T02:30', post.timeZone);
  assert.deepEqual(timing.forSave(saveArgs(post)), empty);
});

test('a queue-bound appointment cannot silently detach on changed local time or target channels', () => {
  const timing = createEditorTiming(), post = bound(); timing.open(post); const before = timing.snapshot;
  for (const extra of [{ local: '2027-11-01T02:30' }, { channels: ['linkedin'] }, { channels: ['instagram', 'linkedin'] }, { channels: ['instagram', 'instagram'] }]) {
    assert.throws(() => timing.forSave(saveArgs(post, extra)), /Slot-Bindung passt nicht mehr/);
    assert.deepEqual(timing.snapshot, before);
  }
  timing.changed('2027-11-01T02:30', 'UTC'); assert.deepEqual(timing.snapshot, before);
  timing.manual(); assert.deepEqual(timing.snapshot, { ...empty, needsReplan: false });
  assert.deepEqual(timing.forSave(saveArgs(post, { local: '2027-11-01T09:00', zone: 'UTC' })), empty);
});

test('channel order alone does not invalidate an otherwise exact multi-channel binding', () => {
  const post = bound(); post.channels.push('linkedin'); post.scheduleBinding.refs.push({ ...clone(post.scheduleBinding.refs[0]), channelId: 'linkedin' });
  const timing = createEditorTiming(); timing.open(post);
  assert.deepEqual(timing.forSave(saveArgs(post, { channels: ['linkedin', 'instagram'] })).scheduleBinding, post.scheduleBinding);
});

test('explicit queue selection replaces old timing without mutating the selected input', () => {
  const timing = createEditorTiming(), chosen = bound('earlier'), before = clone(chosen);
  timing.open(fixed()); timing.select(chosen);
  assert.deepEqual(timing.forSave(saveArgs(chosen)), { scheduleBinding: chosen.scheduleBinding, scheduledInstant: chosen.scheduledInstant });
  chosen.scheduleBinding.refs[0].slotId = 'external mutation'; assert.deepEqual(timing.snapshot.scheduleBinding, before.scheduleBinding);
});

for (const name of ['fixed', 'bound']) {
  test(`same confirmed original ${name} workspace context retains the exact instant without forcing a new plan`, () => {
    const post = name === 'fixed' ? fixed() : bound(), p = recovery(post), w = workspace({ payload: p }), timing = createEditorTiming();
    const before = clone({ post, p, w }); timing.restore(w, p, { source: post });
    assert.equal(timing.snapshot.needsReplan, false); assert.deepEqual(timing.planning, planning(post));
    assert.deepEqual(timing.forSave(saveArgs(post)), { scheduleBinding: post.scheduleBinding, scheduledInstant: post.scheduledInstant });
    assert.deepEqual({ post, p, w }, before);
  });
}

for (const [name, configure] of [
  ['new-copy recovery', ({ options }) => { options.asCopy = true; }],
  ['missing source', ({ options }) => { options.source = null; }],
  ['changed confirmed UTC', ({ options }) => { options.source = bound('earlier'); }],
  ['changed source channels', ({ options }) => { options.source.channels = ['linkedin']; }],
  ['changed restored local time', ({ p }) => { p.date = '2027-11-07'; }],
  ['changed restored zone', ({ p }) => { p.timeZone = 'UTC'; }],
  ['changed binding ref', ({ p }) => { p.planning.scheduleBinding.refs[0].slotId = 'different'; }],
]) {
  test(`${name} preserves the full recovered context but blocks scheduling until deliberate replanning`, () => {
    const source = bound(), p = recovery(source), options = { asCopy: false, source: clone(source) }; configure({ p, options });
    const timing = createEditorTiming(); timing.restore(workspace({ payload: p }), p, options);
    assert.equal(timing.snapshot.needsReplan, true); assert.deepEqual(timing.planning, p.planning);
    assert.throws(() => timing.forSave(saveArgs(source, { local: `${p.date}T${p.time}`, zone: p.timeZone })), /bewusst neu/);
    timing.changed('2027-12-01T10:00', 'UTC'); assert.equal(timing.snapshot.needsReplan, true);
    assert.deepEqual(timing.forSave({ status: 'draft' }), empty);
    assert.equal(timing.snapshot.needsReplan, true, 'saving as draft must not turn the old reservation into authority');
    timing.manual(); assert.deepEqual(timing.snapshot, { ...empty, needsReplan: false });
  });
}

test('stale planner revision requires a copy through the real restore decision and cannot recover a reservation', () => {
  const source = bound(), p = recovery(source), w = workspace({ payload: p, basePlannerRevision: 6, currentPlannerRevision: 7 });
  const decision = workspaceRestoreDecision(w, { posts: [source], revision: 7, allowedChannels: ['instagram'], isTimeZone: () => true, dateAccepts: () => true, timeAccepts: () => true });
  assert.equal(decision.requiresCopy, true); assert.equal(decision.sameSource, false);
  const timing = createEditorTiming(); timing.restore(w, p, { asCopy: decision.requiresCopy, source: decision.source });
  assert.equal(timing.snapshot.needsReplan, true); assert.deepEqual(timing.planning, p.planning);
  assert.throws(() => timing.forSave(saveArgs(source)), /bewusst neu/);
});

test('legacy recovery with a visible date or time requires replanning instead of guessing a fold', () => {
  for (const override of [{}, { date: '', time: '02:30' }, { date: '2027-10-31', time: '' }]) {
    const source = bound(), p = recovery(source, override); delete p.planning;
    const timing = createEditorTiming(); timing.restore(workspace({ payload: p }), p, { source });
    assert.deepEqual(timing.snapshot, { ...empty, needsReplan: true });
    assert.throws(() => timing.forSave(saveArgs(source)), /bewusst neu/);
  }
  const p = recovery(bound(), { date: '', time: '' }); delete p.planning;
  const timing = createEditorTiming(); timing.restore(workspace({ payload: p }), p);
  assert.deepEqual(timing.snapshot, { ...empty, needsReplan: false });
});

test('stale fixed recovery retains seconds and milliseconds for recovery while blocking the old time', () => {
  const source = fixed(), p = recovery(source), timing = createEditorTiming();
  timing.restore(workspace({ payload: p }), p, { asCopy: true, source });
  assert.equal(timing.snapshot.scheduledInstant, source.scheduledInstant); assert.equal(timing.snapshot.needsReplan, true);
  assert.throws(() => timing.forSave(saveArgs(source)), /bewusst neu/);
  timing.select(bound('earlier')); assert.equal(timing.snapshot.needsReplan, false);
  assert.equal(timing.forSave(saveArgs(bound('earlier'))).scheduledInstant, bound('earlier').scheduledInstant);
});

test('saving any editor state as draft explicitly clears binding and UTC timing', () => {
  for (const source of [null, fixed(), bound()]) {
    const timing = createEditorTiming(); timing.open(source);
    assert.deepEqual(timing.forSave({ status: 'draft', local: 'invalid', zone: 'invalid', channels: [] }), empty);
    assert.deepEqual(timing.forSave({ status: 'idea' }), empty);
  }
});

function ideaFixture(choice = 'later') {
  const original = { ...createIdea({ id: 'idea1', title: 'Keep title', text: 'Notizen', tags: ['Original'], timezone: 'Europe/Berlin', now }), scheduleBinding: null, scheduledInstant: null };
  original.tags = ['  Raw  ', '  Raw  '];
  const prepared = prepareIdeaDraft(original, { channels: ['instagram'] });
  return { original, prepared, draft: { ...prepared.draft, ...bound(choice), id: original.id, text: 'Prepared content', variantTexts: { instagram: 'Channel-specific content' } } };
}

for (const choice of ['earlier', 'later']) {
  test(`an idea can become a valid ${choice} fold queue appointment while retaining identity and metadata`, () => {
    const { original, prepared, draft } = ideaFixture(choice), before = clone({ original, draft });
    const other = { ...clone(original), id: 'idea2' }, posts = [original, other];
    const next = commitIdeaDraft(posts, draft, { sourceFingerprint: prepared.sourceFingerprint, now, allowedChannels: ['instagram'] });
    assert.equal(next.length, 2); assert.equal(next[0].id, original.id); assert.equal(next[0].status, 'scheduled');
    assert.equal(next[0].scheduledInstant, binding(choice).instant); assert.deepEqual(next[0].scheduleBinding, binding(choice));
    assert.equal(next[0].scheduledAt, '2027-10-31T02:30'); assert.equal(next[0].title, original.title);
    assert.deepEqual(next[0].tags, original.tags); assert.equal(next[0].createdAt, original.createdAt);
    assert.deepEqual(next[1], other); assert.deepEqual({ original, draft }, before);
  });
}

for (const [name, modify] of [
  ['missing exact UTC', draft => { draft.scheduledInstant = null; }],
  ['other fold occurrence', draft => { draft.scheduledInstant = binding('earlier').instant; }],
  ['mismatched local projection', draft => { draft.scheduledAt = '2027-10-31T03:30'; }],
  ['mismatched display zone', draft => { draft.timeZone = 'UTC'; }],
  ['mismatched binding channels', draft => { draft.scheduleBinding.refs[0].channelId = 'linkedin'; }],
  ['unknown binding fields', draft => { draft.scheduleBinding.extra = true; }],
  ['inconsistent fold policy', draft => { draft.scheduleBinding.refs[0].overlapChoice = 'earlier'; }],
]) {
  test(`idea transition rejects ${name} without changing the original idea or draft`, () => {
    const { original, prepared, draft } = ideaFixture(); modify(draft); const before = clone({ original, draft });
    assert.throws(() => commitIdeaDraft([original], draft, { sourceFingerprint: prepared.sourceFingerprint, now, allowedChannels: ['instagram'] }), error => error.code === 'INVALID_BINDING');
    assert.deepEqual({ original, draft }, before);
  });
}

test('an idea bound to a slot that has elapsed is not accepted as a future plan', () => {
  const { original, prepared, draft } = ideaFixture();
  assert.throws(() => commitIdeaDraft([original], draft, { sourceFingerprint: prepared.sourceFingerprint, now: draft.scheduledInstant }), error => error.code === 'PAST_TIME');
  assert.equal(original.status, 'idea'); assert.equal(original.scheduledInstant, null);
});
