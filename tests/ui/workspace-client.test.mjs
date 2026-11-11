import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  WORKSPACE_POLICY, createWorkspaceClient, normalizeWorkspacePayload,
  normalizeWorkspace, normalizeWorkspaceList, normalizeDiscardReceipt,
  normalizeClosedWorkspace, workspacePayloadEqual, workspaceReceiptMatches,
  closedDiscardMatches,
} from '../../public/workspace-client.js';
import {
  wid, writeId, clone, payload, mutation, workspace, saved, discarded, closed,
  summary, listing, jsonResponse, deferred,
} from './workspace-fixtures.mjs';

test('payload roundtrip preserves raw labels, CRLF, unfinished local schedule and explicit variants', () => {
  const original = payload();
  const normalized = normalizeWorkspacePayload(original);
  assert.deepEqual(normalized, original);
  assert.equal(normalized.localMediaOmitted, true);
  assert.equal(normalized.variantTexts.linkedin, '');
  assert.equal(normalized.variantTexts.instagram, normalized.text);
  original.tags.push('later');
  original.channels.push('youtube');
  original.variantTexts.linkedin = 'later';
  assert.deepEqual(normalized.tags, payload().tags);
  assert.deepEqual(normalized.channels, payload().channels);
  assert.equal(normalized.variantTexts.linkedin, '');
});

test('payload equality ignores object key order but preserves every raw and explicit field', () => {
  const a = payload();
  const b = payload({ variantTexts: { instagram: a.text, linkedin: '' } });
  assert.equal(workspacePayloadEqual(a, b), true);
  for (const change of [
    { title: a.title.trim() }, { tags: [...a.tags].reverse() }, { rawTags: a.rawTags + ' ' },
    { baselineRenderedTags: '' }, { text: a.text.replaceAll('\r\n', '\n') },
    { variantTexts: { instagram: a.text } }, { variantTexts: { linkedin: '' } },
    { channels: [...a.channels].reverse() }, { date: '' }, { time: '' },
    { timeZone: 'Europe/Berlin' }, { cover: 'studio' }, { activeTextTarget: 'base' },
    { localMediaOmitted: false },
  ]) assert.equal(workspacePayloadEqual(a, payload(change)), false, JSON.stringify(change));
  assert.equal(workspacePayloadEqual(a, {}), false);
});

test('planner image reference and omitted local file are the only supported media representations', () => {
  const media = { kind: 'planner_image', id: 'image-1', alt: '  Working alt\r\n' };
  const original = payload({ media, localMediaOmitted: false });
  const normalized = normalizeWorkspacePayload(original);
  assert.deepEqual(normalized.media, media);
  media.alt = 'later';
  assert.equal(normalized.media.alt, '  Working alt\r\n');
  for (const invalid of [
    payload({ media, localMediaOmitted: true }),
    payload({ media: { ...media, url: 'https://example.invalid/image.png' }, localMediaOmitted: false }),
    payload({ media: { ...media, dataUrl: 'data:image/png;base64,AA==' }, localMediaOmitted: false }),
    payload({ media: { ...media, bytes: [1, 2, 3] }, localMediaOmitted: false }),
    payload({ media: new Blob(['synthetic']), localMediaOmitted: false }),
    payload({ media: { kind: 'local_file', id: 'file-1', alt: '' }, localMediaOmitted: false }),
  ]) assert.throws(() => normalizeWorkspacePayload(invalid));
});

test('payload validation is bounded, full-snapshot, well-formed and rejects unknown fields', () => {
  const missing = payload(); delete missing.rawTags;
  for (const invalid of [
    missing, payload({ unexpected: true }), payload({ title: 'x'.repeat(201) }),
    payload({ tags: Array(21).fill('x') }), payload({ tags: ['x'.repeat(61)] }),
    payload({ rawTags: 'x'.repeat(4097) }), payload({ baselineRenderedTags: 'x'.repeat(4097) }),
    payload({ text: 'x'.repeat(20001) }), payload({ text: '\ud800' }),
    payload({ channels: ['linkedin', 'linkedin'] }), payload({ activeTextTarget: 'missing-channel' }),
    payload({ variantTexts: { 'bad/channel': '' } }), payload({ date: 'x'.repeat(33) }),
    payload({ timeZone: 'x'.repeat(101) }), payload({ localMediaOmitted: 'true' }),
    payload({ variantTexts: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`c${i}`, ''])) }),
    payload({ variantTexts: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 'x'.repeat(20000)])) }),
    // Control characters consume six bytes after JSON escaping, not one byte each.
    payload({ text: '\0'.repeat(20000), variantTexts: { linkedin: '\0'.repeat(2000) } }),
    // Multibyte UTF-8 must be counted after encoding, not by string length.
    payload({ text: '界'.repeat(20000), variantTexts: { linkedin: '界'.repeat(20000), instagram: '界'.repeat(20000) } }),
  ]) assert.throws(() => normalizeWorkspacePayload(invalid));
});

