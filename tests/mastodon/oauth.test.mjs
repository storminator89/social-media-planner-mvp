import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {configuration,createMastodonFlow,INSTANCE,CALLBACK,pkce} from '../../modules/mastodon/oauth.mjs';
import {MastodonStore} from '../../modules/mastodon/store.mjs';
import {createMastodonCipher} from '../../modules/mastodon/cipher.mjs';
import {handleMastodonOAuth} from '../../modules/mastodon/http-router.mjs';
const source={siteId:'fixture-site',siteOrigin:'https://planner.example',instance:INSTANCE};
const keyring=JSON.stringify({activeKeyId:'test',keys:{test:Buffer.alloc(32,7).toString('base64')}});
const binding='b'.repeat(43),now=1794052800000;
async function setup(t,{deny=false,mutate=(path,b)=>b,transportFailure=false}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../../server/0012_mastodon_oauth.sql',import.meta.url),'utf8'));t.after(()=>sql.close());
 const db={prepare(q){return{bind(...args){return{first:async()=>sql.prepare(q).get(...args),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}};}};
 const config=configuration(source),cipher=await createMastodonCipher(keyring),context={provider:'mastodon',siteId:source.siteId,ownerId:'owner',instance:INSTANCE,callback:config.callback,scope:'profile'},store=new MastodonStore(db,cipher,context),calls=[],actions=[];
 let time=now;
 const transport=async request=>{calls.push(request);assert.equal(request.redirect,'error');assert.equal(new URL(request.url).origin,INSTANCE);const path=new URL(request.url).pathname;let body;
 if(path==='/.well-known/oauth-authorization-server')body={issuer:INSTANCE+'/',authorization_endpoint:INSTANCE+'/oauth/authorize',token_endpoint:INSTANCE+'/oauth/token',app_registration_endpoint:INSTANCE+'/api/v1/apps',scopes_supported:['profile'],code_challenge_methods_supported:['S256']};
 else if(path==='/api/v1/apps'){if(transportFailure)throw Error('network');assert.equal(new URLSearchParams(await request.clone().text()).get('scopes'),'profile');body={client_id:'fixture-id',client_secret:'fixture-secret',client_secret_expires_at:0,scopes:['profile'],redirect_uris:[config.callback]};}
 else if(path==='/oauth/revoke')body={};
 else if(path==='/oauth/token')body={access_token:'fixture-token',token_type:'Bearer',scope:'profile'};
 else if(path==='/api/v1/accounts/verify_credentials')body={id:'123',acct:'fixture_user'};
 else throw Error('unexpected endpoint');
 const r=new Response(JSON.stringify(mutate(path,body)),{headers:{'Content-Type':'application/json'}});Object.defineProperty(r,'url',{value:request.url});return r;};
 const authorizeAction=async v=>{actions.push(v);return !deny;};const options={config,store,transport,authorizeAction,clock:()=>time};
 return{...options,flow:createMastodonFlow(options),calls,actions,sql,db,cipher,context,setTime:v=>time=v,env:{DB:db,TAKT_MASTODON_ENABLED:'true',TAKT_MASTODON_CONFIGURATION:JSON.stringify(source),TAKT_MASTODON_KEYRING_JSON:keyring}};
}
const complete=(flow,start,extra={})=>flow.complete({state:new URL(start.authorizationUrl).searchParams.get('state'),binding,code:'fixture-code',...extra});
test('fixed HTTPS instance rejects arbitrary SSRF destinations and callbacks',()=>{for(const instance of ['http://kanoa.de','https://127.0.0.1','https://kanoa.de.evil.test','https://kanoa.de/','https://mastodon.social'])assert.throws(()=>configuration({...source,instance}));assert.throws(()=>configuration({...source,siteOrigin:'http://localhost'}));});
test('encrypted durable registration, PKCE, code exchange and profile only',async t=>{const h=await setup(t),start=await h.flow.begin(binding),u=new URL(start.authorizationUrl),pending=await h.store.read();assert.equal(u.searchParams.get('scope'),'profile');assert.equal(u.searchParams.get('code_challenge'),await pkce(pending.value.verifier));assert.equal(u.searchParams.get('redirect_uri'),source.siteOrigin+CALLBACK);assert.ok(!JSON.stringify(h.sql.prepare('SELECT * FROM mastodon_oauth_attempts').get()).includes('fixture-secret'));assert.deepEqual(await complete(h.flow,start),{phase:'linked'});assert.equal(h.calls.length,4);assert.equal((await h.store.read()).value.subject,'123');assert.ok(!JSON.stringify(h.sql.prepare('SELECT * FROM mastodon_oauth_attempts').get()).includes('fixture-token'));await assert.rejects(complete(h.flow,start));assert.equal(h.calls.length,4);assert.deepEqual(h.actions.slice(0,2).map(v=>v.action),['register_application_and_start','exchange_code_and_store_profile']);});
test('denied approval makes zero network or storage changes',async t=>{const h=await setup(t,{deny:true});await assert.rejects(h.flow.begin(binding));assert.equal(h.calls.length,0);assert.equal(await h.store.read(),null);});
test('no downgrade when profile or S256 is absent; no dynamic metadata endpoints',async t=>{for(const key of ['scopes_supported','code_challenge_methods_supported','token_endpoint']){const h=await setup(t,{mutate:(path,b)=>path.includes('well-known')?{...b,[key]:key==='token_endpoint'?'http://127.0.0.1/':[]}:b});await assert.rejects(h.flow.begin(binding));assert.equal(h.calls.length,1);assert.equal(await h.store.read(),null);}});
test('uncertain registration reserves once and blocks retries',async t=>{const h=await setup(t,{transportFailure:true});await assert.rejects(h.flow.begin(binding));assert.equal((await h.store.read()).value.phase,'registration_outcome_unknown');await assert.rejects(h.flow.begin(binding));assert.equal(h.calls.length,2);});
test('concurrent starts cannot register twice',async t=>{const h=await setup(t);const results=await Promise.allSettled([h.flow.begin(binding),h.flow.begin(binding)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(h.calls.filter(r=>r.url.endsWith('/api/v1/apps')).length,1);});
test('wrong browser, expired and denied callbacks cannot exchange tokens',async t=>{const h=await setup(t),start=await h.flow.begin(binding);await assert.rejects(complete(h.flow,start,{binding:'c'.repeat(43)}));assert.equal(h.calls.length,2);h.setTime(now+300001);await assert.rejects(complete(h.flow,start));assert.equal(h.calls.length,2);const other=await setup(t),s=await other.flow.begin(binding);assert.deepEqual(await complete(other.flow,s,{code:null,error:'access_denied'}),{phase:'declined'});assert.equal(other.calls.length,2);});
test('wrong scope quarantines encrypted token for revocation without retry',async t=>{const h=await setup(t,{mutate:(path,b)=>path==='/oauth/token'?{...b,scope:'read write'}:b}),start=await h.flow.begin(binding);await assert.rejects(complete(h.flow,start));assert.equal((await h.store.read()).value.phase,'verification_pending');await assert.rejects(complete(h.flow,start));assert.equal(h.calls.length,3);});
test('encrypted envelopes reject cross-owner, instance, version and tampering',async t=>{const h=await setup(t);await h.flow.begin(binding);const r=h.sql.prepare('SELECT * FROM mastodon_oauth_attempts').get();await assert.rejects(h.cipher.open({...h.context,ownerId:'other'},r.version,r.envelope));await assert.rejects(h.cipher.open({...h.context,instance:'https://evil.test'},r.version,r.envelope));await assert.rejects(h.cipher.open(h.context,r.version+1,r.envelope));const e=JSON.parse(r.envelope),original=e.data;e.data=(original[0]==='A'?'B':'A')+original.slice(1);assert.notEqual(e.data,original);await assert.rejects(h.cipher.open(h.context,r.version,JSON.stringify(e)));});
test('HTTP gate, per-attempt secure cookie, callback replay and redacted status',async t=>{const h=await setup(t),headers={'oai-authenticated-user-id':'owner',Origin:source.siteOrigin,'X-Planner-Request':'1','Content-Type':'application/json'},base=source.siteOrigin+'/api/providers/mastodon/oauth/',req=()=>new Request(base+'start',{method:'POST',headers,body:'{}'});assert.equal((await handleMastodonOAuth(req(),h.env,{transport:h.transport})).status,503);assert.equal(h.calls.length,0);const options={transport:h.transport,authorizeAction:h.authorizeAction,clock:h.clock},r=await handleMastodonOAuth(req(),h.env,options);assert.equal(r.status,200);const start=await r.json(),cookie=r.headers.get('Set-Cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);const callback=new Request(source.siteOrigin+CALLBACK+'?state='+new URL(start.authorizationUrl).searchParams.get('state')+'&code=fixture-code',{headers:{'oai-authenticated-user-id':'owner',Cookie:cookie.split(';')[0],'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});assert.equal((await handleMastodonOAuth(callback,h.env,options)).headers.get('Location'),source.siteOrigin+'/mastodon.html?outcome=linked');assert.equal((await handleMastodonOAuth(callback,h.env,options)).headers.get('Location'),source.siteOrigin+'/mastodon.html?outcome=unconfirmed');const status=await(await handleMastodonOAuth(new Request(base+'readiness',{headers}),h.env,options)).json();assert.equal(status.phase,'linked');assert.equal(status.canPublish,false);assert.ok(!JSON.stringify(status).includes('fixture-token'));});

test('malformed capability strings do not match supported arrays',async t=>{const h=await setup(t,{mutate:(path,b)=>path.includes('well-known')?{...b,scopes_supported:'not-profile',code_challenge_methods_supported:'not-S256'}:b});await assert.rejects(h.flow.begin(binding));assert.equal(h.calls.length,1);assert.equal(await h.store.read(),null);});
test('concurrent callbacks exchange one code exactly once',async t=>{const h=await setup(t),start=await h.flow.begin(binding),results=await Promise.allSettled([complete(h.flow,start),complete(h.flow,start)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(h.calls.filter(r=>r.url.endsWith('/oauth/token')).length,1);});
test('redirected provider response is rejected without following its location',async t=>{const h=await setup(t);let calls=0;const flow=createMastodonFlow({...h,transport:async r=>{calls++;const response=new Response('{}',{status:302,headers:{'Content-Type':'application/json',Location:'http://127.0.0.1/internal'}});Object.defineProperty(response,'url',{value:r.url});return response;}});await assert.rejects(flow.begin(binding));assert.equal(calls,1);assert.equal(await h.store.read(),null);});
test('invalid, mismatched, expired and replayed callbacks never invoke approval',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding),before=h.actions.length;
 for(const override of [{state:'invalid'},{state:'z'.repeat(43)},{binding:'c'.repeat(43)},{code:null},{error:'server_error'}])await assert.rejects(complete(h.flow,start,override));
 assert.equal(h.actions.length,before);h.setTime(now+300001);await assert.rejects(complete(h.flow,start));assert.equal(h.actions.length,before);
 const other=await setup(t),s=await other.flow.begin(binding);await complete(other.flow,s);const approved=other.actions.length;await assert.rejects(complete(other.flow,s));assert.equal(other.actions.length,approved);
});
test('access_denied consumes state without requesting or spending callback approval',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding);let approvals=0;
 const flow=createMastodonFlow({...h,authorizeAction:async()=>{approvals++;throw Error('must not run');}});
 assert.deepEqual(await complete(flow,start,{code:null,error:'access_denied'}),{phase:'declined'});assert.equal(approvals,0);assert.equal(h.calls.length,2);assert.equal((await h.store.read()).value.phase,'declined');await assert.rejects(complete(flow,start,{code:null,error:'access_denied'}));assert.equal(approvals,0);
});
test('only the winner of concurrent callbacks invokes approval',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding);let approvals=0;
 const flow=createMastodonFlow({...h,authorizeAction:async()=>{approvals++;assert.equal((await h.store.read()).value.phase,'authorization_outcome_unknown');return true;}});
 const results=await Promise.allSettled([complete(flow,start),complete(flow,start)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(approvals,1);
});
test('refused callback approval prevents exchange and is not requested again',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding);let approvals=0;const flow=createMastodonFlow({...h,authorizeAction:async()=>{approvals++;return false;}});
 await assert.rejects(complete(flow,start));assert.equal(h.calls.length,2);assert.equal((await h.store.read()).value.phase,'authorization_outcome_unknown');await assert.rejects(complete(flow,start));assert.equal(approvals,1);
});
test('stalled callback approval shares deadline, aborts and cannot advance after late approval',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding);let release,signal,entered;
 const reached=new Promise(resolve=>{entered=resolve;});const flow=createMastodonFlow({...h,authorizeAction:async(_,{signal:s})=>{signal=s;entered();return new Promise(resolve=>{release=resolve;});}});
 const pending=complete(flow,start);const rejected=assert.rejects(pending,/DEADLINE_EXCEEDED/);await reached;await rejected;
 assert.equal(signal.aborted,true);assert.equal((await h.store.read()).value.phase,'authorization_outcome_unknown');assert.equal(h.calls.length,2);release(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.length,2);assert.equal((await h.store.read()).value.phase,'authorization_outcome_unknown');
});
test('TTL expiring during durable callback claim cannot consume approval',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding),write=h.store.write.bind(h.store);let approvals=0;
 h.store.write=async(previous,value)=>{const result=await write(previous,value);if(value.phase==='authorization_outcome_unknown')h.setTime(now+300001);return result;};
 const flow=createMastodonFlow({...h,authorizeAction:async()=>{approvals++;return true;}});
 await assert.rejects(complete(flow,start),/ATTEMPT_EXPIRED/);assert.equal(approvals,0);assert.equal(h.calls.length,2);assert.equal((await h.store.read()).value.phase,'authorization_outcome_unknown');
});

