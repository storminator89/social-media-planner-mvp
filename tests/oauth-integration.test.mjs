import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {LocalDatabase} from '../server/storage.mjs';
import {createLocalHandler} from '../server/handler.mjs';
import {OAuthStateRepository} from '../modules/oauth/state-repository.mjs';
import {createLinkedInOfflineConfiguration,createOfflineNonce} from '../modules/oauth/linkedin-contract.mjs';
import {createOfflineLinkedInFlow} from '../modules/oauth/linkedin-flow.mjs';
import {ProviderRepository} from '../modules/providers/repository.mjs';
import {seed,jobInput} from './providers/support.mjs';
import {D1TestAdapter} from './data/support.mjs';

const migrationNames=['0001_planner.sql','0002_variant_inheritance.sql','0003_provider_jobs.sql'];
const oldTables=['planner_profiles','planner_channels','planner_posts','planner_variants','planner_media','planner_provider_connections','planner_publication_jobs'];
const dump=db=>Object.fromEntries(oldTables.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY owner_id`).all().map(row=>({...row}))]));
const config=()=>createLinkedInOfflineConfiguration({siteId:'offline-test-site',siteOrigin:'https://planner.example',clientId:'offline_test_app',redirectUri:'https://planner.example/api/providers/linkedin/oauth/callback',accountType:'personal',appConfigVersion:'v1'});
const binding=()=>randomBytes(32).toString('base64url');
async function v3Directory(t){
 const directory=await mkdtemp(join(tmpdir(),'takt-state-migration-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const raw=new DatabaseSync(join(directory,'planner.sqlite'));raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(version INTEGER PRIMARY KEY,digest TEXT NOT NULL)');
 for(const [index,name] of migrationNames.entries()){const sql=await readFile(new URL('../server/'+name,import.meta.url),'utf8');raw.exec(sql);raw.prepare('INSERT INTO local_migrations VALUES (?,?)').run(index+1,createHash('sha256').update(sql).digest('hex'));}
 seed({sql:raw});seed({sql:raw},'bob');raw.close();
 // Use the unchanged v3 D1 contract to create nonempty preparation history.
 const memory=new D1TestAdapter({through:3}),providers=new ProviderRepository(memory);seed(memory);seed(memory,'bob');
 await providers.ensureUnconfiguredConnection('alice','linkedin');await providers.prepareBlockedJob('alice',jobInput());
 const db=new DatabaseSync(join(directory,'planner.sqlite'));
 for(const table of ['planner_provider_connections','planner_publication_jobs'])for(const row of memory.sql.prepare(`SELECT * FROM ${table}`).all()){
  const names=Object.keys(row);db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(()=>'?').join(',')})`).run(...Object.values(row));
 }
 memory.sql.close();return {directory,db};
}

test('actual v3→v5 constructor preserves planning, blocked jobs, owners and migration digests',async t=>{
 const {directory,db}=await v3Directory(t),before=dump(db),ledger=db.prepare('SELECT * FROM local_migrations ORDER BY version').all();db.close();
 let next=new LocalDatabase(directory);assert.deepEqual(dump(next.sql),before);assert.deepEqual(next.sql.prepare('SELECT * FROM local_migrations WHERE version<=3 ORDER BY version').all(),ledger);assert.deepEqual(next.sql.prepare('SELECT version FROM local_migrations ORDER BY version').all().map(r=>r.version),[1,2,3,4,5]);assert.equal(next.sql.prepare('SELECT COUNT(*) n FROM planner_oauth_states').get().n,0);next.close();next=new LocalDatabase(directory);assert.deepEqual(dump(next.sql),before);next.close();
});

