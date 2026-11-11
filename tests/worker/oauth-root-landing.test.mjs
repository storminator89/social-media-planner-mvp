import test from 'node:test';
import assert from 'node:assert/strict';
import {createSitesHandler} from '../../worker/handler.mjs';
import built from '../../dist/server/index.js';
const origin='https://planner.example';
const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
const assets={'/index.html':{body:'<h1>Static planner</h1>',type:'text/html'}};
const request=(path,headers=navigation,method='GET',owner='alice')=>new Request(origin+path,{method,headers:{...headers,...(owner===null?{}:{'oai-authenticated-user-id':owner})}});
for(const [name,handler] of [['source',createSitesHandler({assets})],['generated',built]]){
 test(`${name}: only exact OAuth root results admit authenticated top-level GET`,async()=>{
  let reads=0;const env={DB:{prepare(){reads++;throw Error('No database read allowed');},batch(){reads++;throw Error('No write allowed');}}};
  const ordinary=await(await handler.fetch(request('/',{}),env)).text();
  for(const provider of ['linkedin','youtube','x'])for(const outcome of ['linked','cancelled','failed','unconfirmed']){
   const path=`/?${provider}=${outcome}`;
   for(const headers of [navigation,{...navigation,Origin:origin}]){
    const result=await handler.fetch(request(path,headers),env);assert.equal(result.status,200,path);assert.equal(await result.text(),ordinary,'query cannot change document or establish connection');assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.headers.get('vary'),'oai-authenticated-user-id');assert.equal(result.headers.get('access-control-allow-origin'),null);assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'none'/);
   }
   for(const owner of [null,'',' ','a'.repeat(257)])assert.equal((await handler.fetch(request(path,navigation,'GET',owner),env)).status,401);
   for(const method of ['HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await handler.fetch(request(path,navigation,method),env)).status,403);
   for(const headers of [{...navigation,Origin:'https://evil.example'},{...navigation,Origin:'null'},{...navigation,Origin:''},{...navigation,'Sec-Fetch-Mode':'cors'},{...navigation,'Sec-Fetch-Mode':'same-origin'},{...navigation,'Sec-Fetch-Mode':''},{...navigation,'Sec-Fetch-Dest':'iframe'},{...navigation,'Sec-Fetch-Dest':'frame'},{...navigation,'Sec-Fetch-Dest':'script'},{...navigation,'Sec-Fetch-Dest':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await handler.fetch(request(path,headers),env)).status,403);
   assert.equal((await handler.fetch(request(path),{})).status,503,'DB availability remains mandatory');
  }
  for(const path of ['/','/?linkedin=','/?linkedin=success','/?linkedin=LINKED','/?linkedin=linked&x=linked','/?linkedin=linked&linkedin=linked','/?linkedin=linked&','/?linkedin=linked&owner=alice','/?linkedin=linked&code=secret','/?%6cinkedin=linked','/?linkedin=%6cinked','/?mastodon=linked','/?youtube=linked/','/index.html?linkedin=linked','/bootstrap.mjs?linkedin=linked','/connections.js?x=linked','/api/planner/state?linkedin=linked','/api/providers/status?youtube=linked','/api/providers/linkedin/oauth/readiness?linkedin=linked','/api/providers/youtube/oauth/start?youtube=linked','/api/providers/x/disconnect?x=linked'])assert.equal((await handler.fetch(request(path),env)).status,403,path);
  assert.equal(reads,0,'static result never queries or mutates connection/planner state');
 });
 test(`${name}: forged linked query does not enable any provider`,async()=>{
  const env={DB:{prepare(){throw Error('Unexpected DB access');},batch(){throw Error('Unexpected write');}}};
  for(const provider of ['linkedin','youtube','x']){
   assert.equal((await handler.fetch(request(`/?${provider}=linked`),env)).status,200);
   const response=await handler.fetch(request(`/api/providers/${provider}/oauth/readiness`,{}),env);
   assert.equal(response.status,200);const status=await response.json();assert.equal(status.stage,'not_configured');assert.equal(status.connection,null);assert.equal(provider==='x'?status.connected:status.capabilities.accountVerification,false);
  }
 });
}
