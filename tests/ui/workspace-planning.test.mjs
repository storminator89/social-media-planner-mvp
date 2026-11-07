import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkspacePlanning, normalizeWorkspacePayload, normalizeWorkspace, workspacePayloadEqual, workspaceReceiptMatches, createWorkspaceClient } from '../../public/workspace-client.js';
import { payload, mutation, workspace, saved, clone, jsonResponse } from './workspace-fixtures.mjs';

const instant = '2027-10-31T01:30:00.000Z';
const binding = () => ({ schemaVersion: 1, mode: 'queue', instant, selectedAt: '2027-10-30T00:00:00.000Z', sourceRevision: 7, refs: ['linkedin', 'instagram'].map(channelId => ({ channelId, slotId: `${channelId}_fold`, local: '2027-10-31T02:30', timezone: 'Europe/Berlin', overlapChoice: 'later', minimumGapMinutes: 30 })) });
const planning = () => ({ schemaVersion: 1, scheduledInstant: instant, scheduleBinding: binding() });
const rich = () => payload({ date: '2027-10-31', time: '02:30', timeZone: 'Europe/Berlin', planning: planning() });
const without = (value, key) => { const result = clone(value); delete result[key]; return result; };

test('optional planning roundtrips in full without rewriting reference order or unfinished editorial fields', () => {
  const original = rich(), before = clone(original), normalized = normalizeWorkspacePayload(original);
  assert.deepEqual(normalized, original); assert.deepEqual(normalized.planning.scheduleBinding.refs.map(ref => ref.channelId), ['linkedin', 'instagram']);
  assert.deepEqual(normalizeWorkspace(workspace({ payload: original })).payload, original);
  normalized.planning.scheduleBinding.refs[0].slotId = 'outside'; normalized.planning.scheduledInstant = null;
  assert.deepEqual(original, before);
  const unfinished = payload({ planning: planning() });
  assert.deepEqual(normalizeWorkspacePayload(unfinished), unfinished, 'the workspace preserves raw partial input instead of silently erasing its saved context');
});

test('legacy absence and explicit empty planning remain distinct; neither silently adds or removes context', () => {
  const legacy = payload(), explicit = payload({ planning: { schemaVersion: 1, scheduledInstant: null, scheduleBinding: null } });
  assert.equal(Object.hasOwn(normalizeWorkspacePayload(legacy), 'planning'), false);
  assert.deepEqual(normalizeWorkspacePayload(explicit).planning, explicit.planning);
  assert.equal(workspacePayloadEqual(legacy, explicit), false);
  assert.equal(workspacePayloadEqual(explicit, legacy), false);
  for (const value of [null, undefined, {}, [], '']) assert.throws(() => normalizeWorkspacePayload(payload({ planning: value })));
});

test('fixed planning retains canonical UTC precision without inventing a queue binding', () => {
  const value = { schemaVersion: 1, scheduledInstant: '2027-10-31T01:30:23.456Z', scheduleBinding: null };
  assert.deepEqual(normalizeWorkspacePlanning(value), value);
  assert.deepEqual(normalizeWorkspacePayload(payload({ planning: value })).planning, value);
});

test('planning requires every known field and rejects every unknown field at all nesting levels', () => {
  for (const key of Object.keys(planning())) assert.throws(() => normalizeWorkspacePlanning(without(planning(), key)), key);
  for (const key of Object.keys(binding())) {
    const value = planning(); value.scheduleBinding = without(value.scheduleBinding, key);
    assert.throws(() => normalizeWorkspacePlanning(value), key);
  }
  for (const key of Object.keys(binding().refs[0])) {
    const value = planning(); value.scheduleBinding.refs[0] = without(value.scheduleBinding.refs[0], key);
    assert.throws(() => normalizeWorkspacePlanning(value), key);
  }
  for (const decorate of [v => { v.extra = true; }, v => { v.scheduleBinding.extra = true; }, v => { v.scheduleBinding.refs[0].extra = true; }]) {
    const value = planning(); decorate(value); assert.throws(() => normalizeWorkspacePlanning(value));
  }
});

