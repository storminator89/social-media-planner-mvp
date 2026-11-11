import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {D1TestAdapter,R2TestAdapter,fixture,png} from '../data/support.mjs';
import {EditorWorkspaceRepository} from '../../modules/workspaces/workspace-repository.mjs';
import {saveInput,payload} from '../workspaces/support.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore} from '../../public/data-client/takt-adapter.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';

test('candidate-built paused fallback preserves v4 workspace, archived history and ordered channel media; every planner write is rejected',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-batch-archive-fallback-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const built=spawnSync(process.execPath,['scripts/build-archive-fallback.mjs','--output-directory',directory],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const artifact=await readFile(join(directory,'index.js'),'utf8'),manifest=JSON.parse(await readFile(join(directory,'fallback-manifest.json'),'utf8'));assert.equal(manifest.workspaceProtocol,4);assert.equal(manifest.batchArchiveWrites,'paused');assert.equal(manifest.artifactSha256,createHash('sha256').update(artifact).digest('hex'));
 const ctx=vm.createContext({Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto,structuredClone,setTimeout,clearTimeout,performance,AbortController,Blob,ReadableStream},{codeGeneration:{strings:false,wasm:false}});new vm.Script(artifact.replace('export default ','globalThis.app=')).runInContext(ctx);
 const origin='https://fallback.example',env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fallback-test',TAKT_SITE_ORIGIN:origin};t.after(()=>env.DB.sql.close());
 const req=(path,method='GET',body,owner='alice',headers={})=>new Request(origin+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),Origin:origin,'X-Planner-Request':'1',...headers},...(!['GET','HEAD'].includes(method)&&body!==undefined?{body}: {})});
 const seed=createPlannerClient({fetcher:(path,options={})=>handlePlannerRequest(req(path,options.method,options.body,'alice',options.headers),env)});
 let state=await seed.save(fixture());const first=await seed.uploadMedia(new File([png],'first.png',{type:'image/png'}),'First'),second=await seed.uploadMedia(new File([png],'second.png',{type:'image/png'}),'Second');
 state=await seed.load();state.channels.push({...state.channels[0],id:'linkedin',platform:'linkedin',name:'LinkedIn'});const p=state.posts[0];p.stage='archived';p.scheduledAt='2026-10-25T01:30:17.123Z';p.variants[0].scheduledAt=p.scheduledAt;p.variants[0].statusNote='Hidden retained note';p.variants[0].mediaIds=[first.id,second.id];p.variants.push({...p.variants[0],id:'second-variant',channelId:'linkedin',body:'',inheritsBody:false,mediaIds:[second.id,first.id]});await seed.save(state);
 const {media,localMediaOmitted,...old}=payload();const v4={...old,schemaVersion:4,channels:['instagram','linkedin'],variantTexts:{linkedin:''},mediaItems:[first,second].map(m=>({kind:'planner_image',id:m.id,name:m.filename,alt:m.altText,type:m.mimeType})),channelMediaRefs:{instagram:[],linkedin:[1,0]}};
 const workspaces=new EditorWorkspaceRepository(env.DB,{siteId:env.TAKT_SITE_ID,clock:()=>1_000_000});await workspaces.save('alice',saveInput({schemaVersion:4,payload:v4}));
 const snapshot=()=>JSON.stringify({tables:env.DB.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,env.DB.sql.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]),bucket:[...env.BUCKET.data]});const before=snapshot();
 const call=(path,method='GET',body,owner='alice',headers={})=>ctx.app.fetch(req(path,method,body,owner,headers),env);
 const client=createPlannerClient({fetcher:(path,opts={})=>call(path,opts.method||'GET',opts.body,'alice',opts.headers)}),store=createTaktStore({client,timezone:'Europe/Berlin',channels:CHANNELS}),ui=normalizeState(await store.load());
 assert.equal(ui.posts[0].status,'archived');assert.deepEqual(ui.posts[0].channelMediaItems.instagram.map(m=>m.id),[first.id,second.id]);assert.deepEqual(ui.posts[0].channelMediaItems.linkedin.map(m=>m.id),[second.id,first.id]);
 const canonical=await client.load();assert.equal(canonical.posts[0].scheduledAt,'2026-10-25T01:30:17.123Z');assert.equal(canonical.posts[0].variants[0].statusNote,'Hidden retained note');
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of ['/api/planner','/api/planner/state','/api/planner/media','/api/planner/resolve-time','/api/planner/workspaces','/api/planner/workspaces/test-identifier-000001','/api/planner/workspaces/test-identifier-000001/discard']){
  const response=await call(path,method,'{}','alice',{'Content-Type':'application/json'});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'PLANNER_WRITES_PAUSED');assert.equal((await call(path,method,'{}',null)).status,401);
 }
 for(const path of ['/api/planner/workspaces','/api/planner/workspaces/test-identifier-000001'])for(const method of ['GET','HEAD'])assert.equal((await call(path,method)).status,503);
 for(const item of [first,second]){assert.deepEqual(new Uint8Array(await (await call(item.url)).arrayBuffer()),png);assert.equal((await call(item.url,'GET',undefined,'bob')).status,404);assert.equal((await call(item.url,'GET',undefined,null)).status,401);}
 for(const [header,value] of [['Origin','https://foreign.example'],['Sec-Fetch-Site','cross-site'],['X-Planner-Request','']])assert.equal((await call('/api/planner/state','PUT','{}','alice',{[header]:value})).status,403);
 for(const path of ['/workspace-client.js','/workspace-channel-media.js','/workspace-restore.js','/data-client/takt-adapter.mjs'])assert.equal(await (await call(path)).text(),await readFile(new URL('../../public'+path,import.meta.url),'utf8'));
 const app=await(await call('/app.js')).text();assert.ok(!app.includes('data-action="archive-drafts">Entwürfe archivieren</button>'));assert.ok(app.includes('disabled data-action="archive-copy-paused"'));assert.equal(snapshot(),before);
});
