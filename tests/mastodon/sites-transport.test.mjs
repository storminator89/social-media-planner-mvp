import test from 'node:test';
import assert from 'node:assert/strict';
import {createKanoaSitesTransport,probeKanoaSitesMetadata} from '../../modules/mastodon/sites-transport.mjs';
import {createHTTP,createDeadline} from '../../modules/oauth/x/http.mjs';
const base='https://kanoa.de',metadata='/.well-known/oauth-authorization-server';
const capabilities={issuer:base+'/',authorization_endpoint:base+'/oauth/authorize',token_endpoint:base+'/oauth/token',app_registration_endpoint:base+'/api/v1/apps',scopes_supported:['profile'],code_challenge_methods_supported:['S256']};
function response(request,body='{}',options={}){const r=new Response(body,{headers:{'Content-Type':'application/json'},...options});Object.defineProperty(r,'url',{value:request.url});return r;}
test('fixed metadata probe uses manual global-style fetch and sends no user headers',async()=>{
 let seen;const result=await probeKanoaSitesMetadata({fetchImpl:async r=>{seen=r;return response(r,JSON.stringify(capabilities));}});
 assert.equal(result.status,200);assert.equal(seen.url,base+metadata);assert.equal(seen.redirect,'manual');assert.equal(seen.credentials,'omit');assert.deepEqual([...seen.headers],[['accept','application/json'],['cache-control','no-store, no-cache'],['pragma','no-cache']]);
});
test('exact four endpoints and methods only, no URL supplied by users',async()=>{
 let count=0;const transport=createKanoaSitesTransport({fetchImpl:async r=>{count++;return response(r);}});
 for(const url of ['https://evil.test'+metadata,'http://kanoa.de'+metadata,base+metadata+'?x=1',base+metadata+'#x',base+'/oauth/authorize',base+'/api/v1/statuses',base+metadata+'/','https://kanoa.de:444'+metadata,'https://127.0.0.1'+metadata])await assert.rejects(transport(new Request(url)));
 await assert.rejects(transport(new Request(base+metadata,{method:'POST',body:'x'})));assert.equal(count,0);
});
test('fresh requests strip cookies, identity, origin and trace headers',async()=>{
 let seen;const transport=createKanoaSitesTransport({fetchImpl:async r=>{seen=r;return response(r);}});
 await transport(new Request(base+metadata,{headers:{Cookie:'secret',Origin:'https://private.test','oai-authenticated-user-id':'owner','X-Forwarded-For':'127.0.0.1'}}));
 assert.deepEqual([...seen.headers],[['accept','application/json'],['cache-control','no-store, no-cache'],['pragma','no-cache']]);
});
test('form uploads are bounded; authorization is accepted only for profile',async()=>{
 const calls=[];const transport=createKanoaSitesTransport({fetchImpl:async r=>{calls.push(r);return response(r);}});
 for(const path of ['/api/v1/apps','/oauth/token']){
  await transport(new Request(base+path,{method:'POST',body:new URLSearchParams({scope:'profile'})}));
  assert.equal(await calls.at(-1).text(),'scope=profile');assert.equal(calls.at(-1).headers.get('Content-Type'),'application/x-www-form-urlencoded');
  await assert.rejects(transport(new Request(base+path,{method:'POST',body:'x'.repeat(16385),headers:{'Content-Type':'application/x-www-form-urlencoded'}})));
 }
 await transport(new Request(base+'/api/v1/accounts/verify_credentials',{headers:{Authorization:'Bearer server-token',Cookie:'never'}}));
 assert.deepEqual([...calls.at(-1).headers],[['accept','application/json'],['authorization','Bearer server-token'],['cache-control','no-store, no-cache'],['pragma','no-cache']]);
 await assert.rejects(transport(new Request(base+'/api/v1/accounts/verify_credentials')));
 await assert.rejects(transport(new Request(base+metadata,{headers:{Authorization:'Bearer token'}})));
 assert.equal(calls.length,3);
});
test('shared response gate rejects redirects, wrong origin, oversized and duplicate JSON',async()=>{
 for(const fixture of [r=>response(r,'{}',{status:302,headers:{Location:'http://127.0.0.1/'}}),r=>response(new Request('https://other.test'),'{}'),r=>response(r,'{"a":"'+'x'.repeat(65536)+'"}'),r=>response(r,'{"a":1,"a":2}')])await assert.rejects(probeKanoaSitesMetadata({fetchImpl:async r=>fixture(r)}));
});
test('shared deadline aborts stalled fetch even if implementation ignores signal',async()=>{
 const d=createDeadline(25);let signal;
 try{await assert.rejects(createHTTP(createKanoaSitesTransport({fetchImpl:r=>{signal=r.signal;return new Promise(()=>{});}}))(base+metadata,{method:'GET'},d),/DEADLINE_EXCEEDED/);assert.equal(signal.aborted,true);}finally{d.close();}
});
test('shared deadline aborts stalled response stream and rejects already-aborted request',async()=>{
 const d=createDeadline(25);let cancelled=false;
 try{await assert.rejects(createHTTP(createKanoaSitesTransport({fetchImpl:async r=>response(r,new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}))}))(base+metadata,{method:'GET'},d),/DEADLINE_EXCEEDED/);assert.equal(cancelled,true);}finally{d.close();}
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(createKanoaSitesTransport({fetchImpl:()=>{calls++;}})(new Request(base+metadata,{signal:controller.signal})));assert.equal(calls,0);
});