test('payload validation does not evaluate accessors or serialize inherited, hidden or symbolic data', () => {
  let invoked = 0;
  const getter = () => { invoked++; return 'dangerous'; };
  const accessor = payload(); Object.defineProperty(accessor, 'title', { enumerable: true, get: getter });
  const hidden = payload(); Object.defineProperty(hidden, 'title', { enumerable: false });
  const symbolic = payload(); symbolic[Symbol('extra')] = 'hidden';
  const inherited = Object.assign(Object.create({ extra: 'inherited' }), payload());
  const variants = payload(); Object.defineProperty(variants.variantTexts, 'linkedin', { enumerable: true, get: getter });
  const hiddenVariant = payload(); Object.defineProperty(hiddenVariant.variantTexts, 'linkedin', { enumerable: false });
  const symbolicVariant = payload(); symbolicVariant.variantTexts[Symbol('extra')] = 'hidden';
  const media = payload({ media: { kind: 'planner_image', id: 'image-1', alt: '' }, localMediaOmitted: false });
  Object.defineProperty(media.media, 'alt', { enumerable: true, get: getter });
  for (const invalid of [accessor, hidden, symbolic, inherited, variants, hiddenVariant, symbolicVariant, media]) {
    assert.throws(() => normalizeWorkspacePayload(invalid));
  }
  assert.equal(invoked, 0);
});

test('payload arrays reject holes, added keys, accessors and inherited array prototypes without reading them', () => {
  let invoked = 0;
  const sparse = payload({ tags: new Array(1) });
  const decorated = payload(); decorated.channels.extra = 'not data';
  const symbolic = payload(); symbolic.tags[Symbol('extra')] = 'not data';
  const accessor = payload({ tags: ['safe'] });
  Object.defineProperty(accessor.tags, '0', { enumerable: true, get() { invoked++; return 'unsafe'; } });
  const inherited = payload({ tags: ['safe'] }); Object.setPrototypeOf(inherited.tags, Object.create(Array.prototype));
  for (const invalid of [sparse, decorated, symbolic, accessor, inherited]) {
    assert.throws(() => normalizeWorkspacePayload(invalid));
  }
  assert.equal(invoked, 0);
});

test('FullDTO preserves both media alts and exposes an explicit, consistent metadata conflict', () => {
  const workingMedia = { kind: 'planner_image', id: 'image-1', alt: '  Working alt\r\n' };
  const resolvedMedia = { id: 'image-1', url: '/api/planner/media/image-1', alt: 'Canonical alt', name: 'synthetic.png', type: 'image/png' };
  const dto = workspace({ payload: payload({ media: workingMedia, localMediaOmitted: false }), resolvedMedia, mediaMetadataConflict: true });
  const normalized = normalizeWorkspace(dto);
  assert.deepEqual(normalized, dto);
  assert.notEqual(normalized.payload.media.alt, normalized.resolvedMedia.alt);
  assert.throws(() => normalizeWorkspace({ ...dto, mediaMetadataConflict: false }));
  assert.throws(() => normalizeWorkspace(workspace({ mediaMetadataConflict: true })));
  const same = workspace({ payload: dto.payload, resolvedMedia: { ...resolvedMedia, alt: workingMedia.alt } });
  assert.equal(normalizeWorkspace(same).mediaMetadataConflict, false);
  dto.payload.media.alt = 'later'; dto.resolvedMedia.alt = 'later';
  assert.equal(normalized.payload.media.alt, '  Working alt\r\n');
  assert.equal(normalized.resolvedMedia.alt, 'Canonical alt');
});

