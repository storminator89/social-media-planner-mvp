import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {LocalDatabase} from '../server/storage.mjs';
import {PlannerRepository} from '../modules/data/repository.mjs';
import {EditorWorkspaceRepository} from '../modules/workspaces/workspace-repository.mjs';
import {createTaktStore as createLegacyStore} from './schedules/fixtures/takt-adapter.mjs';
import {createTaktStore} from '../modules/data/takt-adapter.mjs';
import {createPlannerClient} from '../modules/data/client.mjs';
import {handlePlannerRequest} from '../modules/data/api.mjs';
import {payload} from './ui/workspace-fixtures.mjs';
import {legacyScheduleProjection} from './legacy-migration-projection.mjs';
const names=['0001_planner.sql','0002_variant_inheritance.sql','0003_provider_jobs.sql','0004_oauth_state.sql','0005_provider_credentials.sql','0006_youtube_lifecycle.sql','0007_editor_workspaces.sql'];
const digest=s=>createHash('sha256').update(s).digest('hex');
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
const dump=(db,list=tables(db))=>Object.fromEntries(list.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all().map(row=>({...row}))]));
async function baseline(t){
 const directory=await mkdtemp(join(tmpdir(),'takt-schedule-upgrade-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const db=new DatabaseSync(join(directory,'planner.sqlite'));db.exec('PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(version INTEGER PRIMARY KEY,digest TEXT NOT NULL)');
 for(const [i,name] of names.entries()){const source=await readFile(new URL('../server/'+name,import.meta.url),'utf8');db.exec(source);db.prepare('INSERT INTO local_migrations VALUES(?,?)').run(i+1,digest(source));}
 for(const owner of ['alice','bob']){
  db.prepare("INSERT INTO planner_profiles(owner_id,revision,updated_at) VALUES(?,9,'fixture')").run(owner);
  db.prepare("INSERT INTO planner_channels(owner_id,id,platform,name) VALUES(?,'instagram','instagram','Instagram')").run(owner);
  db.prepare("INSERT INTO planner_posts(owner_id,id,title,body,stage,scheduled_at,timezone,created_at,updated_at) VALUES(?,'post-1','Title','Body','planned','2026-10-25T01:30:17.123Z','Europe/Berlin','fixture','fixture')").run(owner);
  db.prepare("INSERT INTO planner_variants(owner_id,id,post_id,channel_id,body,inherits_body,status,scheduled_at,timezone,status_note) VALUES(?,'variant-1','post-1','instagram','Body',1,'planned','2026-10-25T01:30:17.123Z','Europe/Berlin','Keep note')").run(owner);
  db.prepare("INSERT INTO planner_provider_credentials(site_id,owner_id,provider,connection_id,config_fingerprint,context_fingerprint,created_at_ms,updated_at_ms) VALUES('site',?,'linkedin',?,?,?,1,1)").run(owner,'connection-'+owner,'a'.repeat(64),'b'.repeat(64));
 }
 const adapter=Object.create(LocalDatabase.prototype);adapter.sql=db;
 const repository=new EditorWorkspaceRepository(adapter,{siteId:'fixture'});
 await repository.save('alice',{schemaVersion:1,workspaceId:'workspace-schedule-0001',expectedRevision:0,writeId:'schedule-write-00001',sourcePostId:'post-1',basePlannerRevision:9,payload:payload({rawTags:'"unfinished',text:'Unfinished\ntext'})});
 return{directory,db};
}
test('actual7→8 constructor preserves every old row and workspace; new columns are null, proof table empty, restart exact',async t=>{
 const {directory,db}=await baseline(t),oldTables=tables(db),before=dump(db);db.close();let next=new LocalDatabase(directory);
 const after=dump(next.sql,oldTables);after.local_migrations=after.local_migrations.filter(x=>x.version<=7);after.planner_channels=legacyScheduleProjection(after.planner_channels);after.planner_posts=legacyScheduleProjection(after.planner_posts);assert.deepEqual(after,before);
 assert.deepEqual(tables(next.sql),[...oldTables,'planner_schedule_undo'].sort());assert.equal(next.sql.prepare('SELECT count(*) n FROM planner_schedule_undo').get().n,0);assert.equal(next.sql.prepare('SELECT count(*) n FROM local_migrations').get().n,8);
 const canonical=await new PlannerRepository(next).load('alice');assert.equal(canonical.schemaVersion,3);assert.equal(canonical.revision,9);assert.equal(canonical.posts[0].scheduledAt,'2026-10-25T01:30:17.123Z');assert.equal(canonical.posts[0].scheduleBinding,null);assert.equal(canonical.channels[0].postingSchedule,null);
 const beforeRestart=dump(next.sql);next.close();next=new LocalDatabase(directory);assert.deepEqual(dump(next.sql),beforeRestart);next.close();
});
test('0008 index collision rolls back both added columns, new proof table and ledger atomically',async t=>{
 const {directory,db}=await baseline(t);db.exec('CREATE TABLE sentinel(v TEXT); CREATE INDEX planner_schedule_undo_expiry ON sentinel(v)');const before=dump(db);db.close();assert.throws(()=>new LocalDatabase(directory),/already exists/);
 const check=new DatabaseSync(join(directory,'planner.sqlite'));assert.deepEqual(dump(check),before);assert.ok(!check.prepare('PRAGMA table_info(planner_channels)').all().some(x=>x.name==='posting_schedule_json'));assert.ok(!check.prepare('PRAGMA table_info(planner_posts)').all().some(x=>x.name==='schedule_binding_json'));check.close();
});
test('changed or future ledger prevents any schedule DDL',async t=>{
 for(const mode of ['changed','future']){const {directory,db}=await baseline(t);if(mode==='changed')db.prepare("UPDATE local_migrations SET digest='bad' WHERE version=7").run();else db.prepare("INSERT INTO local_migrations VALUES(9,'future')").run();const before=dump(db);db.close();assert.throws(()=>new LocalDatabase(directory),/migration history/);const check=new DatabaseSync(join(directory,'planner.sqlite'));assert.deepEqual(dump(check),before);check.close();}
});
test('actual cached0.8 adapter write is rejected after upgrade; fresh old load and UI1 also fail without mutation',async t=>{
 const {directory,db}=await baseline(t);db.close();const next=new LocalDatabase(directory);t.after(()=>next.close());const repo=new PlannerRepository(next),before=await repo.load('alice');
 const historical=structuredClone(before);historical.schemaVersion=2;delete historical.restoreProofs;for(const p of historical.posts)delete p.scheduleBinding;for(const c of historical.channels)delete c.postingSchedule;
 const client=createPlannerClient({fetcher:(path,options={})=>handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),{DB:next})});
 const old=createLegacyStore({client:{...client,load:async()=>structuredClone(historical)},timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});const cached=await old.load();cached.posts[0].text='Stale overwrite';await assert.rejects(old.save(cached),e=>e.code==='STATE_SCHEMA_CHANGED'&&e.status===409);assert.deepEqual(await repo.load('alice'),before);
 const freshOld=createLegacyStore({client,timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});await assert.rejects(freshOld.load(),e=>e.code==='STATE_SCHEMA_CHANGED');
 const current=createTaktStore({client,timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});await current.load();await assert.rejects(current.save(cached),e=>e.code==='UI_SCHEMA_UNSUPPORTED');assert.deepEqual(await repo.load('alice'),before);
});