import {handleHostedMastodon} from '../../modules/mastodon/hosted.mjs';
const hostedRequest=(path,body,owner='owner')=>new Request(source.siteOrigin+'/api/providers/mastodon/oauth/'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':owner,Origin:source.siteOrigin,'X-Planner-Request':'1','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('hosted exact owner and explicit browser consent protect registration',async t=>{const h=await setup(t),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'},options={clock:()=>now,fetchImpl:req=>h.transport(new Request(req,{redirect:'error'}))};
 assert.equal((await handleHostedMastodon(hostedRequest('start',{}),env,options)).status,400);
 assert.equal((await handleHostedMastodon(hostedRequest('start',{consent:'kanoa-profile-v1'},'other'),env,options)).status,403);
 assert.equal(h.calls.length,0);
 assert.equal((await handleHostedMastodon(hostedRequest('start',{consent:'kanoa-profile-v1'}),env,options)).status,200);
 assert.equal(h.calls.length,2);
});
const recoveryBody=row=>({consent:row.value.phase==='recovery_pending'?'confirmed-manual-kanoa-profile-revocation-v2':'fence-kanoa-profile-v2',expectedPhase:row.value.phase,expectedVersion:row.version});
test('confirmed manual recovery fences a late callback',async t=>{const h=await setup(t),start=await h.flow.begin(binding),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};
 const r=await handleHostedMastodon(hostedRequest('recover',recoveryBody(await h.store.read())),env,{clock:()=>now});assert.equal(r.status,200);await assert.rejects(complete(h.flow,start));assert.equal(h.calls.length,2);assert.equal((await h.store.read()).value.phase,'recovery_pending');const done=await handleHostedMastodon(hostedRequest('recover',recoveryBody(await h.store.read())),env,{clock:()=>now+60001});assert.equal(done.status,200);assert.deepEqual((await h.store.read()).value,{phase:'recovered',recoveredAtMs:now+60001,manualProviderRevocationConfirmed:true});
});
test('revoke removes stored grant only after provider confirms',async t=>{const h=await setup(t),start=await h.flow.begin(binding);await complete(h.flow,start);assert.deepEqual(await h.flow.revoke(),{phase:'revoked'});assert.deepEqual((await h.store.read()).value,{phase:'revoked',revokedAtMs:now});await h.flow.begin(binding);});
test('uncertain revocation retains encrypted token for safe retry',async t=>{const h=await setup(t),start=await h.flow.begin(binding);await complete(h.flow,start);const broken=createMastodonFlow({...h,transport:async()=>{throw Error('network');}});await assert.rejects(broken.revoke());assert.equal((await h.store.read()).value.phase,'revocation_pending');assert.equal((await h.store.read()).value.accessToken,'fixture-token');assert.deepEqual(await h.flow.revoke(),{phase:'revoked'});});
test('hosted recovery rejects missing consent, cross-origin and wrong owner',async t=>{const h=await setup(t);await h.flow.begin(binding);const env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};const before=await h.store.read();for(const req of [hostedRequest('recover',{}),hostedRequest('recover',{consent:'confirmed-manual-kanoa-revocation-v1'},'other')])assert.ok((await handleHostedMastodon(req,env)).status>=400);const cross=hostedRequest('recover',{consent:'confirmed-manual-kanoa-revocation-v1'});cross.headers.set('Origin','https://attacker.invalid');assert.equal((await handleHostedMastodon(cross,env)).status,403);assert.deepEqual(await h.store.read(),before);});

