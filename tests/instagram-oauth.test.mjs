import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInstagramCodeVerifier} from '../modules/instagram/oauth-transport.mjs';
import {INSTAGRAM_SCOPES} from '../modules/instagram/contract.mjs';
import {handleInstagramOAuth,INSTAGRAM_READINESS_PATH} from '../modules/instagram/http-router.mjs';
const configuration={appId:'123',expectedAccountId:'456',redirectUri:'https://takt.example/api/providers/instagram/oauth/callback',apiVersion:'v27.0'};
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const token=()=>response({data:[{access_token:'fixture-token',user_id:'456',permissions:INSTAGRAM_SCOPES.join(',')}]});
const identity=()=>response({data:[{user_id:'456',username:'fixture_user'}]});
const make=(transport,extra={})=>createInstagramCodeVerifier({configuration,clientSecret:'fixture-secret',transport,...extra});
test('protocol performs bounded multipart exchange and pinned identity read, without connection claim',async()=>{
 const requests=[];const flow=make(async req=>{requests.push(req);return requests.length===1?token():identity();});const result=await flow.verifyCode('fixture-code');
 assert.equal(requests.length,2);assert.equal(requests[0].url,'https://api.instagram.com/oauth/access_token');assert.equal(requests[0].method,'POST');assert.equal((await requests[0].formData()).get('client_secret'),'fixture-secret');assert.equal(requests[1].headers.get('Authorization'),'Bearer fixture-token');for(const req of requests){assert.equal(req.redirect,'error');assert.equal(req.credentials,'omit');assert(!req.url.includes('fixture'));}
 assert.equal(result.status,'identity_verified_not_stored');assert.equal(result.connected,false);assert.equal(result.canPublish,false);assert.equal(result.accessToken,'fixture-token');assert(!JSON.stringify(result).includes('fixture-token'));
});
test('account mismatch and extra scopes fail before identity request',async()=>{for(const change of [{user_id:'999'},{permissions:INSTAGRAM_SCOPES.join(',')+',extra'}]){let calls=0;const flow=make(async()=>{calls++;return response({data:[{access_token:'fixture-token',user_id:'456',permissions:INSTAGRAM_SCOPES.join(','),...change}]});});await assert.rejects(flow.verifyCode('code'));assert.equal(calls,1);}});
test('identity mismatch is rejected',async()=>{let calls=0;await assert.rejects(make(async()=>++calls===1?token():response({data:[{user_id:'999',username:'other'}]})).verifyCode('code'),{code:'ACCOUNT_OR_GRANT_MISMATCH'});});
test('failed or malformed exchanges never retry and redact provider messages',async()=>{for(const bad of [new Response('secret-provider-details',{status:500}),new Response('{}',{headers:{'Content-Type':'text/html'}}),response({data:[]}),new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}})]){let calls=0;await assert.rejects(make(async()=>{calls++;return bad;}).verifyCode('code'),e=>!e.message.includes('secret-provider-details'));assert.equal(calls,1);}});
test('timeout aborts and late responses cannot start identity request',async()=>{let calls=0,signal;const flow=make(async req=>{calls++;signal=req.signal;await new Promise(resolve=>setTimeout(resolve,30));return token();},{timeoutMs:5});await assert.rejects(flow.verifyCode('code'),{code:'EXCHANGE_OUTCOME_UNKNOWN'});await new Promise(resolve=>setTimeout(resolve,50));assert(signal.aborted);assert.equal(calls,1);});
test('response stream body is covered by the deadline',async()=>{let signal;const flow=make(async req=>{signal=req.signal;return new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'application/json'}});},{timeoutMs:5});await assert.rejects(flow.verifyCode('code'),{code:'EXCHANGE_OUTCOME_UNKNOWN'});assert(signal.aborted);});
test('configuration rejects foreign version, non-HTTPS redirect, missing target and missing transport',()=>{for(const change of [{apiVersion:'v99.0'},{redirectUri:'http://localhost/callback'},{expectedAccountId:null}])assert.throws(()=>make(()=>{},{configuration:{...configuration,...change}}));assert.throws(()=>make(null));});
test('readiness stays closed with strict auth, origin, method checks and no callback',async()=>{
 const url='https://takt.example'+INSTAGRAM_READINESS_PATH;
 assert.equal((await handleInstagramOAuth(new Request(url))).status,401);
 const headers={'oai-authenticated-user-id':'owner'};
 assert.equal((await handleInstagramOAuth(new Request(url,{headers:{...headers,Origin:'https://evil.example'}}))).status,403);
 assert.equal((await handleInstagramOAuth(new Request(url,{headers,method:'POST'}))).status,405);
 const res=await handleInstagramOAuth(new Request(url,{headers}));assert.match(res.headers.get('Cache-Control'),/no-store/);const dto=await res.json();assert.equal(dto.connected,false);assert.equal(dto.authorizationUrl,null);assert.equal(dto.callbackPath,null);assert(Object.values(dto.capabilities).every(v=>v===false));
 assert.equal(await handleInstagramOAuth(new Request('https://takt.example/api/providers/instagram/oauth/callback?code=fixture')),null);
});
test('hosted router serves closed readiness without invoking any transport',async()=>{
 const {createSitesHandler}=await import('../worker/handler.mjs');let calls=0;
 const app=createSitesHandler({oauthTransport:()=>{calls++;throw new Error('Must not run');}});
 const env={DB:{prepare(){throw new Error('Must not run');},batch(){throw new Error('Must not run');}},TAKT_INSTAGRAM_ENABLED:'true'};
 const res=await app.fetch(new Request('https://takt.example'+INSTAGRAM_READINESS_PATH,{headers:{'oai-authenticated-user-id':'owner'}}),env);
 assert.equal(res.status,200);assert.equal((await res.json()).connected,false);assert.equal(calls,0);
});
test('untrusted provider envelopes, account identifiers, scopes and identities fail closed',async()=>{
 const good={access_token:'fixture-token',user_id:'456',permissions:INSTAGRAM_SCOPES.join(',')};
 for(const invalid of [{...good,user_id:456},{...good,user_id:'0456'},{...good,access_token:''},{...good,access_token:'token\nInjected: value'},{...good,permissions:INSTAGRAM_SCOPES[0]},{...good,permissions:[...INSTAGRAM_SCOPES]},{...good,permissions:INSTAGRAM_SCOPES.join(',')+','+INSTAGRAM_SCOPES[0]},{...good,expires_in:3600}]){
  let calls=0;await assert.rejects(make(async()=>{calls++;return response({data:[invalid]});}).verifyCode('code'));assert.equal(calls,1);
 }
 for(const invalid of [{user_id:'456',username:'<script>'},{user_id:456,username:'fixture'},{user_id:'456',username:'a'.repeat(31)},{user_id:'456',username:'fixture',access_token:'unsolicited'}]){
  let calls=0;await assert.rejects(make(async()=>++calls===1?token():response({data:[invalid]})).verifyCode('code'));assert.equal(calls,2);
 }
});
test('transport redirects and inconsistent declared response sizes never proceed',async()=>{
 for(const invalid of [new Response(null,{status:302,headers:{Location:'https://evil.example'}}),new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'65537'}}),new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'bad'}})]){
  let calls=0;await assert.rejects(make(async()=>{calls++;return invalid;}).verifyCode('code'));assert.equal(calls,1);
 }
});