test('FullDTO rejects closed records, extra fields and unsafe or inconsistent resolved media', () => {
  const media = { kind: 'planner_image', id: 'image-1', alt: 'same' };
  const resolvedMedia = { id: 'image-1', url: '/api/planner/media/image-1', alt: 'same', name: 'synthetic.jpg', type: 'image/jpeg' };
  const withMedia = workspace({ payload: payload({ media, localMediaOmitted: false }), resolvedMedia });
  const missingConflict = workspace(); delete missingConflict.mediaMetadataConflict;
  for (const invalid of [
    missingConflict, workspace({ state: 'discarded' }), workspace({ state: 'expired' }),
    workspace({ owner: 'other-owner' }), workspace({ revision: 0 }), workspace({ writeId: null }),
    workspace({ sourcePostId: null, sourceExists: false }), workspace({ sourceExists: null }),
    workspace({ currentPlannerRevision: -1 }), workspace({ expiresAtMs: 1000 }),
    { ...withMedia, resolvedMedia: null }, workspace({ resolvedMedia }),
    { ...withMedia, resolvedMedia: { ...resolvedMedia, url: 'https://example.invalid/image-1' } },
    { ...withMedia, resolvedMedia: { ...resolvedMedia, url: '/api/planner/media/image-1?token=unsafe' } },
    { ...withMedia, resolvedMedia: { ...resolvedMedia, id: 'image-2', url: '/api/planner/media/image-2' } },
    { ...withMedia, resolvedMedia: { ...resolvedMedia, objectKey: 'private-storage-key' } },
    { ...withMedia, resolvedMedia: { ...resolvedMedia, type: 'image/svg+xml' } },
  ]) assert.throws(() => normalizeWorkspace(invalid));
});

test('list enforces active-only summaries, exact retention policy and lifetime capacity arithmetic', () => {
  const data = listing([summary()], 100);
  assert.deepEqual(normalizeWorkspaceList(data), data);
  assert.equal(data.capacity.totalRemaining, 0);
  assert.equal(data.capacity.activeRemaining, 19);
  assert.equal(data.policy.automaticDeletion, false);
  assert.equal(data.policy.retainedAfterClosure, true);
  for (const invalid of [
    { ...data, schemaVersion: 5 }, { ...data, cursor: 'unexpected-pagination' },
    { ...data, policy: { ...data.policy, automaticDeletion: true } },
    { ...data, policy: { ...data.policy, resumeWindowMs: 1 } },
    { ...data, capacity: { ...data.capacity, totalRemaining: 1 } },
    { ...data, capacity: { ...data.capacity, active: 2 } },
    { ...data, workspaces: [summary(workspace({ state: 'expired' }))] },
    { ...data, workspaces: [{ ...summary(), payload: payload() }] },
    { ...data, workspaces: [{ ...summary(), resolvedMedia: null }] },
    listing([summary(), summary()]),
  ]) assert.throws(() => normalizeWorkspaceList(invalid));
});

test('save confirmation binds the exact original mutation, not just its write ID', () => {
  const request = mutation();
  const receipt = saved(request);
  assert.equal(workspaceReceiptMatches(receipt, request), true);
  for (const change of [
    { workspaceId: 'workspace-00000002' }, { revision: 2 }, { writeId: 'operation-00000002' },
    { state: 'discarded' }, { sourcePostId: null }, { basePlannerRevision: 8 },
    { payload: payload({ rawTags: 'different raw input' }) },
    { payload: payload({ localMediaOmitted: false }) },
    { payload: payload({ variantTexts: { instagram: request.payload.text } }) },
  ]) assert.equal(workspaceReceiptMatches({ ...receipt, ...change }, request), false, JSON.stringify(change));
  // These are fresh observations, not the immutable source revision or the submitted content.
  assert.equal(workspaceReceiptMatches({ ...receipt, currentPlannerRevision: 99, sourceExists: false }, request), true);
});