test('revocation accepts empty 200 success',async t=>{const h=await setup(t),start=await h.flow.begin(binding);await complete(h.flow,start);const flow=createMastodonFlow({...h,transport:async req=>{if(!req.url.endsWith('/oauth/revoke'))return h.transport(req);const r=new Response(null,{status:200});Object.defineProperty(r,'url',{value:req.url});return r;}});assert.deepEqual(await flow.revoke(),{phase:'revoked'});});

test('read-only diagnostic probes only public metadata, never writes or consumes approval',async t=>{
 const h=await setup(t),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};
 const r=await handleHostedMastodon(hostedRequest('diagnostics'),env,{fetchImpl:req=>h.transport(new Request(req,{redirect:'error'}))});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{provider:'mastodon',diagnostic:'preflight_passed',registrationAttempted:false,canPublish:false});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'GET');assert.equal(h.actions.length,0);assert.equal(await h.store.read(),null);
});
test('diagnostic guards reject wrong owner, origin, method, query and missing marker before outbound',async t=>{
 const h=await setup(t),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};let calls=0;
 const missing=hostedRequest('diagnostics');missing.headers.delete('X-Planner-Request');
 const cross=hostedRequest('diagnostics');cross.headers.set('Origin','https://evil.test');
 const navigation=hostedRequest('diagnostics');navigation.headers.set('Sec-Fetch-Site','cross-site');
 const wrongOrigin=new Request('https://evil.test/api/providers/mastodon/oauth/diagnostics',{headers:{'oai-authenticated-user-id':'owner','X-Planner-Request':'1'}});
 for(const req of [hostedRequest('diagnostics',null,'other'),hostedRequest('diagnostics',{}),hostedRequest('diagnostics?next=x'),missing,cross,navigation,wrongOrigin])assert.equal((await handleHostedMastodon(req,env,{fetchImpl:()=>calls++})).status,403);
 assert.equal(calls,0);assert.equal(await h.store.read(),null);
});
test('metadata preflight failure has a precise safe code and no registration or writes',async t=>{
 const h=await setup(t),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};let calls=0;
 for(const path of ['start','diagnostics']){
  const r=await handleHostedMastodon(hostedRequest(path,path==='start'?{consent:'kanoa-profile-v1'}:null),env,{fetchImpl:async req=>{calls++;const r=new Response('PRIVATE',{headers:{'Content-Type':'text/html'}});Object.defineProperty(r,'url',{value:req.url});return r;}});
  assert.equal(r.status,503);const body=await r.json();assert.equal(body.error.stage,'metadata');assert.equal(body.error.reason,'RESPONSE_TYPE_INVALID');assert.equal(body.error.registrationAttempted,false);assert.ok(!JSON.stringify(body).includes('PRIVATE'));assert.equal(await h.store.read(),null);
 }
 assert.equal(calls,2);
});
test('failed durable reservation and registration remain unknown, never falsely called safe preflight',async t=>{
 const h=await setup(t),write=h.store.write.bind(h.store);h.store.write=async(...args)=>{await write(...args);throw Error('PRIVATE');};
 await assert.rejects(h.flow.begin(binding),e=>e.message==='PRIVATE'&&!e.stage);assert.equal(h.calls.length,1);assert.equal((await h.store.read()).value.phase,'registration_outcome_unknown');
 const other=await setup(t,{transportFailure:true});await assert.rejects(other.flow.begin(binding),e=>!e.stage);assert.equal((await other.store.read()).value.phase,'registration_outcome_unknown');
});
test('diagnostic storage and transport errors never leak exception data',async t=>{
 const h=await setup(t),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};
 for(const stage of ['storage_read','metadata']){
  const current=stage==='storage_read'?{...env,DB:{prepare(){throw Error('PRIVATE_SECRET');}}}:env;
  const r=await handleHostedMastodon(hostedRequest('diagnostics'),current,{fetchImpl:()=>{throw Error('PRIVATE_SECRET');}});const body=await r.json();assert.equal(r.status,503);assert.equal(body.error.stage,stage);assert.ok(!JSON.stringify(body).includes('PRIVATE_SECRET'));
 }
});

