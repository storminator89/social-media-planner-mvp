import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorWorkspaceRepository as UnsafeOldRepository} from './fixtures/legacy-workspace-repository-v0.10.0.mjs';
import {setup,payload,saveInput,discardInput,uuid,row,errorCode} from './support.mjs';
const v2=()=>{const {media,localMediaOmitted,...p}=payload();return {...p,schemaVersion:2,mediaItems:[]};};
const create=repo=>repo.save('alice',saveInput({schemaVersion:2,payload:v2()}));
test('negative regression proof: unmodified v46 backend destroys v2 through matching-revision old save',async()=>{
 const {db,repo}=setup();await create(repo);const old=new UnsafeOldRepository(db,{siteId:'test-site',clock:()=>1_000_000});await old.save('alice',saveInput({expectedRevision:1,writeId:uuid(101)}));assert.equal(row(db).revision,2);assert.equal(JSON.parse(row(db).payload_json).schemaVersion,undefined);
});
test('negative regression proof: unmodified v46 backend closes v2 through old discard',async()=>{
 const {db,repo}=setup();await create(repo);const old=new UnsafeOldRepository(db,{siteId:'test-site',clock:()=>1_000_000});await old.discard('alice',discardInput());assert.equal(row(db).revision,2);assert.equal(row(db).state,'discarded');
});
test('backend-preserving UI rollback blocks stale and matching old requests without mutation',async()=>{
 const {db,repo}=setup();await create(repo);const before={...row(db)};for(const expectedRevision of [0,1,2]){await assert.rejects(repo.save('alice',saveInput({expectedRevision,writeId:uuid(101)})),errorCode('WORKSPACE_SCHEMA_CHANGED'));if(expectedRevision>0)await assert.rejects(repo.discard('alice',discardInput({expectedRevision})),errorCode('WORKSPACE_SCHEMA_CHANGED'));assert.deepEqual({...row(db)},before);}
});

test('actual rollback artifact embeds v46 UI but refuses old matching/stale writes against v2',async t=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os'),{spawnSync}=await import('node:child_process'),{default:vm}=await import('node:vm');
 const directory=await mkdtemp(join(tmpdir(),'takt-rollback-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const built=spawnSync(process.execPath,['scripts/build-workspace-rollback.mjs','--output-directory',directory],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const source=await readFile(join(directory,'index.js'),'utf8');const context=vm.createContext({Date:class extends Date{static now(){return 1_000_000;}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto,structuredClone,setTimeout,clearTimeout,performance,AbortController,Blob,ReadableStream},{codeGeneration:{strings:false,wasm:false}});new vm.Script(source.replace('export default ','globalThis.app=')).runInContext(context);
 const {repo,db}=setup();await create(repo);const before={...row(db)},origin='https://rollback.example',env={DB:db,TAKT_SITE_ID:'test-site',TAKT_SITE_ORIGIN:origin};
 const send=(suffix,body,method)=>context.app.fetch(new Request(origin+'/api/planner/workspaces/'+uuid(1)+suffix,{method,headers:{'oai-authenticated-user-id':'alice',Origin:origin,'X-Planner-Request':'1','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 for(const expectedRevision of [1,2])for(const kind of ['save','discard']){const {workspaceId,...body}=kind==='save'?saveInput({expectedRevision,writeId:uuid(101)}):discardInput({expectedRevision});const response=await send(kind==='save'?'':'/discard',body,kind==='save'?'PUT':'POST');assert.equal(response.status,503);assert.equal((await response.json()).error.code,'WORKSPACE_UNAVAILABLE');assert.deepEqual({...row(db)},before);}
 const {workspaceId,...newBody}=saveInput({schemaVersion:2,payload:v2(),expectedRevision:1,writeId:uuid(110)});assert.equal((await send('',newBody,'PUT')).status,503);assert.deepEqual({...row(db)},before);
 // Suspension is blanket: legacy rows, fresh identities and both protocols.
 await repo.save('alice',saveInput({workspaceId:uuid(2)}));const legacyBefore={...row(db,'alice',uuid(2))};
 for(const schemaVersion of [1,2])for(const target of [uuid(2),uuid(3)])for(const discard of [false,true]){const request=discard?discardInput({schemaVersion,workspaceId:target}):saveInput({schemaVersion,workspaceId:target,expectedRevision:target===uuid(2)?1:0,payload:schemaVersion===2?v2():payload()});const {workspaceId,...body}=request;const response=await context.app.fetch(new Request(origin+'/api/planner/workspaces/'+target+(discard?'/discard':''),{method:discard?'POST':'PUT',headers:{'oai-authenticated-user-id':'alice',Origin:origin,'X-Planner-Request':'1','Content-Type':'application/json'},body:JSON.stringify(body)}),env);assert.equal(response.status,503);assert.deepEqual({...row(db,'alice',uuid(2))},legacyBefore);assert.equal(row(db,'alice',uuid(3)),undefined);}
 const client=await context.app.fetch(new Request(origin+'/workspace-client.js',{headers:{'oai-authenticated-user-id':'alice'}}),env);const ui=await client.text();assert.equal(client.status,200);assert.ok(!ui.includes('mediaItems'));assert.ok(ui.includes('v.schemaVersion!==1'));
 const read=await context.app.fetch(new Request(origin+'/api/planner/workspaces/'+uuid(1),{headers:{'oai-authenticated-user-id':'alice'}}),env);assert.equal(read.status,200);assert.equal((await read.json()).schemaVersion,2);
 const manifest=JSON.parse(await readFile(join(directory,'rollback-manifest.json'),'utf8'));assert.equal(manifest.mode,'v46-ui-current-guarded-backend');assert.equal(manifest.deployed,false);assert.equal(manifest.workspaceWrites,'disabled');
 const again=spawnSync(process.execPath,['scripts/build-workspace-rollback.mjs','--output-directory',directory],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});assert.equal(again.status,0,again.stderr);assert.equal(await readFile(join(directory,'index.js'),'utf8'),source);
});
