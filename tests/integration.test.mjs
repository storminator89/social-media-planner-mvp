import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalHandler } from '../server/handler.mjs';
import { createPlannerClient } from '../modules/data/client.mjs';
import { createTaktStore } from '../modules/data/takt-adapter.mjs';

const channels = [{ id: 'linkedin', name: 'LinkedIn', color: '#2866aa', limit: 3000 }];
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGMsTLjBQApgIkn1qIZRDUNKAwBGMgHJ6tENZAAAAABJRU5ErkJggg==', 'base64'));
const post = (extra = {}) => ({ id: 'post-1', text: 'Integrationstest', channels: ['linkedin'], status: 'scheduled', scheduledAt: '2027-01-15T10:30', timeZone: 'Europe/Berlin', media: null, cover: null, createdAt: '2026-11-07T09:00:00.000Z', updatedAt: '2026-11-07T09:00:00.000Z', ...extra });
const request = (path = '/api/planner/state', options = {}) => new Request('http://localhost:3000' + path, options);
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'takt-test-'));
  let app = createLocalHandler({ directory });
  t.after(async () => { app.close(); await rm(directory, { recursive: true, force: true }); });
  const fetcher = (path, options) => app.fetch(request(path, options));
  return { client: createPlannerClient({ fetcher }), request: (...args) => app.fetch(...args), restart() { app.close(); app = createLocalHandler({ directory }); }, directory };
}
function store(client) { return createTaktStore({ client, timezone: 'Europe/Berlin', channels }); }

test('empty local profile is truthful and has no seeded social accounts or demo posts', async t => {
  const s = await setup(t), state = await s.client.load();
  assert.equal(state.revision, 0); assert.deepEqual(state.posts, []); assert.deepEqual(state.channels, []);
  assert.equal(state.capabilities.authentication, 'none-local-demo');
  assert.equal(state.capabilities.durableStorage, 'local-sqlite');
  assert.equal(state.capabilities.automaticPublishing, false);
});

test('UI adapter persists UTC + IANA and survives actual database reopening', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  const saved = await ui.save({ ...initial, posts: [post()] });
  assert.equal(saved.posts[0].scheduledAt, '2027-01-15T10:30');
  let data = await s.client.load();
  assert.equal(data.posts[0].scheduledAt, '2027-01-15T09:30:00.000Z');
  assert.equal(data.posts[0].timezone, 'Europe/Berlin');
  s.restart(); data = await s.client.load();
  assert.equal(data.posts[0].body, 'Integrationstest'); assert.equal(data.revision, 1);
});

test('uploaded image persists on disk, private URL survives reload and is never stored as data URL', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  const saved = await ui.save({ ...initial, posts: [post({ media: { dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, name: 'test.png', type: 'image/png', alt: 'Ein Testpixel' } })] });
  const medium = saved.posts[0].media;
  assert.match(medium.url, /^\/api\/planner\/media\//); assert.equal(medium.dataUrl, undefined);
  assert.equal((await s.client.load()).media.length, 1);
  s.restart();
  const bytes = await s.request(request(medium.url));
  assert.equal(bytes.status, 200); assert.deepEqual(new Uint8Array(await bytes.arrayBuffer()), png);
  const reloaded = await store(s.client).load(); assert.equal(reloaded.posts[0].media.alt, 'Ein Testpixel');
});

test('two stale UI stores produce 409 without overwriting the winning edit', async t => {
  const s = await setup(t), one = store(s.client), two = store(s.client);
  const a = await one.load(), b = await two.load();
  await one.save({ ...a, posts: [post({ text: 'Erste Fassung' })] });
  await assert.rejects(two.save({ ...b, posts: [post({ text: 'Veraltete Fassung' })] }), error => error.status === 409 && error.code === 'REVISION_CONFLICT');
  assert.equal((await s.client.load()).posts[0].body, 'Erste Fassung');
});

