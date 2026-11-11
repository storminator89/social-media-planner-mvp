import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadSnapshot} from '../../modules/workspaces/workspace-domain.mjs';
import {normalizeWorkspacePayload} from '../../public/workspace-client.js';
import {setup,payload,saveInput,discardInput,uuid,row,errorCode} from './support.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const saved=(id='image-1')=>({kind:'planner_image',id,name:'My image.png',alt:'Original alt',type:'image/png'});
const omitted=()=>({kind:'local_omitted',name:'same.png',alt:'same',type:'image/png'});
const rich=(mediaItems=[saved()],channelMediaRefs={linkedin:[0],youtube:[0]})=>{const {media,localMediaOmitted,...p}=payload();return {...p,schemaVersion:4,mediaItems,channelMediaRefs};};
const input=(p=rich(),overrides={})=>saveInput({schemaVersion:4,payload:p,...overrides});
function seedImages(db,count){for(let i=2;i<=count;i++)db.sql.prepare('INSERT INTO planner_media SELECT owner_id,?,owner_id||?,filename,mime_type,byte_size,alt_text,created_at FROM planner_media WHERE id=?').run(`image-${i}`,`/image-${i}`,'image-1');}
function capBinds(db){let max=0;const prepare=db.prepare.bind(db);db.prepare=query=>{const stmt=prepare(query),bind=stmt.bind;stmt.bind=function(...args){max=Math.max(max,args.length);assert.ok(args.length<=100,`D1 bind ceiling: ${args.length}`);return bind.apply(this,args);};return stmt;};return()=>max;}
test('v4 ordered/shared/disjoint and explicit empty channel lists survive save/load exactly',async()=>{
 const {repo,db}=setup();seedImages(db,3);const p=rich([saved(),saved('image-2'),saved('image-3')],{linkedin:[2,0],youtube:[1,2]});const out=await repo.save('alice',input(p));assert.deepEqual(clone(out.workspace.payload),p);assert.deepEqual(await repo.load('alice',uuid(1)),out);assert.deepEqual(clone(payloadSnapshot(p)),normalizeWorkspacePayload(p));assert.equal(row(db).schema_version,1);assert.equal(row(db).media_id,null);assert.equal(out.workspace.mediaMetadataConflict,false);
 const empty=rich([],{linkedin:[],youtube:[]});const updated=await repo.save('alice',input(empty,{expectedRevision:1,writeId:uuid(101)}));assert.deepEqual(clone(updated.workspace.payload),empty);
});
test('v4 retains identical local omissions as distinct slots, including empty channel lists',()=>{
 const p=rich([omitted(),omitted()],{linkedin:[0,1],youtube:[]});assert.deepEqual(clone(payloadSnapshot(p)),p);assert.deepEqual(normalizeWorkspacePayload(p),p);
});
test('v4 strict reference shapes and slot schemas reject without evaluating getters',()=>{
 const changes=[p=>delete p.channelMediaRefs,p=>p.channelMediaRefs.extra=[],p=>delete p.channelMediaRefs.youtube,p=>p.channelMediaRefs.linkedin=[0,0],p=>p.channelMediaRefs.linkedin=[1],p=>p.channelMediaRefs.linkedin=[0.1],p=>p.channelMediaRefs.linkedin=Array(1),p=>p.channelMediaRefs.linkedin=Array(11).fill(0),p=>p.channelMediaRefs={linkedin:[],youtube:[]},p=>p.mediaItems.push(saved()),p=>p.mediaItems.push({...saved(),alt:'different'}),p=>p.mediaItems[0].url='https://private.invalid',p=>p.mediaItems[0].bytes='secret',p=>p.mediaItems[0].kind='planner_video',p=>p.mediaItems[0].type='video/mp4',p=>p.mediaItems=[{...omitted(),type:'video/webm'}],p=>p.channels=[],p=>Object.setPrototypeOf(p.channelMediaRefs,{youtube:[0]}),p=>Object.defineProperty(p.channelMediaRefs,'youtube',{value:[0],enumerable:false}),p=>p.channelMediaRefs[Symbol('extra')]=[]];
 let calls=0;changes.push(p=>Object.defineProperty(p.channelMediaRefs,'youtube',{get(){calls++;return[0];},enumerable:true}),p=>Object.defineProperty(p.channelMediaRefs.linkedin,'0',{get(){calls++;return 0;},enumerable:true}));
 for(const change of changes){const p=rich();change(p);assert.throws(()=>payloadSnapshot(p));assert.throws(()=>normalizeWorkspacePayload(p));}assert.equal(calls,0);
 const special=rich([saved()],JSON.parse('{"__proto__":[0],"constructor":[]}'));special.channels=['__proto__','constructor'];special.activeTextTarget='base';assert.deepEqual(clone(payloadSnapshot(special)),normalizeWorkspacePayload(special));assert.equal({}.polluted,undefined);
});
test('v4 supports 200 catalog entries under 100 D1 binds; bounds never truncate',async()=>{
 const {repo,db}=setup();seedImages(db,200);const max=capBinds(db),p=rich(Array.from({length:200},(_,i)=>saved(`image-${i+1}`)),{});p.channels=Array.from({length:20},(_,i)=>`channel-${i}`);p.activeTextTarget='base';p.channelMediaRefs=Object.fromEntries(p.channels.map((c,i)=>[c,Array.from({length:10},(_,j)=>i*10+j)]));const out=await repo.save('alice',input(p));assert.equal(out.workspace.resolvedMediaItems.length,200);assert.deepEqual(clone((await repo.load('alice',uuid(1))).workspace.payload),p);assert.ok(max()<40);
 const tooMany=clone(p);tooMany.mediaItems.push(saved('image-201'));assert.throws(()=>payloadSnapshot(tooMany));const tooLarge=clone(p);tooLarge.mediaItems.forEach(m=>m.alt='x'.repeat(2000));assert.throws(()=>payloadSnapshot(tooLarge),errorCode('WORKSPACE_TOO_LARGE'));assert.throws(()=>normalizeWorkspacePayload(tooLarge));
});
for(const field of ['filename','alt_text','mime_type','owner_id','delete'])test(`v4 atomic JSON guard prevents post-preflight ${field} drift at final catalog entry`,async()=>{
 const {repo,db}=setup();seedImages(db,3);const p=rich([saved(),saved('image-2'),saved('image-3')],{linkedin:[0],youtube:[2,1]});await repo.save('alice',input(p));const before={...row(db)};db.afterBatch=()=>field==='delete'?db.sql.prepare("DELETE FROM planner_media WHERE owner_id='alice' AND id='image-3'").run():db.sql.prepare(`UPDATE planner_media SET ${field}=? WHERE owner_id='alice' AND id='image-3'`).run(field==='mime_type'?'image/jpeg':field==='owner_id'?'foreign':'changed');await assert.rejects(repo.save('alice',input(p,{expectedRevision:1,writeId:uuid(101)})),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.deepEqual({...row(db)},before);
});
test('v4 owner lookup and load never return foreign/missing catalog images',async()=>{
 const {repo,db}=setup();db.sql.prepare("DELETE FROM planner_media WHERE owner_id='alice' AND id='image-1'").run();await assert.rejects(repo.save('alice',input()),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.equal(row(db),undefined);
});
test('v4 downgrade save/discard and stale revisions preserve bytes; exact discard retry works',async()=>{
 const {repo,db}=setup();await repo.save('alice',input());const before={...row(db)};for(const version of [1,2,3]){const p=version===1?payload():(({channelMediaRefs,...p})=>({...p,schemaVersion:version}))(rich());await assert.rejects(repo.save('alice',saveInput({schemaVersion:version,payload:p,expectedRevision:1,writeId:uuid(101)})),errorCode('WORKSPACE_SCHEMA_CHANGED'));await assert.rejects(repo.discard('alice',discardInput({schemaVersion:version})),errorCode('WORKSPACE_SCHEMA_CHANGED'));}assert.deepEqual({...row(db)},before);await assert.rejects(repo.discard('alice',discardInput({schemaVersion:4,expectedRevision:2})),errorCode('WORKSPACE_CONFLICT'));const d=discardInput({schemaVersion:4});assert.deepEqual(await repo.discard('alice',d),await repo.discard('alice',d));assert.equal(row(db).payload_json,before.payload_json);
});
test('v4 upgrade after legacy preflight cannot be overwritten or discarded in transaction',async()=>{
 for(const op of ['save','discard']){const {repo,db}=setup();await repo.save('alice',saveInput());db.afterBatch=()=>db.sql.prepare('UPDATE planner_editor_workspaces SET payload_json=?,media_id=NULL').run(JSON.stringify(rich()));await assert.rejects(op==='save'?repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101)})):repo.discard('alice',discardInput()),errorCode('WORKSPACE_SCHEMA_CHANGED'));assert.equal(row(db).revision,1);assert.equal(row(db).state,'active');}
});
test('v4 unknown commit and exact mutation replay preserve refs; changed map is write-ID reuse',async()=>{
 const {repo,db}=setup();const request=input();const batch=db.batch.bind(db);let calls=0;db.batch=async stmts=>{if(++calls===2)db.unknownBatch=true;return batch(stmts);};await assert.rejects(repo.save('alice',request),errorCode('WORKSPACE_STORAGE_UNCERTAIN'));const loaded=await repo.load('alice',uuid(1));assert.deepEqual(await repo.save('alice',request),loaded);const changed=clone(request);changed.payload.channelMediaRefs.youtube=[];await assert.rejects(repo.save('alice',changed),errorCode('WORKSPACE_WRITE_ID_REUSED'));assert.equal(row(db).revision,1);await assert.rejects(repo.save('alice',input(rich(),{expectedRevision:2,writeId:uuid(101)})),errorCode('WORKSPACE_CONFLICT'));
});