test('discard and closed-readback receipts are minimal and match only an exact discard intent', () => {
  const request = { workspaceId: wid, expectedRevision: 4, writeId };
  const receipt = discarded(request);
  assert.deepEqual(normalizeDiscardReceipt(receipt), receipt);
  assert.equal(workspaceReceiptMatches(receipt, request, 'discard'), true);
  assert.deepEqual(normalizeClosedWorkspace(closed(request)), closed(request));
  assert.equal(closedDiscardMatches(closed(request), request), true);
  for (const change of [
    { workspaceId: 'workspace-00000002' }, { writeId: 'operation-00000002' },
    { state: 'expired' }, { lastOperation: 'expire' },
  ]) {
    assert.equal(workspaceReceiptMatches({ ...receipt, ...change }, request, 'discard'), false);
    assert.equal(closedDiscardMatches(closed(request, change), request), false);
  }
  assert.equal(workspaceReceiptMatches({ ...receipt, revision: 6 }, request, 'discard'), false);
  assert.equal(closedDiscardMatches(closed(request, { currentRevision: 6 }), request), false);
  for (const invalid of [
    { ...receipt, payload: payload() }, { ...receipt, resolvedMedia: null },
    { ...receipt, sourcePostId: 'post-1' }, { ...receipt, lastOperation: 'save' },
  ]) assert.throws(() => normalizeDiscardReceipt(invalid));
  assert.throws(() => normalizeClosedWorkspace({ ...closed(request), payload: payload() }));
});

test('HTTP client uses only fixed same-origin routes and exact mutation envelopes', async () => {
  const calls = [];
  const saveRequest = mutation();
  const discardRequest = { workspaceId: wid, expectedRevision: 1, writeId: 'operation-00000002' };
  const responses = [listing(), { schemaVersion: 1, workspace: workspace() },
    { schemaVersion: 1, workspace: saved(saveRequest) }, { schemaVersion: 1, workspace: discarded(discardRequest) }];
  const client = createWorkspaceClient({ fetcher: async (path, options) => {
    calls.push({ path, options }); return jsonResponse(responses.shift());
  } });
  await client.list({ method: 'DELETE', body: { ignored: true } });
  await client.read(wid, { method: 'POST', body: { ignored: true } });
  await client.save(saveRequest);
  assert.deepEqual(await client.discard(discardRequest), discarded(discardRequest));
  assert.deepEqual(calls.map(c => [c.path, c.options.method]), [
    ['/api/planner/workspaces', 'GET'], [`/api/planner/workspaces/${wid}`, 'GET'],
    [`/api/planner/workspaces/${wid}`, 'PUT'], [`/api/planner/workspaces/${wid}/discard`, 'POST'],
  ]);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers['X-Planner-Request'], '1');
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
  }
  assert.equal(Object.hasOwn(calls[0].options, 'body'), false);
  assert.equal(Object.hasOwn(calls[1].options, 'body'), false);
  const { workspaceId, ...saveBody } = saveRequest;
  assert.deepEqual(JSON.parse(calls[2].options.body), { schemaVersion: 1, ...saveBody });
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    schemaVersion: 4, expectedRevision: 1, writeId: discardRequest.writeId,
  });
});

test('invalid IDs and mutation envelopes fail before fetch and cannot select an origin or endpoint', async () => {
  let calls = 0;
  const client = createWorkspaceClient({ fetcher: async () => { calls++; throw Error('must not fetch'); } });
  for (const id of ['short', '../planner/posts', 'https://example.invalid/workspace', 'workspace-00000001?x=1', 'workspace-00000001#hash', 'a'.repeat(101)]) {
    await assert.rejects(client.read(id));
    await assert.rejects(client.save(mutation({ workspaceId: id })));
    await assert.rejects(client.discard({ workspaceId: id, expectedRevision: 1, writeId }));
  }
  for (const invalid of [mutation({ expectedRevision: -1 }), mutation({ expectedRevision: Number.MAX_SAFE_INTEGER }),
    mutation({ writeId: 'short' }), mutation({ sourcePostId: '../post' }), mutation({ owner: 'untrusted' }),
    mutation({ schemaVersion: 1 }), mutation({ payload: payload({ localMediaOmitted: undefined }) })]) {
    await assert.rejects(client.save(invalid));
  }
  await assert.rejects(client.discard({ workspaceId: wid, expectedRevision: 0, writeId }));
  assert.equal(calls, 0);
});

