import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalHandler} from '../../server/handler.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {D1TestAdapter,R2TestAdapter} from '../data/support.mjs';

const oldPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const expected=oldPolicy.replace("img-src 'self' data: blob:;", "img-src 'self' data: blob:; media-src 'self' blob:;");
const env=()=>({DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()});
const assets={'/index.html':{body:'<h1>Isolated fixture</h1>',type:'text/html'},'/still.js':{body:'export {};',type:'text/javascript'}};
const hostedRequest=(path='/',headers={})=>new Request('https://takt-test.example'+path,{headers:{'oai-authenticated-user-id':'synthetic-reviewer',...headers}});
function verify(response){
 const policy=response.headers.get('content-security-policy');assert.equal(policy,expected);
 assert.equal(policy.replace(" media-src 'self' blob:;",''),oldPolicy);
 const directives=policy.split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(directives.filter(x=>x.startsWith('media-src ')).length,1);
 assert.equal(directives.find(x=>x.startsWith('media-src ')),"media-src 'self' blob:");
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.equal(response.headers.get('access-control-allow-origin'),null);
}

test('local document, script and HEAD get only the approved media directive',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-still-csp-'));const handler=createLocalHandler({directory});
 t.after(async()=>{handler.close();await rm(directory,{recursive:true,force:true});});
 for(const path of ['/','/video-still-picker.js']){const r=await handler.fetch(new Request('http://localhost:3000'+path));assert.equal(r.status,200);verify(r);}
 const r=await handler.fetch(new Request('http://localhost:3000/',{method:'HEAD'}));assert.equal(r.status,200);verify(r);assert.equal(await r.text(),'');
});

test('local origin and incoming identity restrictions remain enforced',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-still-origin-'));const handler=createLocalHandler({directory});
 t.after(async()=>{handler.close();await rm(directory,{recursive:true,force:true});});
 for(const [request,status] of [[new Request('https://remote.example/'),421],[new Request('http://localhost:3000/',{headers:{Origin:'https://remote.example'}}),403],[new Request('http://localhost:3000/',{headers:{'oai-authenticated-user-id':'spoofed'}}),400]]){const r=await handler.fetch(request);assert.equal(r.status,status);verify(r);}
});

test('hosted document and script expose the exact same narrow CSP',async()=>{
 const handler=createSitesHandler({assets});for(const path of ['/','/still.js']){const r=await handler.fetch(hostedRequest(path),env());assert.equal(r.status,200);verify(r);}
});

test('hosted anonymous and cross-site requests remain denied',async()=>{
 const handler=createSitesHandler({assets});const anonymous=await handler.fetch(new Request('https://takt-test.example/'),env());assert.equal(anonymous.status,401);verify(anonymous);
 const crossSite=await handler.fetch(hostedRequest('/',{'Sec-Fetch-Site':'cross-site'}),env());assert.equal(crossSite.status,403);verify(crossSite);
});

test('generated Worker preserves exact CSP and unchanged local still frontend bytes',async()=>{
 const handler=(await import('../../dist/server/index.js')).default;const r=await handler.fetch(hostedRequest(),env());assert.equal(r.status,200);verify(r);
 for(const name of ['image-studio.js','video-still-picker.js','video-still-model.js']){const response=await handler.fetch(hostedRequest('/'+name),env());assert.equal(response.status,200);verify(response);assert.equal(await response.text(),await readFile(new URL('../../public/'+name,import.meta.url),'utf8'));}
});
