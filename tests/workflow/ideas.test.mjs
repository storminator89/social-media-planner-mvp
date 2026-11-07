import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdea, updateIdea, normalizeIdeaTags, parseIdeaTags, formatIdeaTags, prepareIdeaDraft, commitIdeaDraft, ideaFingerprint, filterIdeas, ideaLabelCounts } from '../../modules/workflows/ideas.mjs';

const now = '2026-11-09T08:00:00.000Z';
const idea = (extra = {}) => createIdea({ id: 'idea-1', title: 'Eine gute Idee', text: 'Drei Tipps für klare Kommunikation', tags: ['Tipps'], timezone: 'Europe/Berlin', now, ...extra });
const code = (fn, expected) => assert.throws(fn, error => error.code === expected);
const ready = source => {
  const prepared = prepareIdeaDraft(source);
  prepared.draft.channels = ['linkedin'];
  return prepared;
};

test('ideas are genuine unscheduled text records without channels or media', () => {
  const value = idea();
  assert.equal(value.status, 'idea'); assert.deepEqual(value.channels, []); assert.deepEqual(value.variantTexts, {}); assert.equal(value.scheduledAt, null); assert.equal(value.media, null);
});
test('quick capture permits title only or note only, not a blank idea', () => {
  assert.equal(idea({ text: '' }).text, ''); assert.equal(idea({ title: '' }).title, '');
  code(() => idea({ title: ' ', text: '\n' }), 'EMPTY_IDEA');
});
test('idea bounds and malformed metadata fail without truncating content', () => {
  code(() => idea({ title: 'x'.repeat(201) }), 'INVALID_IDEA');
  code(() => idea({ text: 'x'.repeat(20001) }), 'INVALID_IDEA');
  code(() => idea({ id: '../unsafe' }), 'INVALID_IDEA_ID');
  code(() => idea({ timezone: 'Moon/Base' }), 'INVALID_TIMEZONE');
  code(() => idea({ now: '2026-02-30T08:00:00Z' }), 'INVALID_INSTANT');
});
test('tag normalization preserves first spelling while deduplicating Unicode/case equivalents', () => {
  assert.deepEqual(normalizeIdeaTags([' Design ', 'design', 'Cafe\u0301', 'Café']), ['Design', 'Café']);
  code(() => normalizeIdeaTags(['']), 'INVALID_TAGS');
  code(() => normalizeIdeaTags(['x'.repeat(61)]), 'INVALID_TAGS');
  code(() => normalizeIdeaTags(Array.from({ length: 21 }, (_, i) => `Tag${i}`)), 'INVALID_TAGS');
});
test('label input supports everyday comma entry without blank labels', () => {
  assert.deepEqual(parseIdeaTags('Design, Team, , design,'), ['Design', 'Team']);
  assert.deepEqual(parseIdeaTags('  '), []);
});
test('existing labels containing commas or quotes round trip without data loss', () => {
  const tags = ['Design, Team', 'Er sagte "Hallo"', 'Normal'];
  assert.deepEqual(parseIdeaTags(formatIdeaTags(tags)), tags);
  code(() => parseIdeaTags('"Unfertig'), 'INVALID_TAGS');
  code(() => parseIdeaTags('"Fertig"unsicher'), 'INVALID_TAGS');
});
test('editing changes only permitted idea content and leaves source intact', () => {
  const source = idea(), next = updateIdea(source, { text: 'Neue Notiz' }, { now: '2026-11-09T09:00:00Z' });
  assert.equal(next.title, source.title); assert.deepEqual(next.tags, ['Tipps']); assert.equal(next.createdAt, source.createdAt); assert.notEqual(next.updatedAt, source.updatedAt); assert.equal(source.text, 'Drei Tipps für klare Kommunikation');
  code(() => updateIdea(source, { status: 'scheduled' }), 'INVALID_IDEA_PATCH');
});
test('opening the composer has no side effect and requires no channels yet', () => {
  const source = idea(), before = structuredClone(source), result = prepareIdeaDraft(source);
  assert.equal(result.draft.status, 'draft'); assert.deepEqual(result.draft.channels, []); assert.equal(result.draft.id, source.id); assert.deepEqual(source, before);
  result.draft.text = 'Verändert'; assert.notEqual(source.text, result.draft.text);
});
test('title-only capture never silently becomes public-facing post text', () => {
  const source = idea({ text: '' }), prepared = ready(source);
  assert.equal(prepared.draft.text, '');
  code(() => commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now }), 'POST_TEXT_REQUIRED');
});
test('saving prepared text still requires a deliberate target selection', () => {
  const source = idea(), prepared = prepareIdeaDraft(source);
  code(() => commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now }), 'CHANNEL_REQUIRED');
});
test('conversion keeps the same ID and preserves title, tags and creation time', () => {
  const source = idea(), prepared = ready(source), unrelated = idea({ id: 'idea-2', title: 'Andere' });
  const before = structuredClone([source, unrelated]);
  const next = commitIdeaDraft([source, unrelated], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now: '2026-11-10T08:00:00Z' });
  assert.equal(next.length, 2); assert.equal(next[0].id, source.id); assert.equal(next[0].status, 'draft'); assert.equal(next[0].title, source.title); assert.deepEqual(next[0].tags, source.tags); assert.equal(next[0].createdAt, source.createdAt); assert.deepEqual([source, unrelated], before);
});
test('a legacy composer omitting metadata cannot erase title or tags', () => {
  const source = idea(), prepared = ready(source); delete prepared.draft.title; delete prepared.draft.tags;
  const [next] = commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now });
  assert.equal(next.title, source.title); assert.deepEqual(next.tags, source.tags);
});
test('explicit metadata clearing is preserved when note content exists', () => {
  const source = idea(), prepared = ready(source); prepared.draft.title = ''; prepared.draft.tags = [];
  const [next] = commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now });
  assert.equal(next.title, ''); assert.deepEqual(next.tags, []);
});
test('concurrent idea edits refuse stale conversion without deleting either version', () => {
  const source = idea(), prepared = ready(source), changed = updateIdea(source, { text: 'Andere Fassung' }, { now });
  code(() => commitIdeaDraft([changed], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now }), 'IDEA_CHANGED');
  assert.equal(changed.status, 'idea'); assert.equal(prepared.draft.text, source.text);
});
test('deleted or already converted ideas cannot be converted again', () => {
  const source = idea(), prepared = ready(source), options = { sourceFingerprint: prepared.sourceFingerprint, now };
  code(() => commitIdeaDraft([], prepared.draft, options), 'IDEA_CHANGED');
  const next = commitIdeaDraft([source], prepared.draft, options);
  code(() => commitIdeaDraft(next, prepared.draft, options), 'IDEA_CHANGED');
});
test('scheduled conversion requires all channel texts and an unambiguous future time', () => {
  const source = idea(), prepared = ready(source); prepared.draft.status = 'scheduled'; prepared.draft.scheduledAt = '2026-11-10T09:00';
  const [next] = commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now });
  assert.equal(next.status, 'scheduled'); assert.equal(next.scheduledAt, '2026-11-10T09:00'); assert.equal(next.publishedAt, undefined);
  prepared.draft.variantTexts = { linkedin: '' };
  code(() => commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now }), 'CHANNEL_TEXT_REQUIRED');
});
test('past, missing, DST-gap and DST-fold schedules are blocked', () => {
  const source = idea(), prepared = ready(source); prepared.draft.status = 'scheduled';
  const attempt = scheduledAt => commitIdeaDraft([source], { ...prepared.draft, scheduledAt }, { sourceFingerprint: prepared.sourceFingerprint, now });
  code(() => attempt(null), 'SCHEDULE_REQUIRED');
  code(() => attempt('2026-11-08T09:00'), 'PAST_TIME');
  code(() => attempt('2027-03-28T02:30'), 'DST_GAP');
  code(() => attempt('2027-10-31T02:30'), 'DST_AMBIGUOUS');
});
test('draft conversion rejects hidden scheduling and unknown targets', () => {
  const source = idea(), prepared = ready(source);
  code(() => commitIdeaDraft([source], { ...prepared.draft, scheduledAt: '2026-11-10T09:00' }, { sourceFingerprint: prepared.sourceFingerprint, now }), 'DRAFT_HAS_SCHEDULE');
  code(() => commitIdeaDraft([source], prepared.draft, { sourceFingerprint: prepared.sourceFingerprint, now, allowedChannels: ['instagram'] }), 'INVALID_CHANNELS');
});
test('non-ideas or malformed scheduled/media ideas are not silently flattened', () => {
  code(() => prepareIdeaDraft({ ...idea(), status: 'scheduled' }), 'NOT_IDEA');
  code(() => ideaFingerprint({ ...idea(), scheduledAt: '2026-11-10T09:00' }), 'IDEA_HAS_SCHEDULE');
  code(() => prepareIdeaDraft({ ...idea(), media: { id: 'img' } }), 'INVALID_IDEA_STATE');
});
test('search combines title, note and tags literally, with Unicode normalization', () => {
  const first = idea({ title: 'Café', tags: ['Design'] }), second = idea({ id: 'idea-2', title: 'Anderes', tags: ['Team'] });
  assert.deepEqual(filterIdeas([first, second], { query: 'Cafe\u0301 design' }).map(v => v.id), ['idea-1']);
  assert.equal(filterIdeas([first], { query: '.*' }).length, 0);
});
test('idea filters exclude drafts and exact tag filter does not match substrings', () => {
  const first = idea(), draft = { ...idea({ id: 'draft' }), status: 'draft' };
  assert.equal(filterIdeas([first, draft], { tag: 'tip' }).length, 0);
  assert.deepEqual(filterIdeas([first, draft], { tag: 'TIPPS' }).map(p => p.id), ['idea-1']);
});
test('stable sorting and label counts use only actual stored ideas', () => {
  const a = idea({ id: 'a', title: 'Zebra', tags: ['Design', 'Team'] }), b = idea({ id: 'b', title: 'Apfel', tags: ['design'] });
  assert.deepEqual(filterIdeas([a, b], { sort: 'title_asc' }).map(p => p.id), ['b', 'a']);
  assert.deepEqual(ideaLabelCounts([a, b, { ...a, status: 'draft' }]), [{ label: 'Design', count: 2 }, { label: 'Team', count: 1 }]);
});


test('existing metadata is not normalized while formatting, editing notes or committing an idea',()=>{
  const original={...createIdea({id:'metadata',text:'Text',timezone:'UTC'}),title:'Titel\r\nFortsetzung',tags:[' Tag ','A','a','A','Zeile\r\nZwei']};
  assert.equal(formatIdeaTags(original.tags),'" Tag ", A, a, A, "Zeile\r\nZwei"');
  assert.deepEqual(updateIdea(original,{text:'Neue Notiz'}).tags,original.tags);
  const prepared=prepareIdeaDraft(original);const moved=commitIdeaDraft([original],{...prepared.draft,channels:['linkedin']},{sourceFingerprint:prepared.sourceFingerprint});assert.equal(moved[0].title,original.title);assert.deepEqual(moved[0].tags,original.tags);
});
