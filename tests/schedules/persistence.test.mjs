import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { D1TestAdapter, fixture, request } from './support.mjs';
import { PlannerRepository } from '../../modules/data/repository.mjs';
import { handlePlannerRequest } from '../../modules/data/api.mjs';
import { createTaktStore } from '../../modules/data/takt-adapter.mjs';
import { resolveLocalTime } from '../../modules/data/domain.mjs';
import { findNextPostingSlots, selectPostingSlot } from '../../modules/workflows/posting-schedules.mjs';

const rules = () => ({ schemaVersion: 1, timezone: 'Europe/Berlin', paused: false, minimumGapMinutes: 30, overlapChoice: 'reject', slots: [{ id: 'mon09', weekday: 1, time: '09:00' }, { id: 'wed09', weekday: 3, time: '09:00' }] });
const setup = () => { const DB = new D1TestAdapter(); return { DB, repo: new PlannerRepository(DB) }; };
const failCode = (promise, code) => assert.rejects(promise, error => error.code === code);
async function configured(repo) { const state = fixture(); state.posts = []; state.channels[0].postingSchedule = rules(); return repo.save('alice', state); }
function queued(state, { id = 'p1', channels = ['instagram'] } = {}) {
  const found = findNextPostingSlots(state, { postId: id, channelIds: channels, after: '2099-01-01T00:00:00Z', displayTimezone: 'Europe/Berlin' });
  const picked = selectPostingSlot(state, found, found.suggestions[0], { now: '2099-01-01T00:00:00Z' });
  return { id, title: 'Queue', body: 'Hallo', tags: ['  Tag  ', '  Tag  '], stage: 'planned', scheduledAt: picked.scheduledAt, timezone: picked.timezone, scheduleBinding: picked.scheduleBinding, variants: channels.map(channelId => ({ id: `${id}-${channelId}`, channelId, body: 'Hallo', inheritsBody: true, status: 'planned', scheduledAt: picked.scheduledAt, timezone: picked.timezone, mediaIds: [] })) };
}
function clientFor(repo) { let saves = 0; return { get saves() { return saves; }, load: () => repo.load('alice'), save: state => { saves++; return repo.save('alice', state); }, resolveTime: async (local, zone, choice) => ({ scheduledAt: resolveLocalTime(local, zone, choice) }), uploadMedia: () => { throw new Error('unexpected upload'); } }; }
const definitions = [{ id: 'instagram', name: 'Instagram', color: '#aabbcc' }];

