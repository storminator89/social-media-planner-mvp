import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadSnapshot} from '../../modules/workspaces/workspace-domain.mjs';
import {normalizeWorkspace,normalizeWorkspacePayload,workspacePayloadEqual,workspaceReceiptMatches,createWorkspaceClient} from '../../public/workspace-client.js';
import {normalizeWorkspacePayload as oldClient} from './fixtures/legacy-workspace-client-v0.8.0.mjs';
import {setup,payload,saveInput,discardInput,uuid,row,errorCode} from './support.mjs';
const saved=(id='image-1')=>({kind:'planner_image',id,alt:'working alt',name:'My image.png',type:'image/png'});
const omitted=()=>({kind:'local_omitted',alt:'local alt',name:'local image.png',type:'image/png'});
function rich(items=[saved(),omitted()]){const {media,localMediaOmitted,...p}=payload();return {...p,schemaVersion:2,mediaItems:items};}
const input=(overrides={})=>saveInput({schemaVersion:2,payload:rich(),...overrides});
const clone=x=>JSON.parse(JSON.stringify(x));
function seedImages(db){for(let i=2;i<=10;i++)db.sql.prepare('INSERT INTO planner_media SELECT owner_id,?,owner_id||?,filename,mime_type,byte_size,alt_text,created_at FROM planner_media WHERE id=?').run(`image-${i}`,`/image-${i}`,'image-1');}

