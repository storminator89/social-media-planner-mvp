import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {D1TestAdapter,R2TestAdapter,fixture} from '../data/support.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore} from '../../public/data-client/takt-adapter.mjs';
import {CHANNELS} from '../../public/model.js';

test('deterministic current-source fallback disables idea reuse UI and denies a cached reuse without changing DB',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-idea-reuse-fallback-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const name of ['first','second']){const result=spawnSync(process.execPath,['scripts/build-archive-fallback.mjs','--output-directory',join(directory,name)],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 const artifact=await readFile(join(directory,'first/index.js'),'utf8');assert.equal(artifact,await readFile(join(directory,'second/index.js'),'utf8'));
 assert.equal(JSON.parse(await readFile(join(directory,'first/fallback-manifest.json'),'utf8')).ideaReuseWrites,'paused');
 const ctx=vm.createContext({Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto,structuredClone,setTimeout,clearTimeout,performance,AbortController,Blob,ReadableStream},{codeGeneration:{strings:false,wasm:false}});new vm.Script(artifact.replace('export default ','globalThis.app=')).runInContext(ctx);
 const origin='https://fallback.example',env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fallback-test',TAKT_SITE_ORIGIN:origin};t.after(()=>env.DB.sql.close());
 const req=(path,options={})=>new Request(origin+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice',Origin:origin}});
 const client=createPlannerClient({fetcher:(path,options)=>handlePlannerRequest(req(path,options),env)}),initial=fixture();initial.posts[0]={...initial.posts[0],id:'idea',stage:'idea',variants:[],scheduledAt:null,scheduleBinding:null,cover:null};await client.save(initial);
 const before=await client.load(),paused=createPlannerClient({fetcher:(path,options)=>ctx.app.fetch(req(path,options),env)}),store=createTaktStore({client:paused,timezone:'Europe/Berlin',channels:CHANNELS}),ui=await store.load();
 await assert.rejects(store.reuseIdea(ui,{postId:'idea'}),e=>e.code==='PLANNER_WRITES_PAUSED');assert.deepEqual(await client.load(),before);
 const app=await(await ctx.app.fetch(req('/app.js'),env)).text();assert.ok(app.includes('disabled data-idea-reuse-paused="${esc(idea.id)}"'));assert.ok(!app.includes('data-reuse-idea="${esc(idea.id)}"'));
 for(const path of ['/idea-reuse.js','/workspace-client.js','/workspace-channel-media.js','/workspace-restore.js','/editorial-library.css','/data-client/takt-adapter.mjs'])assert.equal(await(await ctx.app.fetch(req(path),env)).text(),await readFile(new URL('../../public'+path,import.meta.url),'utf8'));
});
