import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createSitesHandler} from '../worker/handler.mjs';
import {createLocalHandler} from '../server/handler.mjs';
import {D1TestAdapter,fixture} from './data/support.mjs';
import {createWorkspaceController} from '../public/workspace-controller.js';
import {createWorkspaceClient} from '../public/workspace-client.js';
import {createPlannerClient} from '../modules/data/client.mjs';
import {createTaktStore} from '../modules/data/takt-adapter.mjs';
import {payload} from './ui/workspace-fixtures.mjs';
const origin='https://planner.example',prefix='/api/planner/workspaces';
const env=()=>({DB:new D1TestAdapter(),TAKT_SITE_ID:'workspace-integration',TAKT_SITE_ORIGIN:origin});
const input=(extra={})=>({workspaceId:'workspace-integration-0001',expectedRevision:0,writeId:'write-integration-00001',sourcePostId:null,basePlannerRevision:null,payload:payload(),...extra});
function req(path,{owner='alice',method='GET',body,headers={}}={}){return new Request(origin+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),...(body?{'content-type':'application/json',Origin:origin,'X-Planner-Request':'1'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
function clients(handler,e,owner='alice'){const fetcher=(path,options={})=>handler.fetch(new Request(origin+path,{...options,headers:{...options.headers,Origin:origin,'oai-authenticated-user-id':owner}}),e);return {workspace:createWorkspaceClient({fetcher}),planner:createPlannerClient({fetcher})};}

test('real hosted boundary keeps workspace config explicit and no public identity fallback',async()=>{
 const h=createSitesHandler(),e=env();for(const owner of [null,''])assert.equal((await h.fetch(req(prefix,{owner}),e)).status,401);
 assert.equal((await h.fetch(req(prefix,{owner:null,headers:{'OAI-Sites-Authorization':'Bearer fixture'}}),e)).status,401);
 for(const bad of [{DB:e.DB},{...e,TAKT_SITE_ORIGIN:'http://planner.example'},{...e,TAKT_SITE_ORIGIN:'https://other.example'}])assert.ok([400,503].includes((await h.fetch(req(prefix),bad)).status));
 assert.equal((await h.fetch(req('/api/planner/state'),{DB:e.DB})).status,200);
 assert.equal((await h.fetch(req(prefix),{...e,DB:new D1TestAdapter({through:6})})).status,503);
});
test('fixed origin, CSRF, owner and malformed-path guards precede workspace mutation',async()=>{
 const h=createSitesHandler(),e=env(),i=input(),{workspaceId,...body}={schemaVersion:1,...i};
 for(const headers of [{Origin:'https://evil.example'},{Origin:''},{'X-Planner-Request':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await h.fetch(req(prefix+'/'+workspaceId,{method:'PUT',body,headers}),e)).status,403);
 assert.equal((await h.fetch(req(prefix+'?owner=bob'),e)).status,400);
 const ok=await h.fetch(req(prefix+'/'+workspaceId,{method:'PUT',body}),e);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');assert.match(ok.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await h.fetch(req(prefix+'/'+workspaceId,{owner:'bob'}),e)).status,404);
 assert.deepEqual((await clients(h,e,'bob').workspace.list()).workspaces,[]);
});
test('real client/handler/DB preserves incomplete input, multitab conflict, post independence and minimal discard',async()=>{
 const h=createSitesHandler(),e=env(),a=clients(h,e),b=clients(h,e);
 const first=await a.workspace.save(input());assert.deepEqual(first.payload,payload());assert.equal((await a.planner.load()).revision,0);
 const second=await b.workspace.save(input({expectedRevision:1,writeId:'write-integration-00002',payload:payload({text:'second tab'})}));assert.equal(second.revision,2);
 await assert.rejects(a.workspace.save(input({expectedRevision:1,writeId:'write-integration-00003'})),x=>x.status===409);
 assert.equal((await a.workspace.read(first.workspaceId)).payload.text,'second tab');
 const receipt=await a.workspace.discard({workspaceId:first.workspaceId,expectedRevision:2,writeId:'discard-integration-0001'});assert.equal(receipt.state,'discarded');assert.equal(receipt.payload,undefined);
 await assert.rejects(a.workspace.read(first.workspaceId),x=>x.status===410&&x.closed.state==='discarded'&&!Object.hasOwn(x.closed,'payload'));
 const list=await a.workspace.list();assert.equal(list.capacity.active,0);assert.equal(list.capacity.total,1);assert.equal((await a.planner.load()).posts.length,0);
});
test('revision getter matches the exact confirmed planner snapshot, never a failed or stale write',async()=>{
 const h=createSitesHandler(),e=env(),a=clients(h,e),b=clients(h,e),store=createTaktStore({client:a.planner,timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});
 assert.equal(store.plannerRevision,null);const initial=await store.load();assert.equal(store.plannerRevision,0);assert.equal(Object.getOwnPropertyDescriptor(store,'plannerRevision').set,undefined);
 await b.planner.save(fixture());await assert.rejects(store.save(initial),x=>x.status===409);assert.equal(store.plannerRevision,0);
 const loaded=await store.load();assert.equal(store.plannerRevision,1);const confirmed=await store.save(loaded);assert.equal(store.plannerRevision,2);
 const source=await a.workspace.save(input({sourcePostId:'post-1',basePlannerRevision:2}));assert.equal(source.basePlannerRevision,2);
 await store.save({...confirmed,posts:[]});const read=await a.workspace.read(source.workspaceId);assert.equal(read.basePlannerRevision,2);assert.equal(read.currentPlannerRevision,3);assert.equal(read.sourceExists,false);
});
test('lost post-commit workspace response is reconciled by same ID without additional write',async()=>{
 const h=createSitesHandler(),e=env(),a=clients(h,e);const batch=e.DB.batch.bind(e.DB);let lose=true,count=0;
 e.DB.batch=async stmts=>{count++;const result=await batch(stmts);if(lose){lose=false;throw Error('private SQL fixture');}return result;};
 const request=input();await assert.rejects(a.workspace.save(request),x=>x.status===503&&x.code==='WORKSPACE_STORAGE_UNCERTAIN');assert.equal(count,1);
 const read=await a.workspace.read(request.workspaceId);assert.equal(read.revision,1);assert.equal(read.writeId,request.writeId);assert.equal(count,2);
 assert.equal(e.DB.sql.prepare('SELECT count(*) n FROM planner_editor_workspaces').get().n,1);
});
test('real local handler routes the transferred request body, persists after reopening and rejects spoofed identity',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-workspace-local-')),localOrigin='http://127.0.0.1:4173';let app=createLocalHandler({directory,siteOrigin:localOrigin});t.after(async()=>{app.close();await rm(directory,{recursive:true,force:true});});
 const client=createWorkspaceClient({fetcher:(path,options={})=>app.fetch(new Request(localOrigin+path,{...options,headers:{...options.headers,Origin:localOrigin}}))});
 const saved=await client.save(input());assert.equal(saved.payload.localMediaOmitted,true);app.close();app=createLocalHandler({directory,siteOrigin:localOrigin});assert.deepEqual((await client.read(saved.workspaceId)).payload,payload());
 assert.equal((await app.fetch(new Request(localOrigin+prefix,{headers:{'oai-authenticated-user-id':'alice'}}))).status,400);
 assert.equal((await app.fetch(new Request('http://localhost:4173'+prefix))).status,400);
});
test('actual generated Worker executes workspace save/CAS/reconciliation in WebAPI-only context',async()=>{
 const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');const sandbox={Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto,structuredClone,setTimeout,clearTimeout,performance,AbortController,Blob,ReadableStream};
 const context=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});new vm.Script(source.replace('export default ','globalThis.app=')).runInContext(context);const e=env(),a=clients(context.app,e);
 const first=await a.workspace.save(input());assert.equal(first.revision,1);assert.equal((await a.workspace.list()).capacity.active,1);await assert.rejects(a.workspace.save(input({writeId:'different-write-0001'})),x=>x.status===409);
 assert.equal((await clients(context.app,e,'bob').workspace.list()).capacity.active,0);
 assert.equal(sandbox.process,undefined);assert.equal(sandbox.fetch,undefined);
});
test('owned media resolution preserves omission and alt conflicts without any file upload or post mutation',async()=>{
 const h=createSitesHandler(),e=env(),a=clients(h,e);for(const owner of ['alice','bob'])e.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run(owner,'image-1',owner+'/secret-key','Synthetic.png','image/png',12,'Canonical alt','fixture');
 const saved=await a.workspace.save(input({payload:payload({localMediaOmitted:false,media:{kind:'planner_image',id:'image-1',alt:'Different working alt'}})}));
 assert.equal(saved.mediaMetadataConflict,true);assert.equal(saved.resolvedMedia.alt,'Canonical alt');assert.equal(saved.payload.media.alt,'Different working alt');assert.equal(saved.resolvedMedia.url,'/api/planner/media/image-1');assert.ok(!JSON.stringify(saved).includes('secret-key'));assert.equal((await a.planner.load()).posts.length,0);
 e.DB.sql.prepare("INSERT INTO planner_media VALUES('bob','foreign-image','bob/foreign','Other.png','image/png',12,'Alt','fixture')").run();
 await assert.rejects(a.workspace.save(input({workspaceId:'workspace-other-00001',payload:payload({localMediaOmitted:false,media:{kind:'planner_image',id:'foreign-image',alt:'Alt'}})})),x=>x.status===400);
 const omitted=await a.workspace.save(input({workspaceId:'workspace-omitted-0001'}));assert.equal(omitted.payload.localMediaOmitted,true);assert.equal(omitted.resolvedMedia,null);assert.equal(e.DB.sql.prepare('SELECT count(*) n FROM planner_media').get().n,3);
});
test('actual controller reconciles lost save and closed410 discard receipts through real HTTP and SQLite',async t=>{
 const h=createSitesHandler(),e=env(),a=clients(h,e);let ids=0;const c=createWorkspaceController({client:a.workspace,uuid:()=>`controller-identifier-${++ids}`,setTimer:()=>1,clearTimer:()=>{}});t.after(()=>c.destroy());
 c.open({payload:payload()});c.changed(payload({text:'Confirmed draft body'}));const batch=e.DB.batch.bind(e.DB);let lose=true,writes=0;
 e.DB.batch=async statements=>{const result=await batch(statements);if(lose){lose=false;writes++;throw Error('postcommit fixture');}return result;};
 await c.save();assert.equal(c.snapshot.phase,'uncertain');assert.equal(c.snapshot.pendingWrite,true);assert.equal((await a.planner.load()).revision,0);
 await c.reconcile();assert.equal(c.snapshot.phase,'saved');assert.equal(c.snapshot.pendingWrite,false);assert.equal(c.snapshot.workspace.revision,1);assert.equal(writes,1);
 await a.planner.save(fixture());lose=true;assert.equal(await c.completed(),false);assert.equal(c.snapshot.phase,'uncertain');
 await c.reconcile();assert.equal(c.snapshot.phase,'closed');assert.equal(c.snapshot.pendingWrite,false);assert.equal((await a.planner.load()).revision,1);assert.equal((await a.workspace.list()).capacity.total,1);
});