test('metadata probe requires 2xx and every expected capability',async()=>{
 for(const status of [400,401,404,429,500,503])await assert.rejects(probeKanoaSitesMetadata({fetchImpl:async r=>response(r,JSON.stringify(capabilities),{status})}),/KANOA_METADATA_UNCONFIRMED/);
 for(const key of Object.keys(capabilities)){
  const missing={...capabilities};delete missing[key];
  await assert.rejects(probeKanoaSitesMetadata({fetchImpl:async r=>response(r,JSON.stringify(missing))}),/KANOA_METADATA_UNCONFIRMED/);
 }
 for(const changed of [{issuer:'https://evil.test'},{token_endpoint:base+'/other'},{authorization_endpoint:base+'/other'},{app_registration_endpoint:base+'/other'},{scopes_supported:['read']},{scopes_supported:'profile'},{scopes_supported:['profile',7]},{code_challenge_methods_supported:['plain']},{code_challenge_methods_supported:'S256'}])await assert.rejects(probeKanoaSitesMetadata({fetchImpl:async r=>response(r,JSON.stringify({...capabilities,...changed}))}),/KANOA_METADATA_UNCONFIRMED/);
});
test('deadline cancels stalled upload reader and never dispatches after abort',async()=>{
 const d=createDeadline(25);let cancelled=false,calls=0,transportSettled=false;
 const adapter=createKanoaSitesTransport({fetchImpl:async r=>{calls++;return response(r);}});
 const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 const transport=async r=>{try{return await adapter(r);}finally{transportSettled=true;}};
 try{
  await assert.rejects(createHTTP(transport)(base+'/api/v1/apps',{method:'POST',body,duplex:'half',headers:{'Content-Type':'application/x-www-form-urlencoded'}},d),/DEADLINE_EXCEEDED/);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(cancelled,true);assert.equal(transportSettled,true);assert.equal(calls,0);
 }finally{d.close();}
});

test('native Worker without cache or error redirect support probes with cache-control hints',async t=>{
 const NativeRequest=globalThis.Request;let constructed=0,dispatched=0;
 t.mock.method(globalThis,'Request',class extends NativeRequest{
  constructor(url,init){if(Object.hasOwn(init||{},'cache')||init?.redirect==='error')throw Error('Worker Request option unsupported PRIVATE');super(url,init);this.cf=init?.cf;constructed++;}
 });
 const result=await probeKanoaSitesMetadata({fetchImpl:async r=>{
  dispatched++;assert.equal(r.redirect,'manual');assert.equal(r.credentials,'omit');
  assert.deepEqual(r.cf,{cacheTtlByStatus:{'100-599':-1}});
  assert.equal(r.headers.get('Cache-Control'),'no-store, no-cache');assert.equal(r.headers.get('Pragma'),'no-cache');
  return response(r,JSON.stringify(capabilities));
 }});
 assert.equal(result.status,200);assert.equal(constructed,2);assert.equal(dispatched,1);
 const d=createDeadline(1000);
 try{await assert.rejects(createHTTP(()=>{throw Error('must not fetch');})(base+metadata,{method:'GET'},d),e=>e.code==='REQUEST_CONSTRUCTION_FAILED'&&!e.message.includes('PRIVATE'));}finally{d.close();}
});
