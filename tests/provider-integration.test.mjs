import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {LocalDatabase} from '../server/storage.mjs';
import {createLocalHandler} from '../server/handler.mjs';
import {createSitesHandler} from '../worker/handler.mjs';
import {ProviderRepository} from '../modules/providers/repository.mjs';
import {normalizeProviderState} from '../public/connections.js';
import {D1TestAdapter,seed} from './providers/support.mjs';
const makeRequest=(owner='alice',path='/api/providers/status',method='GET')=>new Request('https://planner.example'+path,{method,headers:owner?{'oai-authenticated-user-id':owner}:{}});
const tables=['planner_profiles','planner_channels','planner_posts','planner_variants','planner_media'];
const dump=db=>Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY owner_id`).all().map(x=>({...x}))]));
async function v2Directory(t){const directory=await mkdtemp(join(tmpdir(),'takt-v3-upgrade-'));t.after(()=>rm(directory,{recursive:true,force:true}));const db=new DatabaseSync(join(directory,'planner.sqlite'));db.exec('PRAGMA foreign_keys=ON;CREATE TABLE local_migrations(version INTEGER PRIMARY KEY,digest TEXT NOT NULL)');for(const [index,name] of ['0001_planner.sql','0002_variant_inheritance.sql'].entries()){const sql=await readFile(new URL('../server/'+name,import.meta.url),'utf8');db.exec(sql);db.prepare('INSERT INTO local_migrations VALUES (?,?)').run(index+1,createHash('sha256').update(sql).digest('hex'));}seed({sql:db});seed({sql:db},'bob');return {directory,db};}

test('actual LocalDatabase upgrade2→5 preserves all old rows and ledger while provider tables start empty',async t=>{
  const {directory,db}=await v2Directory(t),before=dump(db),ledger=db.prepare('SELECT * FROM local_migrations ORDER BY version').all();db.close();let next=new LocalDatabase(directory);assert.deepEqual(dump(next.sql),before);assert.deepEqual(next.sql.prepare('SELECT * FROM local_migrations WHERE version<3 ORDER BY version').all(),ledger);assert.equal(next.sql.prepare('SELECT COUNT(*) n FROM local_migrations').get().n,5);for(const table of ['planner_provider_connections','planner_publication_jobs'])assert.equal(next.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);const statuses=await new ProviderRepository(next).listConnectionSummaries('alice');assert.ok(statuses.every(s=>s.status==='not_connected'&&s.canPublish===false));next.close();next=new LocalDatabase(directory);assert.deepEqual(dump(next.sql),before);next.close();
});
test('failed migration3 rolls back its schema and ledger without touching earlier data',async t=>{
  const {directory,db}=await v2Directory(t);db.exec('CREATE TABLE planner_publication_jobs(sentinel TEXT);');db.prepare('INSERT INTO planner_publication_jobs VALUES (?)').run('keep me');const before=dump(db);db.close();assert.throws(()=>new LocalDatabase(directory),/already exists/);const after=new DatabaseSync(join(directory,'planner.sqlite'));assert.deepEqual(dump(after),before);assert.equal(after.prepare('SELECT COUNT(*) n FROM local_migrations').get().n,2);assert.equal(after.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='planner_provider_connections'").get().n,0);assert.equal(after.prepare('SELECT sentinel FROM planner_publication_jobs').get().sentinel,'keep me');after.close();
});
test('Worker status→UI normalization is truthful, nonmutating and uses only authenticated owner',async()=>{
  const DB=new D1TestAdapter();seed(DB);const repository=new ProviderRepository(DB);await repository.ensureUnconfiguredConnection('alice','instagram');DB.sql.prepare("UPDATE planner_provider_connections SET status='approval_required',reason_code='USER_AUTHORIZATION_REQUIRED' WHERE owner_id='alice'").run();const before=DB.sql.prepare('SELECT * FROM planner_provider_connections').all();const handler=createSitesHandler();const a=await handler.fetch(makeRequest('alice','/api/providers/status?owner=bob'),{DB});assert.equal(a.status,200);const normalized=normalizeProviderState(await a.json());assert.equal(normalized.providers[0].status,'approval_required');assert.deepEqual(normalized.providers[0].blockerCodes,['USER_AUTHORIZATION_REQUIRED','PUBLISHING_DISABLED']);assert.ok(normalized.providers.every(s=>s.accountLabel===null&&s.canPublish===false));const b=normalizeProviderState(await (await handler.fetch(makeRequest('bob'),{DB})).json());assert.ok(b.providers.every(s=>s.status==='not_connected'));assert.deepEqual(DB.sql.prepare('SELECT * FROM planner_provider_connections').all(),before);assert.equal(DB.sql.prepare('SELECT COUNT(*) n FROM planner_publication_jobs').get().n,0);
});
test('missing provider migration yields503, not invented disconnected status, with normal planning still readable',async()=>{
  const DB=new D1TestAdapter({migrate:false});seed(DB);const handler=createSitesHandler();const response=await handler.fetch(makeRequest(),{DB});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'PROVIDER_STATUS_UNAVAILABLE');assert.equal((await handler.fetch(makeRequest('alice','/api/planner/state'),{DB})).status,200);
});
test('real local endpoint rejects forged identity and never mutates provider preparation state',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'takt-status-local-'));t.after(()=>rm(directory,{recursive:true,force:true}));const local=createLocalHandler({directory});t.after(()=>local.close());let response=await local.fetch(new Request('http://127.0.0.1/api/providers/status'));assert.equal(response.status,200);const state=normalizeProviderState(await response.json());assert.equal(state.providers.length,4);assert.ok(state.providers.every(s=>s.status==='not_connected'));assert.equal((await local.fetch(new Request('http://127.0.0.1/api/providers/status',{headers:{'oai-authenticated-user-id':'forged'}}))).status,400);assert.equal((await local.fetch(new Request('http://127.0.0.1/api/providers/status',{method:'POST'}))).status,405);assert.equal((await local.fetch(new Request('http://127.0.0.1/api/providers/connect',{method:'POST'}))).status,404);const inspect=new DatabaseSync(join(directory,'planner.sqlite'));assert.equal(inspect.prepare('SELECT COUNT(*) n FROM planner_provider_connections').get().n,0);assert.equal(inspect.prepare('SELECT COUNT(*) n FROM planner_publication_jobs').get().n,0);inspect.close();
});
test('actual generated Worker status route matches source without importing any provider publisher',async()=>{
  const module=await import('../dist/server/index.js'),DB=new D1TestAdapter();const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');assert.doesNotMatch(source,/createYouTube|initiateOnce|authorizedFetch|graph\.instagram\.com|api\.linkedin\.com\/rest\/posts|youtube\/v3\/videos/);const response=await module.default.fetch(makeRequest(),{DB});assert.equal(response.status,200);assert.ok(normalizeProviderState(await response.json()).providers.every(p=>p.canPublish===false));
});