for (const bad of ['2027-10-31T01:30:00Z', '2027-10-31T01:30:00.000+00:00', '2027-10-31T02:30:00.000+01:00', '2027-10-31T01:30:00.0Z', '2027-02-30T01:30:00.000Z', '2027-10-31T24:30:00.000Z', '2027-10-31T01:30:61.000Z', 'invalid', 123]) {
  test(`noncanonical UTC ${String(bad)} is rejected in fixed, bound, and selected-at context`, () => {
    assert.throws(() => normalizeWorkspacePlanning({ schemaVersion: 1, scheduledInstant: bad, scheduleBinding: null }));
    const at = planning(); at.scheduleBinding.selectedAt = bad; assert.throws(() => normalizeWorkspacePlanning(at));
    const bound = planning(); bound.scheduledInstant = bad; bound.scheduleBinding.instant = bad;
    assert.throws(() => normalizeWorkspacePlanning(bound));
  });
}

test('binding shape, version, source revision, UTC agreement, and target uniqueness are strict', () => {
  const invalid = [
    value => { value.schemaVersion = 2; }, value => { value.scheduleBinding.schemaVersion = 2; },
    value => { value.scheduleBinding.mode = 'fixed'; }, value => { value.scheduleBinding.sourceRevision = -1; },
    value => { value.scheduleBinding.sourceRevision = 1.5; }, value => { value.scheduleBinding.sourceRevision = '7'; },
    value => { value.scheduleBinding.sourceRevision = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.scheduledInstant = null; }, value => { value.scheduledInstant = '2027-10-31T00:30:00.000Z'; },
    value => { value.scheduleBinding.refs = []; }, value => { value.scheduleBinding.refs.push(clone(value.scheduleBinding.refs[0])); },
    value => { value.scheduleBinding.refs = Array.from({ length: 21 }, (_, i) => ({ ...clone(value.scheduleBinding.refs[0]), channelId: `c${i}` })); },
  ];
  for (const mutate of invalid) { const value = planning(); mutate(value); assert.throws(() => normalizeWorkspacePlanning(value)); }
});

test('reference validation rejects malformed IDs, controls, dates, zones, fold rules, and bounds', () => {
  for (const patch of [
    { channelId: '' }, { channelId: 'invalid/id' }, { slotId: 'x'.repeat(101) }, { local: '2027-10-31T02:30\0' },
    { local: '2027-02-30T02:30' }, { local: '2027-10-31T03:30' }, { local: '2027-10-31T02:30:00' },
    { timezone: 'Europe/Berlin\n' }, { timezone: 'Unknown/Zone' }, { timezone: '+01:00' },
    { timezone: '\ud800' }, { overlapChoice: 'automatic' }, { overlapChoice: 'earlier' }, { overlapChoice: 'reject' },
    { minimumGapMinutes: -1 }, { minimumGapMinutes: 1441 }, { minimumGapMinutes: 1.5 }, { minimumGapMinutes: '30' },
  ]) {
    const value = planning(); Object.assign(value.scheduleBinding.refs[0], patch);
    assert.throws(() => normalizeWorkspacePlanning(value), JSON.stringify(patch));
  }
});

test('planning and nested binding descriptors refuse accessors without invoking getters', () => {
  let reads = 0;
  for (const path of [[], ['scheduleBinding'], ['scheduleBinding', 'refs', 0]]) {
    const value = planning(), target = path.reduce((object, key) => object[key], value);
    const key = path.length === 0 ? 'scheduledInstant' : path.length === 1 ? 'instant' : 'local';
    Object.defineProperty(target, key, { enumerable: true, get() { reads++; return 'unsafe'; } });
    assert.throws(() => normalizeWorkspacePlanning(value));
  }
  const p = rich(); Object.defineProperty(p, 'planning', { enumerable: true, get() { reads++; return planning(); } });
  assert.throws(() => normalizeWorkspacePayload(p)); assert.equal(reads, 0);
});

test('planning descriptors refuse inherited, hidden, or symbolic data at every object level', () => {
  for (const location of ['planning', 'binding', 'reference']) for (const kind of ['hidden', 'symbol', 'inherited']) {
    const value = planning();
    let target = location === 'planning' ? value : location === 'binding' ? value.scheduleBinding : value.scheduleBinding.refs[0];
    if (kind === 'hidden') Object.defineProperty(target, Object.keys(target)[0], { enumerable: false });
    if (kind === 'symbol') target[Symbol('extra')] = 'hidden';
    if (kind === 'inherited') Object.setPrototypeOf(target, { inherited: true });
    assert.throws(() => normalizeWorkspacePlanning(value), `${location}: ${kind}`);
  }
});