test('failed migration4 rolls back schema and ledger and retains all previous rows',async t=>{
 const {directory,db}=await v3Directory(t),before=dump(db);db.exec('CREATE TABLE reserved_index(sentinel TEXT);CREATE INDEX planner_oauth_states_owner_expiry ON reserved_index(sentinel);');db.close();
 assert.throws(()=>new LocalDatabase(directory),/already exists/);const after=new DatabaseSync(join(directory,'planner.sqlite'));
 assert.deepEqual(dump(after),before);assert.equal(after.prepare('SELECT COUNT(*) n FROM local_migrations').get().n,3);assert.equal(after.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='planner_oauth_states'").get().n,0);after.close();
});

test('exact configuration and real state repository support one internal callback receipt without connecting',async()=>{
 const DB=new D1TestAdapter(),cfg=await config(),repository=new OAuthStateRepository(DB,{...cfg,clock:()=>2000000}),browserBinding=binding(),nonce=await createOfflineNonce();
 const {state}=await repository.begin('alice',browserBinding,{nonceFingerprint:nonce.nonceFingerprint});const callbackUrl=cfg.redirectUri+'?state='+state+'&code=offline-test-code';
 const before=DB.sql.prepare('SELECT * FROM planner_provider_connections').all();
 const wrong=await createOfflineLinkedInFlow(DB,cfg,{clock:()=>2000000}).claimCallback({trustedOwner:'bob',callbackUrl,browserBinding});assert.equal(wrong.status,'invalid_attempt');
 const claimed=await createOfflineLinkedInFlow(DB,cfg,{clock:()=>2000000}).claimCallback({trustedOwner:'alice',callbackUrl,browserBinding});assert.equal(claimed.status,'code_validated_not_exchanged');assert.equal(claimed.connected,false);assert.equal(claimed.nonceFingerprint,nonce.nonceFingerprint);
 assert.equal((await createOfflineLinkedInFlow(DB,cfg,{clock:()=>2000000}).claimCallback({trustedOwner:'alice',callbackUrl,browserBinding})).status,'invalid_attempt');assert.deepEqual(DB.sql.prepare('SELECT * FROM planner_provider_connections').all(),before);
 const persisted=JSON.stringify(DB.sql.prepare('SELECT * FROM planner_oauth_states').all());for(const raw of [state,browserBinding,nonce.nonce,'offline-test-code'])assert.ok(!persisted.includes(raw));
});

test('malformed callback does not consume its otherwise legitimate state',async()=>{
 const DB=new D1TestAdapter(),cfg=await config(),repository=new OAuthStateRepository(DB,cfg),browserBinding=binding(),nonce=await createOfflineNonce();const {state}=await repository.begin('alice',browserBinding,{nonceFingerprint:nonce.nonceFingerprint});
 await assert.rejects(createOfflineLinkedInFlow(DB,cfg).claimCallback({trustedOwner:'alice',browserBinding,callbackUrl:cfg.redirectUri+'?state='+state+'&code=a&code=b'}),e=>e.code==='INVALID_CALLBACK');assert.equal(DB.sql.prepare('SELECT consumed_at_ms FROM planner_oauth_states').get().consumed_at_ms,null);
 const denied=await createOfflineLinkedInFlow(DB,cfg).claimCallback({trustedOwner:'alice',browserBinding,callbackUrl:cfg.redirectUri+'?state='+state+'&error=access_denied&error_description=private'});assert.deepEqual(denied,{status:'provider_denied',connected:false});assert.equal(await repository.claim('alice',state,browserBinding),false);
});

test('same factory configuration persists across local restart but does not create an OAuth HTTP route',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-offline-restart-'));t.after(()=>rm(directory,{recursive:true,force:true}));const cfg=await config(),browserBinding=binding(),nonce=await createOfflineNonce();let DB=new LocalDatabase(directory);
 const {state}=await new OAuthStateRepository(DB,{...cfg,clock:()=>2000000}).begin('alice',browserBinding,{nonceFingerprint:nonce.nonceFingerprint});DB.close();DB=new LocalDatabase(directory);
 assert.deepEqual(await new OAuthStateRepository(DB,{...cfg,clock:()=>2000001}).claim('alice',state,browserBinding),{claimed:true,nonceFingerprint:nonce.nonceFingerprint});DB.close();
 const handler=createLocalHandler({directory});t.after(()=>handler.close());const r=await handler.fetch(new Request('http://127.0.0.1/api/providers/linkedin/oauth/callback?state='+state+'&code=test'));assert.equal(r.status,503);
});

test('generated HTTP routes never create, claim or disclose offline state, even with callback-shaped queries',async()=>{
 const DB=new D1TestAdapter(),handler=(await import('../dist/server/index.js')).default,cfg=await config(),browserBinding=binding(),nonce=await createOfflineNonce(),repository=new OAuthStateRepository(DB,cfg);const {state}=await repository.begin('alice',browserBinding,{nonceFingerprint:nonce.nonceFingerprint});const before=DB.sql.prepare('SELECT * FROM planner_oauth_states').all();
 for(const [path,method,status] of [['status','GET',200],['linkedin/oauth/readiness','GET',200],['linkedin/oauth/start','POST',503],['linkedin/oauth/callback','GET',503],['linkedin/oauth/exchange','POST',404],['x/oauth/start','POST',404]]){
  const response=await handler.fetch(new Request('https://planner.example/api/providers/'+path+'?state='+state+'&code=offline-private',{method,headers:{'oai-authenticated-user-id':'alice','X-Planner-Request':'1'}}),{DB});assert.equal(response.status,status);const text=await response.text();assert.ok(!text.includes(state)&&!text.includes('offline-private')&&!text.includes(nonce.nonceFingerprint));
 }
 assert.deepEqual(DB.sql.prepare('SELECT * FROM planner_oauth_states').all(),before);assert.equal(DB.sql.prepare('SELECT COUNT(*) n FROM planner_provider_connections').get().n,0);
});

test('generated runtime does not expose server modules and contains no configured credential values',async()=>{
 const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');assert.doesNotMatch(source,/fixture-client-secret-value|fixture-runtime-key-value/);
 const handler=(await import('../dist/server/index.js')).default,DB=new D1TestAdapter();for(const path of ['/modules/oauth/state-repository.mjs','/server/0004_oauth_state.sql'])assert.equal((await handler.fetch(new Request('https://planner.example'+path,{headers:{'oai-authenticated-user-id':'alice'}}),{DB})).status,404);
});