test('migration adds null fields to existing records without touching content', async () => {
  const db = new D1TestAdapter({ through: 2 });
  db.sql.exec("INSERT INTO planner_profiles(owner_id,revision,updated_at) VALUES('alice',4,'2026-01-01T00:00:00Z'); INSERT INTO planner_channels(owner_id,id,platform,name) VALUES('alice','instagram','instagram','IG'); INSERT INTO planner_posts(owner_id,id,title,stage,timezone,created_at,updated_at) VALUES('alice','old','Keep','draft','UTC','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');");
  db.sql.exec(readFileSync(new URL('../../server/0008_posting_schedules.sql', import.meta.url), 'utf8'));
  const state = await new PlannerRepository(db).load('alice');
  assert.equal(state.schemaVersion, 3); assert.equal(state.revision, 4); assert.equal(state.channels[0].postingSchedule, null); assert.equal(state.posts[0].scheduleBinding, null); assert.equal(state.posts[0].title, 'Keep');
});
test('APIv2 fails with409 before creating or deleting any records', async () => {
  const { DB, repo } = setup(), initial = fixture(); initial.schemaVersion = 2;
  const response = await handlePlannerRequest(request('/state', { method: 'PUT', body: initial }), { DB });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'STATE_SCHEMA_CHANGED');
  assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM planner_profiles').get().n, 0);
  const saved = await repo.save('alice', fixture());
  await failCode(repo.save('alice', { ...saved, schemaVersion: 2, posts: [] }), 'STATE_SCHEMA_CHANGED'); assert.equal((await repo.load('alice')).posts.length, 1);
});
test('new versions require explicit new fields and reject unknown nested data', async () => {
  const { repo } = setup(), state = fixture(); delete state.channels[0].postingSchedule;
  await failCode(repo.save('alice', state), 'INVALID_STATE');
  state.channels[0].postingSchedule = { ...rules(), secret: 'must-not-disappear' };
  await failCode(repo.save('alice', state), 'INVALID_SCHEDULE');
  state.channels[0].postingSchedule = null; delete state.posts[0].scheduleBinding;
  await failCode(repo.save('alice', state), 'INVALID_STATE');
});
test('posting times and bindings round trip atomically with raw labels', async () => {
  const { repo } = setup(), state = await configured(repo); state.posts.push(queued(state));
  const saved = await repo.save('alice', state), loaded = await repo.load('alice');
  assert.equal(saved.revision, 2); assert.deepEqual(saved, loaded); assert.deepEqual(saved.posts[0].tags, ['  Tag  ', '  Tag  ']); assert.equal(saved.posts[0].scheduleBinding.mode, 'queue'); assert.equal(saved.capabilities.automaticPublishing, false);
});
test('concurrent writers cannot overwrite or erase a winning snapshot', async () => {
  const { repo } = setup(), state = await configured(repo);
  const a = structuredClone(state), b = structuredClone(state); a.settings.timezone = 'Asia/Tokyo'; b.settings.timezone = 'UTC';
  const results = await Promise.allSettled([repo.save('alice', a), repo.save('alice', b)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  const winner = results.find(result => result.status === 'fulfilled').value;
  assert.deepEqual(await repo.load('alice'), winner); assert.equal(winner.revision, 2);
});
test('successful save response comes from the same batch, not a later load', async () => {
  const { DB, repo } = setup(); let loadCount = 0; const original = repo.load.bind(repo); repo.load = async (...args) => { loadCount++; return original(...args); };
  await repo.save('alice', fixture()); assert.equal(loadCount, 1); // one preflight snapshot, no post-commit load
  assert.equal(DB.sql.prepare('SELECT revision FROM planner_profiles WHERE owner_id=?').get('alice').revision, 1);
});
test('same-save double-bookings and new fixed collisions are rejected', async () => {
  const { repo } = setup(), state = await configured(repo); state.posts = [queued(state), queued(state, { id: 'p2' })];
  await failCode(repo.save('alice', state), 'SLOT_TAKEN'); assert.equal((await repo.load('alice')).posts.length, 0);
  state.posts.pop(); const saved = await repo.save('alice', state);
  const fixed = structuredClone(saved.posts[0]); fixed.id = 'fixed'; fixed.scheduleBinding = null; fixed.variants[0].id = 'fixed-v'; saved.posts.push(fixed);
  await failCode(repo.save('alice', saved), 'SLOT_TAKEN'); assert.equal((await repo.load('alice')).posts.length, 1);
});
test('new bindings against paused or removed slots are rejected on the server', async () => {
  const { repo } = setup(), state = await configured(repo); state.posts.push(queued(state));
  state.channels[0].postingSchedule.paused = true; await failCode(repo.save('alice', state), 'SCHEDULE_CHANGED');
  state.channels[0].postingSchedule.paused = false; state.channels[0].postingSchedule.slots = []; await failCode(repo.save('alice', state), 'SCHEDULE_CHANGED');
});
test('unchanged historical binding remains saveable after rule edits and is not moved', async () => {
  const { repo } = setup(); let state = await configured(repo); state.posts.push(queued(state)); state = await repo.save('alice', state);
  const before = state.posts[0].scheduledAt; state.channels[0].postingSchedule.slots[0].time = '11:00';
  const saved = await repo.save('alice', state); assert.equal(saved.posts[0].scheduledAt, before); assert.equal(saved.posts[0].scheduleBinding.instant, before);
});
test('binding mismatches in target, UTC or variant timezone reject', async () => {
  const { repo } = setup(), state = await configured(repo); state.posts.push(queued(state));
  const wrongTime = structuredClone(state); wrongTime.posts[0].scheduledAt = '2099-01-01T00:00:00Z'; await failCode(repo.save('alice', wrongTime), 'INVALID_BINDING');
  const wrongVariant = structuredClone(state); wrongVariant.posts[0].variants[0].timezone = 'UTC'; await failCode(repo.save('alice', wrongVariant), 'INVALID_STATE');
  const unknown = structuredClone(state); unknown.posts[0].scheduleBinding.refs[0].ignored = true; await failCode(repo.save('alice', unknown), 'INVALID_BINDING');
});
test('switching to draft requires explicit null binding and owns no schedule side effect', async () => {
  const { repo } = setup(); let state = await configured(repo); state.posts.push(queued(state)); state = await repo.save('alice', state);
  state.posts[0].stage = 'draft'; state.posts[0].scheduledAt = null; state.posts[0].variants[0].status = 'draft'; state.posts[0].variants[0].scheduledAt = null;
  await failCode(repo.save('alice', state), 'INVALID_BINDING');
  state.posts[0].scheduleBinding = null; assert.equal((await repo.save('alice', state)).posts[0].stage, 'draft');
});
test('owner boundaries include posting configurations and binding records', async () => {
  const { repo } = setup(), state = await configured(repo); state.posts.push(queued(state)); await repo.save('alice', state);
  const other = await repo.load('bob'); assert.equal(other.revision, 0); assert.deepEqual(other.channels, []); assert.deepEqual(other.posts, []);
});
test('UIv3 exposes revision, explicit fields and preserved canonical timestamp', async () => {
  const { repo } = setup(); await repo.save('alice', fixture()); const client = clientFor(repo), store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions });
  const ui = await store.load(); assert.equal(ui.schemaVersion, 3); assert.equal(ui.revision, 1); assert.equal(ui.channels[0].postingSchedule, null); assert.equal(ui.posts[0].scheduleBinding, null); assert.equal(ui.posts[0].scheduledInstant, '2026-11-09T08:00:00.000Z');
  const saved = await store.save(ui); assert.equal(saved.revision, 2);
});
test('old/missing UI fields fail before any save or upload', async () => {
  const { repo } = setup(); await repo.save('alice', fixture()); const client = clientFor(repo), store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions }), ui = await store.load();
  await failCode(store.save({ ...ui, schemaVersion: 1 }), 'UI_SCHEMA_UNSUPPORTED');
  const missing = structuredClone(ui); delete missing.posts[0].scheduleBinding; await failCode(store.save(missing), 'STATE_SCHEMA_CHANGED');
  const noRules = structuredClone(ui); delete noRules.channels[0].postingSchedule; await failCode(store.save(noRules), 'INVALID_SCHEDULE'); assert.equal(client.saves, 0);
});
test('forged UTC override rejects; manual time change must clear the projection', async () => {
  const { repo } = setup(); await repo.save('alice', fixture()); const client = clientFor(repo), store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions }), ui = await store.load();
  ui.posts[0].scheduledAt = '2026-11-10T09:00'; await failCode(store.save(ui), 'UNTRUSTED_SCHEDULE_INSTANT');
  ui.posts[0].scheduledInstant = null; const saved = await store.save(ui); assert.equal(saved.posts[0].scheduledInstant, '2026-11-10T08:00:00.000Z');
});
test('fixed fold seconds/milliseconds survive text edits, deletion and Undo', async () => {
  const { repo } = setup(), state = fixture(); const exact = '2027-10-31T01:30:23.456Z'; state.posts[0].scheduledAt = exact;
  await repo.save('alice', state); const client = clientFor(repo), store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions });
  let ui = await store.load(); assert.equal(ui.posts[0].scheduledAt, '2027-10-31T02:30'); ui.posts[0].text = 'Bearbeitet'; ui = await store.save(ui); assert.equal(ui.posts[0].scheduledInstant, exact);
  const held = structuredClone(ui.posts[0]); ui.posts = []; ui = await store.save(ui); ui.posts.push(held); ui = await store.save(ui); assert.equal(ui.posts[0].scheduledInstant, exact);
});
test('a fresh UI owner receives explicit null channel definitions without a fake connection', async () => {
  const { repo } = setup(), store = createTaktStore({ client: clientFor(repo), timezone: 'Europe/Berlin', channels: definitions });
  const ui = await store.load(); assert.equal(ui.channels[0].postingSchedule, null); assert.equal(ui.channels[0].connectionStatus, 'manual'); assert.equal(ui.revision, 0);
  ui.channels[0].postingSchedule = rules(); assert.ok((await store.save(ui)).channels[0].postingSchedule);
});
test('independent variant appointments occupy their channel even under a draft parent', async () => {
  const { repo } = setup(), state = await configured(repo), candidate = queued(state);
  const independent = { id: 'independent', title: 'Independent', body: 'Text', stage: 'draft', scheduledAt: null, timezone: 'UTC', scheduleBinding: null, variants: [{ id: 'independent-v', channelId: 'instagram', body: 'Text', inheritsBody: true, status: 'planned', scheduledAt: candidate.scheduledAt, timezone: 'Europe/Berlin', mediaIds: [] }] };
  state.posts = [independent, candidate]; await failCode(repo.save('alice', state), 'SLOT_TAKEN');
  state.posts = [independent]; const saved = await repo.save('alice', state);
  const found = findNextPostingSlots(saved, { postId: 'new', channelIds: ['instagram'], after: '2099-01-01T00:00:00Z' });
  assert.notEqual(found.suggestions[0].instant, candidate.scheduledAt);
});
test('independent variant move cannot occupy an unchanged queue reservation', async () => {
  const { repo } = setup(); let state = await configured(repo); state.posts = [queued(state)]; state = await repo.save('alice', state);
  state.posts.push({ id: 'independent', body: 'Text', stage: 'draft', scheduledAt: null, timezone: 'UTC', scheduleBinding: null, variants: [{ id: 'independent-v', channelId: 'instagram', body: 'Text', inheritsBody: true, status: 'planned', scheduledAt: state.posts[0].scheduledAt, timezone: 'Europe/Berlin' }] });
  await failCode(repo.save('alice', state), 'SLOT_TAKEN');
});
test('plannerRevision getter changes only after confirmed load or save', async () => {
  const { repo } = setup(), client = clientFor(repo), store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions });
  assert.equal(store.plannerRevision, null); let ui = await store.load(); assert.equal(store.plannerRevision, 0);
  ui = await store.save(ui); assert.equal(store.plannerRevision, 1);
  const external = await repo.load('alice'); external.settings.timezone = 'UTC'; await repo.save('alice', external);
  assert.equal(store.plannerRevision, 1); await failCode(store.save(ui), 'REVISION_CONFLICT'); assert.equal(store.plannerRevision, 1);
});