test('reference arrays reject sparse, decorated, symbolic, accessor, and inherited forms without getter execution', () => {
  let reads = 0;
  for (const decorate of [
    refs => { delete refs[0]; }, refs => { refs.extra = true; }, refs => { refs[Symbol('extra')] = true; },
    refs => { Object.defineProperty(refs, '0', { enumerable: true, get() { reads++; return binding().refs[0]; } }); },
    refs => { Object.defineProperty(refs, '0', { enumerable: false }); },
    refs => { Object.setPrototypeOf(refs, Object.create(Array.prototype)); },
  ]) {
    const value = planning(); decorate(value.scheduleBinding.refs); assert.throws(() => normalizeWorkspacePlanning(value));
  }
  assert.equal(reads, 0);
});

test('equality ignores property insertion order but preserves the precise planning payload and ref order', () => {
  const original = rich(), reordered = clone(original);
  reordered.planning = Object.fromEntries(Object.entries(reordered.planning).reverse());
  reordered.planning.scheduleBinding = Object.fromEntries(Object.entries(reordered.planning.scheduleBinding).reverse());
  reordered.planning.scheduleBinding.refs = reordered.planning.scheduleBinding.refs.map(ref => Object.fromEntries(Object.entries(ref).reverse()));
  assert.equal(workspacePayloadEqual(original, reordered), true);
  for (const mutate of [
    p => { delete p.planning; }, p => { p.planning = { schemaVersion: 1, scheduledInstant: null, scheduleBinding: null }; },
    p => { p.planning.scheduleBinding.refs.reverse(); }, p => { p.planning.scheduleBinding.sourceRevision++; },
    p => { p.planning.scheduleBinding.selectedAt = '2027-10-30T00:01:00.000Z'; },
    p => { p.planning.scheduleBinding.refs[0].slotId = 'changed'; }, p => { p.planning.scheduleBinding.refs[0].minimumGapMinutes++; },
  ]) {
    const different = clone(original); mutate(different); assert.equal(workspacePayloadEqual(original, different), false);
  }
});

test('workspace save receipts require exact timing and ref order instead of silently dropping rich context', () => {
  const request = mutation({ payload: rich() }), receipt = saved(request);
  assert.equal(workspaceReceiptMatches(normalizeWorkspace(receipt), request), true);
  const missing = clone(receipt); delete missing.payload.planning;
  assert.equal(workspaceReceiptMatches(normalizeWorkspace(missing), request), false);
  const reordered = clone(receipt); reordered.payload.planning.scheduleBinding.refs.reverse();
  assert.equal(workspaceReceiptMatches(normalizeWorkspace(reordered), request), false);
  const reset = clone(receipt); reset.payload.planning = { schemaVersion: 1, scheduledInstant: null, scheduleBinding: null };
  assert.equal(workspaceReceiptMatches(normalizeWorkspace(reset), request), false);
  const fixedRequest = mutation({ payload: payload({ planning: { schemaVersion: 1, scheduledInstant: '2027-10-31T01:30:23.456Z', scheduleBinding: null } }) });
  const lostPrecision = saved(fixedRequest); lostPrecision.payload.planning.scheduledInstant = '2027-10-31T01:30:00.000Z';
  assert.equal(workspaceReceiptMatches(normalizeWorkspace(lostPrecision), fixedRequest), false);
});

test('the actual workspace client sends and reads rich context unchanged through the workspace endpoint only', async () => {
  const request = mutation({ payload: rich() }), calls = [];
  const client = createWorkspaceClient({ fetcher: async (url, options) => {
    calls.push({ url, options }); return jsonResponse({ schemaVersion: 1, workspace: saved(request) });
  } });
  const result = await client.save(request);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, `/api/planner/workspaces/${request.workspaceId}`);
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body).payload, request.payload);
  assert.deepEqual(result.payload.planning, request.payload.planning); assert.equal(workspaceReceiptMatches(result, request), true);
  assert.equal(calls[0].options.credentials, 'same-origin'); assert.equal(calls[0].options.redirect, 'error');
});

test('invalid planning is refused before the workspace client transmits a request', async () => {
  const calls = [], client = createWorkspaceClient({ fetcher: async (...args) => { calls.push(args); throw Error('Must not fetch'); } });
  const request = mutation({ payload: rich() }); request.payload.planning.scheduleBinding.refs[0].overlapChoice = 'earlier';
  await assert.rejects(client.save(request), /nicht sicher gelesen/); assert.deepEqual(calls, []);
});