test('hosted diagnostic and explicit start work on a Worker without Request cache support',async t=>{
 const h=await setup(t),env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'},NativeRequest=globalThis.Request;
 const diagnostic=hostedRequest('diagnostics'),start=hostedRequest('start',{consent:'kanoa-profile-v1'});
 t.mock.method(globalThis,'Request',class extends NativeRequest{
  constructor(url,init){if(Object.hasOwn(init||{},'cache')||init?.redirect==='error')throw Error('unsupported Worker option PRIVATE');super(url,init);this.cf=init?.cf;}
 });
 const options={clock:()=>now,fetchImpl:req=>{assert.deepEqual(req.cf,{cacheTtlByStatus:{'100-599':-1}});return h.transport(new NativeRequest(req,{redirect:'error'}));}};
 const result=await handleHostedMastodon(diagnostic,env,options);
 assert.equal(result.status,200);assert.equal((await result.json()).diagnostic,'preflight_passed');
 assert.equal(h.calls.length,1);assert.equal(h.actions.length,0);assert.equal(await h.store.read(),null);
 // Entirely local fixture: no network registration or provider credentials.
 assert.equal((await handleHostedMastodon(start,env,options)).status,200);
 assert.equal(h.calls.length,3);assert.equal((await h.store.read()).value.phase,'pending');
});