test('v2 order and omitted metadata roundtrip exactly, SQL schema1/null media, legacy strict fail closed',async()=>{
 const {repo,db}=setup();seedImages(db);const p=rich([saved('image-2'),omitted(),saved()]);const out=await repo.save('alice',input({payload:p}));assert.equal(out.schemaVersion,2);assert.deepEqual(clone(out.workspace.payload),p);assert.equal(row(db).schema_version,1);assert.equal(row(db).media_id,null);assert.deepEqual(out.workspace.resolvedMediaItems.map(m=>m?.id??null),['image-2',null,'image-1']);assert.equal(out.workspace.mediaMetadataConflict,true);assert.deepEqual(normalizeWorkspace(out.workspace).payload,normalizeWorkspacePayload(p));assert.throws(()=>oldClient(p));assert.deepEqual(await repo.load('alice',uuid(1)),out);
});
test('zero, one and ten slots accepted; over limit, sparse, duplicate and malformed exact fields rejected',()=>{
 for(const items of [[],[saved()],[omitted()],Array.from({length:10},(_,i)=>saved(`image-${i}`))])assert.deepEqual(clone(payloadSnapshot(rich(items))),rich(items));
 const bad=[Array(1),Array.from({length:11},omitted),[saved(),saved()],[{...saved(),url:'/private'}],[{...omitted(),id:'fake'}],[{...saved(),type:'video/mp4'}],[{...saved(),alt:'x'.repeat(2001)}],[{...omitted(),name:'x'.repeat(256)}],[{...saved(),bytes:'secret'}],[{...saved(),type:undefined}]];
 for(const items of bad){assert.throws(()=>payloadSnapshot(rich(items)));assert.throws(()=>normalizeWorkspacePayload(rich(items)));}
 for(const change of [p=>p.media=null,p=>p.localMediaOmitted=false,p=>p.schemaVersion=5,p=>delete p.mediaItems]){const p=rich();change(p);assert.throws(()=>payloadSnapshot(p));assert.throws(()=>normalizeWorkspacePayload(p));}
});
for(const position of [0,1,2])for(const mode of ['missing','other-owner','video','changed-mime','invalid-name','invalid-alt'])test(`atomic all-or-nothing write position ${position} ${mode}`,async()=>{
 const {repo,db}=setup();seedImages(db);const items=[saved(),saved('image-2'),saved('image-3')],id=items[position].id;
 if(mode==='missing')db.sql.prepare('DELETE FROM planner_media WHERE id=?').run(id);
 if(mode==='other-owner')db.sql.prepare('DELETE FROM planner_media WHERE id=? AND owner_id=?').run(id,'alice');
 if(mode==='video'||mode==='changed-mime')db.sql.prepare('UPDATE planner_media SET mime_type=? WHERE id=?').run(mode==='video'?'video/mp4':'image/jpeg',id);
 if(mode==='invalid-name')db.sql.prepare('UPDATE planner_media SET filename=? WHERE id=?').run('x'.repeat(256),id);
 if(mode==='invalid-alt')db.sql.prepare('UPDATE planner_media SET alt_text=? WHERE id=?').run('x'.repeat(2001),id);
 await assert.rejects(repo.save('alice',input({payload:rich(items)})),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.equal(row(db),undefined);
});
for(const position of [0,1,2])test(`load rejects missing media at position ${position}, never partial`,async()=>{
 const {repo,db}=setup();seedImages(db);const p=rich([saved(),saved('image-2'),saved('image-3')]);await repo.save('alice',input({payload:p}));db.sql.prepare('DELETE FROM planner_media WHERE owner_id=? AND id=?').run('alice',p.mediaItems[position].id);await assert.rejects(repo.load('alice',uuid(1)),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));await assert.rejects(repo.list('alice'),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));
});
test('metadata changes at batch boundary resolve current metadata; posttransaction change cannot alter receipt',async()=>{
 const {repo,db}=setup();db.beforeBatch=()=>db.sql.prepare('UPDATE planner_media SET filename=?,alt_text=? WHERE owner_id=?').run('new.png','new alt','alice');const out=await repo.save('alice',input());assert.equal(out.workspace.resolvedMediaItems[0].name,'new.png');assert.equal(out.workspace.mediaMetadataConflict,true);assert.equal(out.workspace.payload.mediaItems[0].name,'My image.png');db.afterBatch=()=>db.sql.prepare('UPDATE planner_media SET filename=? WHERE owner_id=?').run('later.png','alice');const loaded=await repo.load('alice',uuid(1));assert.equal(loaded.workspace.resolvedMediaItems[0].name,'new.png');assert.equal((await repo.load('alice',uuid(1))).workspace.resolvedMediaItems[0].name,'later.png');
});
test('MIME disappears at transaction boundary: no write or revision/expiry changes',async()=>{
 const {repo,db}=setup();await repo.save('alice',input());const before={...row(db)};db.beforeBatch=()=>db.sql.prepare('UPDATE planner_media SET mime_type=? WHERE owner_id=?').run('video/mp4','alice');await assert.rejects(repo.save('alice',input({expectedRevision:1,writeId:uuid(101)})),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.deepEqual({...row(db)},before);
});
test('legacy upgrade, v2 downgrade PUT and discard prevented including current revision',async()=>{
 const {repo,db}=setup();const legacy=await repo.save('alice',saveInput());assert.equal(legacy.schemaVersion,1);await repo.save('alice',input({expectedRevision:1,writeId:uuid(101)}));const before={...row(db)};for(const expectedRevision of [1,2,3]){await assert.rejects(repo.save('alice',saveInput({expectedRevision,writeId:uuid(110)})),errorCode('WORKSPACE_SCHEMA_CHANGED'));await assert.rejects(repo.discard('alice',discardInput({expectedRevision})),errorCode('WORKSPACE_SCHEMA_CHANGED'));}assert.deepEqual({...row(db)},before);await repo.discard('alice',discardInput({schemaVersion:2,expectedRevision:2}));assert.equal(row(db).state,'discarded');assert.equal(row(db).payload_json,before.payload_json);
});
test('v2 upgrade inserted at batch boundary blocks old update and discard',async()=>{
 for(const kind of ['save','discard']){const {repo,db}=setup();await repo.save('alice',saveInput());db.beforeBatch=()=>db.sql.prepare('UPDATE planner_editor_workspaces SET payload_json=?,media_id=NULL').run(JSON.stringify(rich()));const call=kind==='save'?repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101)})):repo.discard('alice',discardInput());await assert.rejects(call,errorCode('WORKSPACE_SCHEMA_CHANGED'));assert.equal(row(db).state,'active');assert.equal(row(db).revision,1);}
});
test('unknown persisted protocol cannot be read, overwritten or discarded by either version',async()=>{
 const {repo,db}=setup();await repo.save('alice',input());const p=rich();p.schemaVersion=5;db.sql.prepare('UPDATE planner_editor_workspaces SET payload_json=?').run(JSON.stringify(p));const before={...row(db)};await assert.rejects(repo.load('alice',uuid(1)));for(const schemaVersion of [1,2]){await assert.rejects(repo.save('alice',schemaVersion===1?saveInput({expectedRevision:1}):input({expectedRevision:1})),errorCode('WORKSPACE_SCHEMA_CHANGED'));await assert.rejects(repo.discard('alice',discardInput({schemaVersion})),errorCode('WORKSPACE_SCHEMA_CHANGED'));}assert.deepEqual({...row(db)},before);
});
test('exact receipts distinguish order, metadata and omitted slots, unknown commit reconciles without extra write',async()=>{
 const {repo,db}=setup();seedImages(db);const request=input({payload:rich([saved(),omitted(),saved('image-2')])});const batch=db.batch.bind(db);let calls=0;db.batch=async statements=>{if(++calls===2)db.unknownBatch=true;return batch(statements);};await assert.rejects(repo.save('alice',request),errorCode('WORKSPACE_STORAGE_UNCERTAIN'));const got=await repo.load('alice',uuid(1));assert.ok(workspaceReceiptMatches(got.workspace,request));assert.deepEqual(await repo.save('alice',request),got);for(const change of [p=>p.mediaItems.reverse(),p=>p.mediaItems[1].name='other',p=>p.mediaItems[0].alt='other',p=>p.mediaItems.splice(1,1)]){const p=clone(request.payload);change(p);assert.equal(workspacePayloadEqual(p,request.payload),false);await assert.rejects(repo.save('alice',{...request,payload:p}),errorCode('WORKSPACE_WRITE_ID_REUSED'));}assert.equal(row(db).revision,1);
});
test('DTO rejects truncation, swapped order, extra slot, forged URL, missing placeholder or conflict flag',async()=>{
 const {repo,db}=setup();seedImages(db);const {workspace:w}=await repo.save('alice',input({payload:rich([saved(),omitted(),saved('image-2')])}));for(const change of [w=>w.resolvedMediaItems.pop(),w=>w.resolvedMediaItems.reverse(),w=>w.resolvedMediaItems.push(null),w=>w.resolvedMediaItems[0].url='https://other.invalid',w=>w.resolvedMediaItems[1]=w.resolvedMediaItems[0],w=>w.mediaMetadataConflict=false,w=>w.resolvedMediaItems[0].type='image/jpeg']){const bad=clone(w);change(bad);assert.throws(()=>normalizeWorkspace(bad));}
});
test('unchanged active quota and expiry retain ordered payload and lifetime count',async()=>{
 const {repo,db,setNow}=setup();for(let n=1;n<=20;n++)await repo.save('alice',input({workspaceId:uuid(n)}));await assert.rejects(repo.save('alice',input({workspaceId:uuid(21)})),errorCode('WORKSPACE_CAPACITY_REACHED'));const before=row(db).payload_json;setNow(row(db).expires_at_ms);const list=await repo.list('alice');assert.equal(list.capacity.active,0);assert.equal(list.capacity.total,20);assert.equal(row(db).payload_json,before);assert.equal(row(db).state,'expired');
});
test('new client uses explicit protocol for write/discard and rejects envelope mismatch',async()=>{
 const {repo}=setup();const out=await repo.save('alice',input());let body;const client=createWorkspaceClient({fetcher:async (_url,init)=>{body=JSON.parse(init.body);return Response.json(out);}});await client.save((({schemaVersion,...r})=>r)(input()));assert.equal(body.schemaVersion,2);const wrong=createWorkspaceClient({fetcher:async()=>Response.json({...out,schemaVersion:1})});await assert.rejects(wrong.read(uuid(1)));const disc=createWorkspaceClient({fetcher:async(_url,init)=>{body=JSON.parse(init.body);return Response.json(await repo.discard('alice',{...body,workspaceId:uuid(1)}));}});await disc.discard({workspaceId:uuid(1),expectedRevision:1,writeId:uuid(200)});assert.equal(body.schemaVersion,4);
});
test('canonical UTF16 bounds reject astral metadata before any write',async()=>{
 for(const [column,value] of [['filename','😀'.repeat(128)],['alt_text','😀'.repeat(1001)]]){const {repo,db}=setup();db.sql.prepare(`UPDATE planner_media SET ${column}=? WHERE owner_id=?`).run(value,'alice');await assert.rejects(repo.save('alice',input()),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.equal(row(db),undefined);}
});
test('invalid persisted shape cannot be overwritten or discarded, even with supported version',async()=>{
 for(const value of [null,[],{}, {schemaVersion:2}, {...rich(),mediaItems:[{kind:'planner_image'}]}])for(const kind of ['save','discard']){const {repo,db}=setup();await repo.save('alice',input());db.sql.prepare('UPDATE planner_editor_workspaces SET payload_json=?').run(JSON.stringify(value));const before={...row(db)};await assert.rejects(kind==='save'?repo.save('alice',input({expectedRevision:1,writeId:uuid(101)})):repo.discard('alice',discardInput({schemaVersion:2})));assert.deepEqual({...row(db)},before);}
});
test('invalid record introduced after preflight cannot bypass exact payload CAS',async()=>{
 for(const kind of ['save','discard']){const {repo,db}=setup();await repo.save('alice',input());db.afterBatch=()=>db.sql.prepare('UPDATE planner_editor_workspaces SET payload_json=?').run('null');await assert.rejects(kind==='save'?repo.save('alice',input({expectedRevision:1,writeId:uuid(101)})):repo.discard('alice',discardInput({schemaVersion:2})));assert.equal(row(db).revision,1);assert.equal(row(db).state,'active');assert.equal(row(db).payload_json,'null');}
});
test('canonical metadata change after validated preflight blocks commit atomically',async()=>{
 for(const field of ['filename','alt_text','mime_type']){const {repo,db}=setup();db.afterBatch=()=>db.sql.prepare(`UPDATE planner_media SET ${field}=? WHERE owner_id=?`).run(field==='mime_type'?'image/jpeg':'changed','alice');await assert.rejects(repo.save('alice',input()),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.equal(row(db),undefined);}
});
test('supported MIME drift after save blocks load instead of restoring mismatched type',async()=>{
 const {repo,db}=setup();await repo.save('alice',input());db.sql.prepare('UPDATE planner_media SET mime_type=? WHERE owner_id=?').run('image/jpeg','alice');await assert.rejects(repo.load('alice',uuid(1)),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));
});
test('v2 receipt equality ignores nested key order, never slot order or accessors',()=>{
 const p=rich(),other=clone(p);other.mediaItems=other.mediaItems.map(m=>Object.fromEntries(Object.entries(m).reverse()));assert.ok(workspacePayloadEqual(p,other));let calls=0;Object.defineProperty(other.mediaItems[0],'kind',{get(){calls++;return 'planner_image';},enumerable:true});assert.throws(()=>normalizeWorkspacePayload(other));assert.equal(calls,0);
});
