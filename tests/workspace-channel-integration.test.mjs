import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {D1TestAdapter} from './data/support.mjs';
import {createWorkspaceClient} from '../public/workspace-client.js';
import {payload} from './ui/workspace-fixtures.mjs';
const origin='https://planner.example';
function compiled(source){const context=vm.createContext({Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto,structuredClone,setTimeout,clearTimeout,performance,AbortController,Blob,ReadableStream},{codeGeneration:{strings:false,wasm:false}});new vm.Script(source.replace('export default ','globalThis.app=')).runInContext(context);return context.app;}
function env(){const DB=new D1TestAdapter();let maximumBinds=0;const prepare=DB.prepare.bind(DB);DB.prepare=query=>{const s=prepare(query),bind=s.bind.bind(s);s.bind=(...args)=>{maximumBinds=Math.max(maximumBinds,args.length);assert.ok(args.length<=100,`D1 maximum 100 parameters; saw ${args.length}`);return bind(...args);};return s;};return {DB,TAKT_SITE_ID:'workspace-channel-integration',TAKT_SITE_ORIGIN:origin,get maximumBinds(){return maximumBinds;}};}
function request(path,method='GET',body){return new Request(origin+path,{method,headers:{'oai-authenticated-user-id':'alice','X-Planner-Request':'1',Origin:origin,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
function maximum(){const {media,localMediaOmitted,...base}=payload();const channels=Array.from({length:20},(_,i)=>'channel-'+i),mediaItems=Array.from({length:200},(_,i)=>({kind:'planner_image',id:'image-'+i,name:'image-'+i+'.png',alt:'alt '+i,type:'image/png'}));return {...base,schemaVersion:4,channels,activeTextTarget:'base',variantTexts:{},mediaItems,channelMediaRefs:Object.fromEntries(channels.map((id,c)=>[id,Array.from({length:10},(_,i)=>c*10+i)]))};}
function seed(e,p){e.DB.sql.prepare("INSERT INTO planner_profiles(owner_id,revision,updated_at) VALUES('alice',0,'fixture')").run();for(const m of p.mediaItems)e.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice',m.id,'alice/'+m.id,m.name,m.type,12,m.alt,'fixture');}
test('generated Worker saves and restores 200 distinct channel images within D1 100-bind limit, no planner or media mutations',async()=>{
 const h=compiled(await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8')),e=env(),p=maximum();seed(e,p);const client=createWorkspaceClient({fetcher:(path,options={})=>h.fetch(new Request(origin+path,{...options,headers:{...options.headers,Origin:origin,'oai-authenticated-user-id':'alice'}}),e)});
 const input={workspaceId:'channel-workspace-00001',expectedRevision:0,writeId:'channel-mutation-00001',sourcePostId:null,basePlannerRevision:0,payload:p};const saved=await client.save(input);assert.equal(saved.resolvedMediaItems.length,200);assert.deepEqual(saved.payload,p);assert.deepEqual((await client.read(input.workspaceId)).payload,p);assert.ok(e.maximumBinds<=100);assert.ok(e.maximumBinds>0);assert.equal(e.DB.sql.prepare('SELECT count(*) n FROM planner_posts').get().n,0);assert.equal(e.DB.sql.prepare('SELECT count(*) n FROM planner_media').get().n,200);
 const newer=structuredClone(p);newer.channelMediaRefs['channel-19'].reverse();const next=await client.save({...input,expectedRevision:1,writeId:'channel-mutation-00002',payload:newer});assert.deepEqual(next.payload.channelMediaRefs['channel-19'],newer.channelMediaRefs['channel-19']);assert.equal(next.revision,2);assert.ok(e.maximumBinds<=100);
});
test('generated archive/channel-readable fallback blocks every workspace route and planner mutation with v4 rows retained',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-channel-fallback-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));const build=spawnSync(process.execPath,['scripts/build-archive-fallback.mjs','--output-directory',directory],{cwd:new URL('../',import.meta.url),encoding:'utf8'});assert.equal(build.status,0,build.stderr);const h=compiled(await readFile(join(directory,'index.js'),'utf8')),e=env(),p=maximum();seed(e,p);
 // A future/recent payload is deliberately present: no fallback workspace DTO parsing or expiry writes may run.
 e.DB.sql.prepare("INSERT INTO planner_editor_workspaces(site_id,owner_id,workspace_id,schema_version,revision,state,source_post_id,base_planner_revision,payload_json,media_id,last_write_id,last_write_hash,last_operation,created_at_ms,updated_at_ms,expires_at_ms) VALUES(?,?,?,1,1,'active',NULL,0,?,NULL,?,'hash','save',1,1,2)").run(e.TAKT_SITE_ID,'alice','channel-workspace-00001',JSON.stringify(p),'channel-mutation-00001');
 const before=e.DB.sql.prepare('SELECT * FROM planner_editor_workspaces').get();for(const route of ['/api/planner/workspaces','/api/planner/workspaces/channel-workspace-00001','/api/planner/workspaces/channel-workspace-00001/discard'])for(const method of ['GET','HEAD','PUT','POST','DELETE'])assert.equal((await h.fetch(request(route,method),e)).status,503,method+' '+route);
 for(const route of ['/api/planner/state','/api/planner/media','/api/planner/channel-media'])assert.equal((await h.fetch(request(route,'POST'),e)).status,503);
 assert.deepEqual(e.DB.sql.prepare('SELECT * FROM planner_editor_workspaces').get(),before);assert.equal((await h.fetch(request('/api/planner/state'),e)).status,200);const html=await (await h.fetch(request('/'),e)).text();assert.match(html,/archive/);assert.equal((await h.fetch(request('/workspace-channel-media.js'),e)).status,200);
});