test('save snapshots the complete request synchronously before its first await', async () => {
  const gate = deferred();
  let encoded;
  const client = createWorkspaceClient({ fetcher: async (_path, options) => { encoded = options.body; return gate.promise; } });
  const request = mutation();
  const original = clone(request);
  const saving = client.save(request);
  request.payload.text = 'later editor text'; request.payload.tags.push('later');
  request.sourcePostId = 'post-2'; request.basePlannerRevision = 99; request.writeId = 'operation-00000002';
  const { workspaceId, ...body } = original;
  assert.deepEqual(JSON.parse(encoded), { schemaVersion: 1, ...body });
  gate.resolve(jsonResponse({ schemaVersion: 1, workspace: saved(original) }));
  assert.deepEqual(await saving, saved(original));
});

test('network errors, 503, missing receipts and malformed successful responses never retry writes', async () => {
  for (const response of [
    () => { throw Error('synthetic transport loss'); },
    () => jsonResponse({ error: { code: 'WORKSPACE_STORAGE_UNCERTAIN' } }, 503),
    () => jsonResponse({ error: { code: 'WORKSPACE_NOT_FOUND' } }, 404),
    () => jsonResponse({ schemaVersion: 1, workspace: null }),
    () => jsonResponse({ schemaVersion: 2, workspace: workspace() }),
    () => new Response('<html>not JSON</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    () => ({ ok: true, redirected: true }),
  ]) {
    let calls = 0;
    const client = createWorkspaceClient({ fetcher: async () => { calls++; return response(); } });
    await assert.rejects(client.save(mutation()));
    assert.equal(calls, 1);
  }
});

test('410 reads expose only validated closed details, never retained draft/media or raw errors', async () => {
  const request = { workspaceId: wid, expectedRevision: 1, writeId };
  let details = closed(request);
  const client = createWorkspaceClient({ fetcher: async () => jsonResponse({
    error: { code: 'WORKSPACE_CLOSED', details, cause: 'SYNTHETIC_SQL_SECRET' },
  }, 410) });
  await assert.rejects(client.read(wid), e => {
    assert.equal(e.status, 410); assert.equal(e.code, 'WORKSPACE_CLOSED');
    assert.deepEqual(e.closed, closed(request));
    assert.equal(Object.hasOwn(e, 'details'), false); assert.equal(Object.hasOwn(e, 'cause'), false);
    assert.doesNotMatch(e.message, /SYNTHETIC_SQL_SECRET/); return true;
  });
  for (const invalid of [{ ...closed(request), payload: payload() }, { ...closed(request), currentRevision: -1 }, {}]) {
    details = invalid;
    await assert.rejects(client.read(wid), e => e.status === 410 && e.closed === undefined);
  }
});

test('abort before sending causes no fetch; abort during sending rejects late successful receipt', async () => {
  const before = new AbortController(); before.abort();
  let calls = 0;
  const gate = deferred(); let transmittedSignal;
  const client = createWorkspaceClient({ fetcher: async (_path, options) => {
    calls++; transmittedSignal = options.signal; return gate.promise;
  } });
  await assert.rejects(client.save(mutation(), { signal: before.signal }));
  assert.equal(calls, 0);
  const during = new AbortController();
  const promise = client.save(mutation(), { signal: during.signal });
  during.abort();
  assert.equal(transmittedSignal.aborted, true);
  gate.resolve(jsonResponse({ schemaVersion: 1, workspace: workspace() }));
  await assert.rejects(promise);
  assert.equal(calls, 1);
});

test('timeout aborts one in-flight request without retrying or creating another request', async () => {
  let calls = 0;
  const client = createWorkspaceClient({ timeoutMs: 5, fetcher: (_path, { signal }) => {
    calls++;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  } });
  await assert.rejects(client.save(mutation()), e => e.name === 'AbortError');
  assert.equal(calls, 1);
});

test('workspace modules have no local persistence, media upload, planner-write or provider fallback', async () => {
  for (const file of ['workspace-client.js', 'workspace-controller.js']) {
    const source = await readFile(new URL(`../../public/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB)\b/);
    assert.doesNotMatch(source, /['"`]\/api\/(?:providers?|oauth|linkedin|youtube|planner\/(?:posts|state|upload))/);
  }
  assert.deepEqual(WORKSPACE_POLICY, {
    activeLimit: 20, totalLimit: 100, maxPayloadBytes: 131072, resumeWindowMs: 2592000000,
    automaticDeletion: false, totalLimitIsLifetime: true, retainedAfterClosure: true,
  });
});