test('cross-site callback still rejects foreign owner, missing cookie and altered state before exchange',async t=>{
 const h=await setup(t),start=await h.flow.begin(binding),state=new URL(start.authorizationUrl).searchParams.get('state');
 const {hashOAuthState}=await import('../../modules/oauth/http-primitives.mjs');
 const cookie='__Host-takt-mastodon-'+await hashOAuthState(state)+'='+binding;
 const headers={'oai-authenticated-user-id':'owner',Cookie:cookie,'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 const options={transport:h.transport,authorizeAction:h.authorizeAction,clock:h.clock};
 for(const change of [{owner:'other'},{cookie:''},{state:'z'.repeat(43)}]){
  const r=await handleMastodonOAuth(new Request(source.siteOrigin+CALLBACK+'?state='+(change.state||state)+'&code=fixture-code',{headers:{...headers,...(change.owner?{'oai-authenticated-user-id':change.owner}:{}),...(change.cookie!==undefined?{Cookie:change.cookie}:{})}}),h.env,options);
  assert.equal(r.status,303);assert.equal(r.headers.get('Location'),source.siteOrigin+'/mastodon.html?outcome=unconfirmed');assert.equal(h.calls.length,2);assert.equal(h.actions.length,1);assert.equal((await h.store.read()).value.phase,'pending');
 }
});

test('profile recovery rejects stale first-stage intent after other tab fences and wait elapses',async t=>{
 const h=await setup(t);await h.flow.begin(binding);const env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'},body=recoveryBody(await h.store.read());
 assert.equal((await handleHostedMastodon(hostedRequest('recover',body),env,{clock:()=>now})).status,200);
 const before=await h.store.read();const stale=await handleHostedMastodon(hostedRequest('recover',body),env,{clock:()=>now+60001});assert.equal(stale.status,409);assert.equal((await stale.json()).error,'RECOVERY_STATE_CHANGED');assert.deepEqual(await h.store.read(),before);assert.equal(h.calls.length,2);
 const fresh=recoveryBody(before);assert.equal((await handleHostedMastodon(hostedRequest('recover',fresh),env,{clock:()=>now+59999})).status,409);
 assert.equal((await handleHostedMastodon(hostedRequest('recover',fresh),env,{clock:()=>now+60001})).status,200);
});
test('same phase new version, legacy payloads, wrong phase/consent and malformed versions never mutate recovery',async t=>{
 const h=await setup(t);await h.flow.begin(binding);const env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'},row=await h.store.read(),body=recoveryBody(row);await h.store.write(row,{...row.value});const before=await h.store.read();
 for(const b of [body,{consent:'confirmed-manual-kanoa-revocation-v1'},{...recoveryBody(before),expectedVersion:String(before.version)},{...recoveryBody(before),expectedVersion:0},{...recoveryBody(before),expectedPhase:'recovery_pending'},{...recoveryBody(before),consent:'confirmed-manual-kanoa-profile-revocation-v2'},{...recoveryBody(before),extra:true}]){assert.equal((await handleHostedMastodon(hostedRequest('recover',b),env,{clock:()=>now+60001})).status,409);assert.deepEqual(await h.store.read(),before);}
});
test('two concurrent tabs get one recovery transition and a stale 409 at each stage',async t=>{
 const h=await setup(t);await h.flow.begin(binding);const env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'};
 for(const time of [now,now+60001]){const body=recoveryBody(await h.store.read());const results=await Promise.all([1,2].map(()=>handleHostedMastodon(hostedRequest('recover',body),env,{clock:()=>time})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);}
 assert.equal((await h.store.read()).value.phase,'recovered');assert.equal(h.calls.length,2);
});
test('readiness exposes version for explicit recovery and malformed fence timestamps fail closed',async t=>{
 const h=await setup(t);await h.flow.begin(binding);const env={...h.env,TAKT_MASTODON_OWNER_ID:'owner'},row=await h.store.read();const readiness=await (await handleHostedMastodon(hostedRequest('readiness'),env)).json();assert.equal(readiness.recoveryVersion,row.version);assert.equal(readiness.phase,row.value.phase);
 await h.store.write(row,{...row.value,phase:'recovery_pending'});const before=await h.store.read();assert.equal((await handleHostedMastodon(hostedRequest('recover',recoveryBody(before)),env,{clock:()=>now+60001})).status,409);assert.deepEqual(await h.store.read(),before);
});