test('gap and ambiguous wall times fail rather than changing the intended time', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  await assert.rejects(ui.save({ ...initial, posts: [post({ scheduledAt: '2027-03-28T02:30' })] }), e => e.code === 'DST_GAP');
  await assert.rejects(ui.save({ ...initial, posts: [post({ scheduledAt: '2027-10-31T02:30' })] }), e => e.code === 'DST_AMBIGUOUS');
  assert.equal((await s.client.load()).revision, 0);
});

test('local host rejects spoofed principal, cross-site requests and foreign Host', async t => {
  const s = await setup(t);
  assert.equal((await s.request(request(undefined, { headers: { 'oai-authenticated-user-id': 'victim' } }))).status, 400);
  assert.equal((await s.request(request(undefined, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))).status, 403);
  assert.equal((await s.request(request(undefined, { headers: { Origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await s.request(new Request('https://evil.example/api/planner/state'))).status, 421);
});

test('media signature, CSRF marker and foreign references are enforced through local HTTP handler', async t => {
  const s = await setup(t);
  const invalid = await s.request(request('/api/planner/media', { method: 'POST', headers: { 'X-Planner-Request': '1', 'Content-Type': 'image/png' }, body: '<html>not a PNG</html>' }));
  assert.equal(invalid.status, 415);
  const missing = await s.request(request('/api/planner/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(missing.status, 403);
  assert.equal((await s.request(request('/api/planner/media/not-mine'))).status, 404);
});

test('rich channel variants are rejected by simple view without destructive flattening', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  await ui.save({ ...initial, posts: [post()] });
  const data = await s.client.load(); data.posts[0].variants[0].format = 'reel';
  await s.client.save(data);
  await assert.rejects(store(s.client).load(), error => error.code === 'UI_SCHEMA_UNSUPPORTED');
  assert.equal((await s.client.load()).posts[0].variants[0].format, 'reel');
});

test('static route cannot expose local database, source or out-of-root symlinks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'takt-static-'));
  const publicDirectory = join(directory, 'public'); await mkdir(publicDirectory);
  await writeFile(join(publicDirectory, 'index.html'), '<h1>Local prototype</h1>');
  await writeFile(join(directory, 'secret.js'), 'private local source');
  await symlink(join(directory, 'secret.js'), join(publicDirectory, 'escape.js'));
  const app = createLocalHandler({ directory: join(directory, 'db'), publicDirectory });
  t.after(async () => { app.close(); await rm(directory, { recursive: true, force: true }); });
  const good = await app.fetch(request('/')); assert.equal(good.status, 200); assert.match(await good.text(), /prototype/);
  for (const path of ['/.local/planner.sqlite', '/server/dev.mjs', '/escape.js', '/%2e%2e%2fsecret.js']) assert.equal((await app.fetch(request(path))).status, 404);
});

test('all actual UI module imports are served as JavaScript without colliding with API routes', async t => {
  const s = await setup(t), pending = ['/bootstrap.mjs'], seen = new Set();
  const page = await s.request(request('/'));
  assert.equal(page.status, 200); assert.match(await page.text(), /src="\.\/bootstrap\.mjs"/);
  while (pending.length) {
    const path = pending.pop(); if (seen.has(path)) continue; seen.add(path);
    const response = await s.request(request(path));
    assert.equal(response.status, 200, path); assert.match(response.headers.get('Content-Type'), /javascript/, path);
    const source = await response.text();
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) pending.push(new URL(match[1], 'http://localhost:3000' + path).pathname);
  }
  assert.ok(seen.has('/workflows/workflows.mjs')); assert.ok(seen.has('/data-client/client.mjs')); assert.ok(seen.has('/app.js'));
});

test('simple UI save preserves hidden editorial title and per-channel status note verbatim', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  await ui.save({ ...initial, posts: [post()] });
  const data = await s.client.load();
  data.posts[0].title = 'Separater redaktioneller Titel';
  data.posts[0].variants[0].statusNote = 'Noch auf interne Rückmeldung warten.';
  await s.client.save(data);
  const editor = store(s.client), editable = await editor.load();
  editable.posts[0].text = 'Geänderter Beitragstext';
  await editor.save(editable);
  const saved = await s.client.load();
  assert.equal(saved.posts[0].body, 'Geänderter Beitragstext');
  assert.equal(saved.posts[0].title, 'Separater redaktioneller Titel');
  assert.equal(saved.posts[0].variants[0].statusNote, 'Noch auf interne Rückmeldung warten.');
});

test('image without a target channel fails before upload or state mutation', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  const draft = post({ status: 'draft', scheduledAt: null, channels: [], media: { dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, name: 'test.png', type: 'image/png', alt: 'Test' } });
  await assert.rejects(ui.save({ ...initial, posts: [draft] }), error => error.code === 'MEDIA_TARGET_REQUIRED');
  const saved = await s.client.load(); assert.equal(saved.revision, 0); assert.deepEqual(saved.media, []); assert.deepEqual(saved.posts, []);
});

test('existing image cannot disappear by removing every channel during a simple save', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  const saved = await ui.save({ ...initial, posts: [post({ status: 'draft', scheduledAt: null, media: { dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, name: 'test.png', type: 'image/png', alt: 'Test' } })] });
  saved.posts[0].channels = [];
  await assert.rejects(ui.save(saved), error => error.code === 'MEDIA_TARGET_REQUIRED');
  const current = await s.client.load(); assert.equal(current.revision, 1); assert.equal(current.posts[0].variants[0].mediaIds.length, 1); assert.equal(current.media.length, 1);
});

