import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {createSitesHandler} from '../../worker/handler.mjs';
import {D1TestAdapter,R2TestAdapter,fixture,png} from '../data/support.mjs';

const origin='https://planner.example';
function req(path='/',{owner='alice',method='GET',body,headers={}}={}){return new Request(origin+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),...(body&&typeof body==='object'&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{}),...headers},body:body?body instanceof Uint8Array?body:JSON.stringify(body):undefined});}
const assets={'/index.html':{body:'<h1>Planner</h1>',type:'text/html'},'/bootstrap.mjs':{body:'export{}',type:'text/javascript'}};
const environment=()=>({DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()});
const write={method:'PUT',headers:{'Origin':origin,'X-Planner-Request':'1'}};

test('anonymous requests never acquire an owner or a fallback workspace',async()=>{
  const handler=createSitesHandler({assets});const DB={prepare(){throw new Error('must not touch DB')},batch(){throw new Error('must not touch DB')}};
  const html=await handler.fetch(req('/',{owner:null}),{DB});assert.equal(html.status,401);assert.match(await html.text(),/href="\/signin-with-chatgpt\?return_to=%2F" target="_top"/);
  for(const path of ['/api/planner/state','/api/providers/status','/bootstrap.mjs'])assert.equal((await handler.fetch(req(path,{owner:null}),{DB})).status,401);
  assert.equal((await handler.fetch(req('/api/planner/state',{owner:null,headers:{'OAI-Sites-Authorization':'Bearer fake'}}),{DB})).status,401);
});
test('Dispatch-owned auth routes are never implemented as application callbacks',async()=>{for(const path of ['/signin-with-chatgpt','/signout-with-chatgpt','/callback'])assert.equal((await createSitesHandler({assets}).fetch(req(path),{})).status,404);});
test('missing hosted DB fails closed with no runtime DDL or replacement local database',async()=>{const response=await createSitesHandler({assets}).fetch(req('/'),{});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'STORAGE_UNAVAILABLE');});
test('embedded assets use exact inventory, no source/runtime filesystem paths and hardened headers',async()=>{
  const handler=createSitesHandler({assets}),env=environment();const html=await handler.fetch(req('/'),env);assert.equal(html.status,200);assert.equal(html.headers.get('cache-control'),'private, no-store');assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(html.headers.get('vary'),'oai-authenticated-user-id');
  for(const path of ['/server/storage.mjs','/.local/planner.sqlite','/modules/data/repository.mjs','/%2e%2e/server/storage.mjs','/constructor','/api/unknown'])assert.equal((await handler.fetch(req(path),env)).status,404);
  const head=await handler.fetch(req('/bootstrap.mjs',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal((await handler.fetch(req('/',{method:'POST'}),env)).status,405);
});
test('owner-scoped planner roundtrip and stale write run through real Worker handler',async()=>{
  const handler=createSitesHandler({assets}),env=environment();const saved=await handler.fetch(req('/api/planner/state',{...write,body:fixture()}),env);assert.equal(saved.status,200);const state=await saved.json();assert.equal(state.posts.length,1);assert.equal(state.capabilities.automaticPublishing,false);
  assert.equal((await (await handler.fetch(req('/api/planner/state',{owner:'bob'}),env)).json()).posts.length,0);
  assert.equal((await handler.fetch(req('/api/planner/state',{...write,body:fixture()}),env)).status,409);
  assert.equal((await (await handler.fetch(req('/api/planner/state'),env)).json()).revision,state.revision);
});
test('Worker denies cross-origin and absent write marker before planner mutation',async()=>{
  const handler=createSitesHandler({assets}),env=environment();for(const headers of [{'Origin':'https://evil.example','X-Planner-Request':'1'},{'Sec-Fetch-Site':'cross-site','X-Planner-Request':'1'},{}])assert.equal((await handler.fetch(req('/api/planner/state',{method:'PUT',body:fixture(),headers}),env)).status,403);
  assert.equal((await (await handler.fetch(req('/api/planner/state'),env)).json()).revision,0);
});
test('R2 contract streams only owner media and unavailable bucket cannot accept upload',async()=>{
  const handler=createSitesHandler({assets}),env=environment(),options={method:'POST',body:png,headers:{'X-Planner-Request':'1','Content-Type':'image/png','X-Planner-Alt-Text':'Synthetic'}};
  const result=await handler.fetch(req('/api/planner/media',options),env);assert.equal(result.status,201);const media=await result.json();assert.match(media.url,/^\/api\/planner\/media\//);
  const content=await handler.fetch(req(media.url),env);assert.deepEqual(new Uint8Array(await content.arrayBuffer()),png);assert.equal((await handler.fetch(req(media.url,{owner:'bob'}),env)).status,404);
  assert.equal((await handler.fetch(req('/api/planner/media',options),{DB:env.DB})).status,503);
});
test('provider status is read-only and absent implementation is not a fabricated connection',async()=>{
  const handler=createSitesHandler({assets,providerStatus:null}),env=environment();assert.equal((await handler.fetch(req('/api/providers/status'),env)).status,503);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await handler.fetch(req('/api/providers/status',{method}),env)).status,405);
  for(const path of ['/api/providers/connect','/api/providers/oauth/callback','/api/providers/publish','/api/jobs/run'])assert.equal((await handler.fetch(req(path,{method:'POST'}),env)).status,404);
});
test('provider/internal exceptions are generic and never disclose SQL or tokens',async()=>{
  const response=await createSitesHandler({assets,providerStatus(){throw new Error('sensitive database connection token=secret')}}).fetch(req('/api/providers/status'),environment());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/sensitive|token|secret|database/);
});
test('Sites bootstrap supplies all planning channels and truthful server config',async()=>{
  let received;const source=readFileSync(new URL('../../worker/bootstrap.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace("await import('./app.js');",'');const c=vm.createContext({window:{},CHANNELS:[{id:'instagram'}],createTaktStore:config=>{received=config;return {}}});vm.runInContext(source,c);assert.deepEqual(received.channels,[{id:'instagram'}]);assert.equal(c.window.TaktConfig.storageMode,'server');assert.doesNotMatch(c.window.TaktConfig.storageDescription,/gemeinsamer lokaler/);
});
test('generated ESM artifact is deterministic, self-contained and uses the same authenticated API',async t=>{
  const root=new URL('../../',import.meta.url),script=new URL('../../scripts/build-worker.mjs',import.meta.url),directory=mkdtempSync(join(tmpdir(),'takt-worker-build-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const args=[script.pathname,'--output-directory',directory];assert.equal(spawnSync(process.execPath,args,{cwd:root}).status,0);const first=readFileSync(join(directory,'index.js'));assert.equal(spawnSync(process.execPath,args,{cwd:root}).status,0);assert.deepEqual(readFileSync(join(directory,'index.js')),first);assert.deepEqual(readFileSync(new URL('../../dist/server/index.js',import.meta.url)),first);
  const handler=(await import('../../dist/server/index.js')).default;assert.equal(typeof handler.fetch,'function');assert.equal((await handler.fetch(req('/api/planner/state',{owner:null}),{})).status,401);const env=environment();const html=await handler.fetch(req('/'),env);assert.equal(html.status,200);assert.match(await html.text(),/bootstrap.mjs/);const boot=await (await handler.fetch(req('/bootstrap.mjs'),env)).text();assert.match(boot,/Server-Speicher/);assert.doesNotMatch(boot,/local-preview-workspace|node:sqlite/);
  const saved=await handler.fetch(req('/api/planner/state',{...write,body:fixture()}),env);assert.equal(saved.status,200);assert.equal((await saved.json()).posts.length,1);
});