async function queueStore() {
  const { DB, repo } = setup(); let state = await configured(repo); state.posts.push(queued(state)); await repo.save('alice', state);
  const client = clientFor(repo), store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions });
  return { DB, repo, client, store, ui: await store.load() };
}
test('queue-bound delete and Undo retain exact binding and consume the proof only on success', async () => {
  const { DB, store, ui } = await queueStore(), held = structuredClone(ui.posts[0]); ui.posts = [];
  const deleted = await store.save(ui); assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM planner_schedule_undo').get().n, 1);
  deleted.posts.push(held); const restored = await store.save(deleted);
  assert.deepEqual(restored.posts[0].scheduleBinding, held.scheduleBinding); assert.equal(restored.posts[0].scheduledInstant, held.scheduledInstant); assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM planner_schedule_undo').get().n, 0);
});
test('queue Undo survives fresh read after independent paused-rule change without rebinding', async () => {
  const { repo, store, ui } = await queueStore(), held = structuredClone(ui.posts[0]); ui.posts = []; await store.save(ui);
  const external = await repo.load('alice'); external.channels[0].postingSchedule.paused = true; await repo.save('alice', external);
  const fresh = await store.load(); fresh.posts.push(held); const restored = await store.save(fresh);
  assert.equal(restored.channels[0].postingSchedule.paused, true); assert.deepEqual(restored.posts[0].scheduleBinding, held.scheduleBinding); assert.equal(restored.posts[0].scheduledInstant, held.scheduledInstant);
});
test('changed content or different ID cannot reuse a deleted-post proof', async () => {
  const { DB, store, ui } = await queueStore(), held = structuredClone(ui.posts[0]); ui.posts = []; const deleted = await store.save(ui);
  deleted.posts = [{ ...held, text: 'Changed' }]; await failCode(store.save(deleted), 'REVISION_CONFLICT');
  deleted.posts = [{ ...held, id: 'different' }]; await failCode(store.save(deleted), 'REVISION_CONFLICT');
  assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM planner_schedule_undo').get().n, 1);
});
test('expired proof cannot authorize queue Undo and fresh reads omit it', async () => {
  const { DB, repo, store, ui } = await queueStore(), held = structuredClone(ui.posts[0]); ui.posts = []; const deleted = await store.save(ui);
  DB.sql.exec('UPDATE planner_schedule_undo SET expires_at=0');
  assert.deepEqual((await repo.load('alice')).restoreProofs, []); deleted.posts.push(held); await failCode(store.save(deleted), 'REVISION_CONFLICT'); assert.equal((await repo.load('alice')).posts.length, 0);
});
test('proof expiry between preflight and CAS is atomically refused', async () => {
  const { DB, repo, store, ui } = await queueStore(), held = structuredClone(ui.posts[0]); ui.posts = []; const deleted = await store.save(ui); deleted.posts.push(held);
  const realBatch = DB.batch.bind(DB); let count = 0;
  DB.batch = async statements => { count++; if (count === 2) DB.sql.exec('UPDATE planner_schedule_undo SET expires_at=0'); return realBatch(statements); };
  await failCode(store.save(deleted), 'RESTORE_EXPIRED'); DB.batch = realBatch;
  const after = await repo.load('alice'); assert.equal(after.posts.length, 0); assert.equal(after.revision, deleted.revision);
});
test('another owner receives no proof and cannot use the original historical binding as Undo', async () => {
  const { repo, store, ui } = await queueStore(); const original = (await repo.load('alice')).posts[0]; ui.posts = []; await store.save(ui);
  let bob = fixture(); bob.posts = []; bob.channels[0].postingSchedule = rules(); bob = await repo.save('bob', bob); bob = await repo.save('bob', bob); bob = await repo.save('bob', bob);
  assert.deepEqual(bob.restoreProofs, []); bob.posts.push(original); await failCode(repo.save('bob', bob), 'REVISION_CONFLICT');
});
test('a newly occupied slot blocks historical Undo without consuming its proof', async () => {
  const { DB, repo, store, ui } = await queueStore(), held = structuredClone(ui.posts[0]); const canonical = (await repo.load('alice')).posts[0]; ui.posts = []; await store.save(ui);
  const changed = await repo.load('alice'); changed.posts.push({ ...canonical, id: 'other', scheduleBinding: null, variants: canonical.variants.map(v => ({ ...v, id: 'other-v' })) }); await repo.save('alice', changed);
  const fresh = await store.load(); fresh.posts.push(held); await failCode(store.save(fresh), 'SLOT_TAKEN'); assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM planner_schedule_undo').get().n, 1);
});
test('lost delete response is reconciled read-only using the matching server proof before Undo', async () => {
  const { repo } = setup(); let state = await configured(repo); state.posts.push(queued(state)); await repo.save('alice', state);
  const base = clientFor(repo); let lose = true;
  const client = { ...base, save: async value => { const saved = await base.save(value); if (lose && value.posts.length === 0) { lose = false; throw new Error('response lost'); } return saved; } };
  const store = createTaktStore({ client, timezone: 'Europe/Berlin', channels: definitions }); let ui = await store.load(); const held = structuredClone(ui.posts[0]); ui.posts = [];
  await assert.rejects(store.save(ui), /response lost/); const proof = (await repo.load('alice')).restoreProofs[0];
  await failCode(store.save(ui), 'REVISION_CONFLICT'); assert.deepEqual((await repo.load('alice')).restoreProofs[0], proof);
  ui = await store.load(); ui.posts.push(held); const restored = await store.save(ui); assert.deepEqual(restored.posts[0].scheduleBinding, held.scheduleBinding);
});
test('failed deletion transactions create no restore proof', async () => {
  const { DB, repo } = await queueStore(); const state = await repo.load('alice');
  DB.sql.exec("CREATE TRIGGER reject_break BEFORE INSERT ON planner_posts WHEN NEW.title='break' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  state.posts = [{ ...state.posts[0], id: 'fixed', title: 'break', scheduleBinding: null, variants: state.posts[0].variants.map(v => ({ ...v, id: 'fixed-v' })) }];
  await assert.rejects(repo.save('alice', state)); assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM planner_schedule_undo').get().n, 0); assert.equal((await repo.load('alice')).posts[0].id, 'p1');
});
test('restore proofs retain at most100 entries and never include a content copy', async () => {
  const { DB, store, ui } = await queueStore(); const epoch = Math.floor(Date.now() / 1000);
  const insert = DB.sql.prepare('INSERT INTO planner_schedule_undo VALUES (?,?,?,?,?)');
  for (let i = 0; i < 100; i++) insert.run('alice', `older-${i}`, '0'.repeat(64), epoch - 10, epoch + 50);
  ui.posts = []; await store.save(ui); const rows = DB.sql.prepare('SELECT * FROM planner_schedule_undo').all();
  assert.equal(rows.length, 100); assert.ok(rows.some(row => row.post_id === 'p1')); assert.deepEqual(Object.keys(rows[0]).sort(), ['deleted_at', 'expires_at', 'owner_id', 'payload_digest', 'post_id']);
});
test('queue-bound fold retains the chosen later instant through delete and Undo', async () => {
  const { repo } = setup(); let state = fixture(); state.posts = []; state.channels[0].postingSchedule = { ...rules(), overlapChoice: 'later', slots: [{ id: 'fold', weekday: 0, time: '02:30' }] }; state = await repo.save('alice', state);
  const lastSunday = new Date(Date.UTC(2099, 10, 0)); lastSunday.setUTCDate(lastSunday.getUTCDate() - lastSunday.getUTCDay());
  const start = new Date(lastSunday.getTime() - 86400000).toISOString();
  const found = findNextPostingSlots(state, { postId: 'fold-post', channelIds: ['instagram'], after: start, displayTimezone: 'Europe/Berlin', horizonDays: 3 });
  const selection = selectPostingSlot(state, found, found.suggestions[0]);
  const post = { id: 'fold-post', body: 'Fold', title: 'Fold', stage: 'planned', scheduledAt: selection.scheduledAt, timezone: selection.timezone, scheduleBinding: selection.scheduleBinding, variants: [{ id: 'fold-v', channelId: 'instagram', inheritsBody: true, status: 'planned', scheduledAt: selection.scheduledAt, timezone: selection.timezone }] };
  state.posts = [post]; await repo.save('alice', state);
  const store = createTaktStore({ client: clientFor(repo), timezone: 'Europe/Berlin', channels: definitions }); let ui = await store.load(); const held = structuredClone(ui.posts[0]);
  assert.equal(held.scheduledAt.slice(11), '02:30'); assert.equal(held.scheduleBinding.refs[0].overlapChoice, 'later');
  ui.posts = []; ui = await store.save(ui); ui.posts.push(held); ui = await store.save(ui);
  assert.equal(ui.posts[0].scheduledInstant, selection.scheduledAt); assert.deepEqual(ui.posts[0].scheduleBinding, held.scheduleBinding);
});
test('bulk32-post exact Undo stays below D1 hundred-parameter limit in one atomic CAS', async () => {
  const { DB, repo } = setup(); let state = await configured(repo);
  state.channels[0].postingSchedule = { ...rules(), timezone: 'UTC', slots: [{ id: 'mon', weekday: 1, time: '09:00' }] };
  const first = new Date(Date.UTC(2099, 0, 1)); first.setUTCDate(first.getUTCDate() + (1 - first.getUTCDay() + 7) % 7);
  state.posts = Array.from({ length: 32 }, (_, index) => {
    const day = new Date(first.getTime() + index * 7 * 86400000).toISOString().slice(0, 10), instant = `${day}T09:00:00.000Z`, id = `bulk-${index}`;
    return { id, title: id, body: 'Text', stage: 'planned', scheduledAt: instant, timezone: 'UTC', scheduleBinding: { schemaVersion: 1, mode: 'queue', instant, selectedAt: new Date().toISOString(), sourceRevision: state.revision, refs: [{ channelId: 'instagram', slotId: 'mon', local: `${day}T09:00`, timezone: 'UTC', overlapChoice: 'reject', minimumGapMinutes: 30 }] }, variants: [{ id: `${id}-v`, channelId: 'instagram', inheritsBody: true, status: 'planned', scheduledAt: instant, timezone: 'UTC' }] };
  });
  state = await repo.save('alice', state); const held = structuredClone(state.posts); state.posts = []; state = await repo.save('alice', state);
  const originalPrepare = DB.prepare.bind(DB); let casBound = 0;
  DB.prepare = sql => { const statement = originalPrepare(sql), bind = statement.bind; statement.bind = function (...values) { assert.ok(values.length <= 100, `D1 binding cap: ${values.length}`); if (sql.startsWith('UPDATE planner_profiles')) casBound = values.length; return bind.call(this, ...values); }; return statement; };
  state.posts = held; const restored = await repo.save('alice', state);
  assert.equal(restored.posts.length, 32); assert.equal(restored.revision, 4); assert.equal(casBound, 8); assert.deepEqual(restored.restoreProofs, []);
});