test('partial snapshots cannot silently clear posts, channels or settings', async t => {
  const s = await setup(t), ui = store(s.client), initial = await ui.load();
  await ui.save({ ...initial, posts: [post()] });
  for (const omitted of ['posts','channels','settings']) {
    const data = await s.client.load(); delete data[omitted];
    await assert.rejects(s.client.save(data), error => error.status === 400);
    const after = await s.client.load(); assert.equal(after.revision, 1); assert.equal(after.posts[0].body, 'Integrationstest');assert.equal(after.channels.length,1);
  }
});

test('integrated variants preserve explicit empty/equal values and independent edits across reopen',async t=>{
  const s=await setup(t),ui=store(s.client),initial=await ui.load();
  const saved=await ui.save({...initial,posts:[post({status:'draft',scheduledAt:null,variantTexts:{linkedin:''}})]});
  assert.deepEqual(saved.posts[0].variantTexts,{linkedin:''});
  saved.posts[0].variantTexts.linkedin=saved.posts[0].text;await ui.save(saved);s.restart();
  const editor=store(s.client),loaded=await editor.load();assert.deepEqual(loaded.posts[0].variantTexts,{linkedin:'Integrationstest'});
  loaded.posts[0].text='Neue Basis';await editor.save(loaded);let data=await s.client.load();assert.equal(data.posts[0].variants[0].body,'Integrationstest');assert.equal(data.posts[0].variants[0].inheritsBody,false);
  const again=await editor.load();again.posts[0].variantTexts={};await editor.save(again);data=await s.client.load();assert.equal(data.posts[0].variants[0].body,'Neue Basis');assert.equal(data.posts[0].variants[0].inheritsBody,true);
});

test('same-revision legacy API writes fail without clearing the variant planner',async t=>{
  const s=await setup(t),ui=store(s.client),initial=await ui.load();await ui.save({...initial,posts:[post({variantTexts:{linkedin:'Eigener Text'}})]});
  const current=await s.client.load();await assert.rejects(s.client.save({...current,schemaVersion:1,posts:[]}),error=>error.status===409&&error.code==='STATE_SCHEMA_CHANGED');assert.deepEqual(await s.client.load(),current);
});
