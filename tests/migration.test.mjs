import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDatabase } from '../server/storage.mjs';
import { PlannerRepository } from '../modules/data/repository.mjs';
import { createPlannerClient } from '../modules/data/client.mjs';
import { createTaktStore } from '../modules/data/takt-adapter.mjs';
import { handlePlannerRequest } from '../modules/data/api.mjs';

const names=['planner_profiles','planner_channels','planner_posts','planner_variants','planner_media'];
const stamp='2026-11-07T09:00:00Z';
async function legacy(t) {
  const directory=await mkdtemp(join(tmpdir(),'takt-migration-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const db=new DatabaseSync(join(directory,'planner.sqlite'));
  const sql=await readFile(new URL('../server/0001_planner.sql',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'),'021ce68924eabf27cfce02a55163526fbfe4fec0b1c785bbee6d3a7d8f165c1c');
  db.exec(sql);db.exec('CREATE TABLE local_migrations (version INTEGER PRIMARY KEY, digest TEXT NOT NULL)');
  db.prepare('INSERT INTO local_migrations VALUES (1,?)').run(createHash('sha256').update(sql).digest('hex'));
  for(const owner of ['alice','bob']) {
    db.prepare('INSERT INTO planner_profiles VALUES (?,7,?,?,NULL,?)').run(owner,'Europe/Berlin','de-DE',stamp);
    db.prepare("INSERT INTO planner_channels VALUES (?,'instagram','instagram','Instagram','','#aabbcc',1,'manual')").run(owner);
    db.prepare("INSERT INTO planner_posts VALUES (?,'p1','Eigener Titel','Basis','draft','[]',NULL,NULL,'Europe/Berlin',?,?)").run(owner,stamp,stamp);
    db.prepare("INSERT INTO planner_variants VALUES (?,'v1','p1','instagram',?,'post','draft',NULL,'Europe/Berlin',NULL,NULL,'Notiz bleibt',?)").run(owner,owner==='alice'?'Basis':'Eigene Fassung','["m1"]');
    db.prepare("INSERT INTO planner_media VALUES (?,'m1',?,'bild.png','image/png',16,'Beschreibung',?)").run(owner,owner+'/m1',stamp);
  }
  return {directory,db};
}
const dump=db=>Object.fromEntries(names.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY owner_id`).all().map(row=>({...row}))]));

test('append-only migration retains every legacy row, revision, owner, media reference and independent text',async t=>{
  const {directory,db}=await legacy(t),before=dump(db);db.close();
  let next=new LocalDatabase(directory);const after=dump(next.sql);
  for(const row of after.planner_variants){assert.equal(row.inherits_body,0);delete row.inherits_body;}
  assert.deepEqual(after,before);assert.deepEqual(next.sql.prepare('SELECT version FROM local_migrations ORDER BY version').all().map(r=>r.version),[1,2]);
  const repo=new PlannerRepository(next);const alice=await repo.load('alice'),bob=await repo.load('bob');
  assert.equal(alice.schemaVersion,2);assert.equal(alice.revision,7);assert.equal(alice.posts[0].variants[0].inheritsBody,false);assert.equal(bob.posts[0].variants[0].body,'Eigene Fassung');
  next.close();next=new LocalDatabase(directory);assert.equal((await new PlannerRepository(next).load('alice')).revision,7);next.close();
});

test('old clients cannot write after upgrade, even with a matching revision',async t=>{
  const {directory,db}=await legacy(t);db.close();const next=new LocalDatabase(directory);t.after(()=>next.close());const repo=new PlannerRepository(next);
  const before=await repo.load('alice');
  for(const version of [1,undefined]) {const stale={...before,schemaVersion:version,posts:[]};await assert.rejects(repo.save('alice',stale),e=>e.status===409&&e.code==='STATE_SCHEMA_CHANGED');assert.deepEqual(await repo.load('alice'),before);}
});

test('migrated equal text remains independent through UI edits and keeps title, note and media',async t=>{
  const {directory,db}=await legacy(t);db.close();const next=new LocalDatabase(directory);t.after(()=>next.close());
  const client=createPlannerClient({fetcher:(path,options={})=>handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),{DB:next})});
  const store=createTaktStore({client,timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]}),ui=await store.load();
  assert.deepEqual(ui.posts[0].variantTexts,{instagram:'Basis'});ui.posts[0].text='Neue Basis';await store.save(ui);
  const saved=await client.load();assert.equal(saved.posts[0].body,'Neue Basis');assert.equal(saved.posts[0].title,'Eigener Titel');assert.equal(saved.posts[0].variants[0].body,'Basis');assert.equal(saved.posts[0].variants[0].statusNote,'Notiz bleibt');assert.deepEqual(saved.posts[0].variants[0].mediaIds,['m1']);assert.equal((await new PlannerRepository(next).load('bob')).revision,7);
});

test('changed or future migration ledger fails closed before applying any pending SQL',async t=>{
  for(const mode of ['changed','future']){
    const {directory,db}=await legacy(t);
    if(mode==='changed')db.prepare("UPDATE local_migrations SET digest='changed'").run();else db.prepare("INSERT INTO local_migrations VALUES (3,'future')").run();
    const before=dump(db);db.close();assert.throws(()=>new LocalDatabase(directory),/migration history/);
    const reopened=new DatabaseSync(join(directory,'planner.sqlite'));assert.deepEqual(dump(reopened),before);assert.ok(!reopened.prepare('PRAGMA table_info(planner_variants)').all().some(row=>row.name==='inherits_body'));reopened.close();
  }
});

test('failed pending migration leaves ledger and legacy data intact',async t=>{
  const {directory,db}=await legacy(t);db.exec('ALTER TABLE planner_variants ADD COLUMN inherits_body INTEGER NOT NULL DEFAULT 0');const before=dump(db);db.close();
  assert.throws(()=>new LocalDatabase(directory),/duplicate column/);
  const reopened=new DatabaseSync(join(directory,'planner.sqlite'));assert.deepEqual(dump(reopened),before);assert.equal(reopened.prepare('SELECT COUNT(*) n FROM local_migrations').get().n,1);reopened.close();
});
