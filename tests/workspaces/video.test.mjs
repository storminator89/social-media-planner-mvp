import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadSnapshot} from '../../modules/workspaces/workspace-domain.mjs';
import {normalizeWorkspace,normalizeWorkspacePayload,createWorkspaceClient} from '../../public/workspace-client.js';
import {workspaceRestoreMedia,restoredWorkspacePayload,workspaceHasOmissions} from '../../public/workspace-restore.js';
import {setup,payload,saveInput,discardInput,uuid,row,errorCode} from './support.mjs';
const video=(type='video/mp4')=>({kind:'planner_video',id:'video-1',alt:'Original alt',name:'My image.png',type});
const rich=(items=[video()])=>{const {media,localMediaOmitted,...p}=payload();return {...p,schemaVersion:3,mediaItems:items};};
const input=p=>saveInput({schemaVersion:3,payload:p??rich()});
for(const type of ['video/mp4','video/webm'])test(`v3 ${type} persists, resolves, resumes and discards without migration`,async()=>{
 const {repo,db}=setup();db.sql.prepare('UPDATE planner_media SET mime_type=? WHERE id=?').run(type,'video-1');const p=rich([video(type)]);assert.deepEqual(JSON.parse(JSON.stringify(payloadSnapshot(p))),p);assert.deepEqual(normalizeWorkspacePayload(p),p);
 const out=await repo.save('alice',input(p));assert.equal(out.schemaVersion,3);assert.equal(row(db).schema_version,1);assert.equal(row(db).media_id,null);const w=normalizeWorkspace(out.workspace);assert.equal(w.resolvedMediaItems[0].type,type);assert.deepEqual(workspaceRestoreMedia(w,restoredWorkspacePayload(w)),w.resolvedMediaItems);assert.deepEqual(await repo.load('alice',uuid(1)),out);assert.equal((await repo.list('alice')).workspaces.length,1);
 await repo.discard('alice',discardInput({schemaVersion:3}));assert.equal(row(db).state,'discarded');
});
test('v2 never accepts planner_video; v3 kind/type mismatch and mixed or multiple video slots rejected',()=>{
 const bad=[{...rich(),schemaVersion:2},rich([{...video(),type:'image/png'}]),rich([{...video(),kind:'planner_image'}]),rich([video(),{kind:'local_omitted',type:'image/png',name:'x',alt:''}]),rich([video(),{...video(),id:'video-2'}])];
 for(const p of bad){assert.throws(()=>payloadSnapshot(p));assert.throws(()=>normalizeWorkspacePayload(p));}
});
test('local video metadata is retained but resume remains blocked',()=>{
 const {id,...m}=video();const p=rich([{...m,kind:'local_omitted'}]);assert.deepEqual(normalizeWorkspacePayload(p),p);assert.deepEqual(JSON.parse(JSON.stringify(payloadSnapshot(p))),p);assert.equal(workspaceHasOmissions(p),true);assert.throws(()=>restoredWorkspacePayload({payload:p}));
});
test('v3 downgrade writes/discards fail without changing persisted bytes',async()=>{
 const {repo,db}=setup();await repo.save('alice',input());const before={...row(db)};
 for(const version of [1,2]){await assert.rejects(repo.discard('alice',discardInput({schemaVersion:version})),errorCode('WORKSPACE_SCHEMA_CHANGED'));const p=version===1?payload():{...rich([]),schemaVersion:2};await assert.rejects(repo.save('alice',saveInput({schemaVersion:version,payload:p,expectedRevision:1,writeId:uuid(101)})),errorCode('WORKSPACE_SCHEMA_CHANGED'));}
 assert.deepEqual({...row(db)},before);
});
for(const mode of ['missing','owner','mime','race'])test(`video reference ${mode} fails closed`,async()=>{
 const {repo,db}=setup();const corrupt=()=>db.sql.prepare(mode==='mime'||mode==='race'?'UPDATE planner_media SET mime_type=\'image/png\' WHERE owner_id=\'alice\' AND id=\'video-1\'':'DELETE FROM planner_media WHERE owner_id=\'alice\' AND id=\'video-1\'').run();
 if(mode==='race'){const original=db.batch.bind(db);let count=0;db.batch=async stmts=>{if(++count===2)corrupt();return original(stmts);};}else corrupt();await assert.rejects(repo.save('alice',input()),errorCode('WORKSPACE_MEDIA_UNAVAILABLE'));assert.equal(row(db),undefined);
});
test('client v3 envelope and exact metadata conflict preservation',async()=>{
 const {repo,db}=setup();await repo.save('alice',input());db.sql.prepare('UPDATE planner_media SET alt_text=? WHERE owner_id=? AND id=?').run('changed','alice','video-1');const response=await repo.load('alice',uuid(1));const client=createWorkspaceClient({fetcher:async()=>Response.json(response)});const w=await client.read(uuid(1));assert.equal(w.mediaMetadataConflict,true);assert.throws(()=>restoredWorkspacePayload(w));assert.equal(restoredWorkspacePayload(w,{useCanonicalAlt:true}).mediaItems[0].kind,'planner_video');const wrong=createWorkspaceClient({fetcher:async()=>Response.json({...response,schemaVersion:2})});await assert.rejects(wrong.read(uuid(1)));
});
test('controller retains v3 after removal but new image workspace stays v2',async()=>{
 const {createWorkspaceController}=await import('../../public/workspace-controller.js');const c=createWorkspaceController({setTimer:()=>1,clearTimer:()=>{}});c.open({payload:rich()});c.changed({...rich([]),schemaVersion:2});assert.equal(c.snapshot.payload.schemaVersion,3);c.open({payload:{...rich([]),schemaVersion:2}});assert.equal(c.snapshot.payload.schemaVersion,2);c.destroy();
});
