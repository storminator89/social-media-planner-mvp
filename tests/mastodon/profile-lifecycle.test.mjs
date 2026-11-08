import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleHostedMastodon} from '../../modules/mastodon/hosted.mjs';

// Entire hosted route lifecycle, with synthetic provider and in-memory DB only.
test('hosted connection, explicit profile retry, uncertain revoke and confirmed revoke lifecycle',async t=>{
 const origin='https://planner.example',base=origin+'/api/providers/mastodon/oauth/';
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(await readFile(new URL('../../server/0012_mastodon_oauth.sql',import.meta.url),'utf8'));
 const DB={prepare(q){return{bind(...args){return{first:async()=>sql.prepare(q).get(...args),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}};}};
 const env={DB,TAKT_MASTODON_ENABLED:'true',TAKT_MASTODON_OWNER_ID:'owner',TAKT_MASTODON_CONFIGURATION:JSON.stringify({siteId:'lifecycle-fixture',siteOrigin:origin,instance:'https://kanoa.de'}),TAKT_MASTODON_KEYRING_JSON:JSON.stringify({activeKeyId:'test',keys:{test:Buffer.alloc(32,9).toString('base64')}})};
 const calls=[];let profileFails=false,revokeFails=false;
 const options={clock:()=>1794052800000,fetchImpl:async req=>{
  calls.push(new URL(req.url).pathname);let body={},status=200;
  switch(new URL(req.url).pathname){
   case '/.well-known/oauth-authorization-server':body={issuer:'https://kanoa.de/',authorization_endpoint:'https://kanoa.de/oauth/authorize',token_endpoint:'https://kanoa.de/oauth/token',app_registration_endpoint:'https://kanoa.de/api/v1/apps',scopes_supported:['profile'],code_challenge_methods_supported:['S256']};break;
   case '/api/v1/apps':body={client_id:'fixture-client',client_secret:'fixture-secret',client_secret_expires_at:0,scopes:['profile'],redirect_uris:[base+'callback']};break;
   case '/oauth/token':body={access_token:'fixture-token',token_type:'Bearer',scope:'profile'};break;
   case '/api/v1/accounts/verify_credentials':body=profileFails?{error:'PRIVATE provider detail'}:{id:'123',acct:'fixture',note:'<script>fixture</script>',source:{private:'PRIVATE'}};status=profileFails?401:200;break;
   case '/oauth/revoke':if(revokeFails)throw Error('synthetic unavailable');break;
   default:throw Error('unexpected provider endpoint');
  }
  const r=new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});Object.defineProperty(r,'url',{value:req.url});return r;
 }};
 const request=(path,body,extra={})=>new Request(base+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'owner',Origin:origin,'X-Planner-Request':'1','Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
 const send=(path,body,extra)=>handleHostedMastodon(request(path,body,extra),env,options);
 assert.equal((await(await send('readiness')).json()).phase,'not_connected');assert.equal(calls.length,0);
 const start=await send('start',{consent:'kanoa-profile-v1'});assert.equal(start.status,200);
 const cookie=start.headers.get('Set-Cookie').split(';')[0],state=new URL((await start.json()).authorizationUrl).searchParams.get('state');
 const callback=await send('callback?state='+encodeURIComponent(state)+'&code=fixture-code',undefined,{Cookie:cookie});assert.equal(callback.status,303);assert.equal(callback.headers.get('Location'),origin+'/mastodon.html?outcome=linked');
 assert.equal((await(await send('readiness')).json()).phase,'linked');
 const before=sql.prepare('SELECT * FROM mastodon_oauth_attempts').get();
 const profile=await send('profile');assert.equal(profile.status,200);assert.doesNotMatch(JSON.stringify(await profile.json()),/PRIVATE|fixture-token/);
 profileFails=true;const failed=await send('profile');assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'MASTODON_UNCONFIRMED'});
 profileFails=false;assert.equal((await send('profile')).status,200);assert.deepEqual(sql.prepare('SELECT * FROM mastodon_oauth_attempts').get(),before);
 revokeFails=true;assert.equal((await send('revoke',{consent:'revoke-kanoa-profile-v1'})).status,503);assert.equal((await(await send('readiness')).json()).phase,'revocation_pending');
 let count=calls.length;assert.equal((await send('profile')).status,503);assert.equal(calls.length,count);
 revokeFails=false;assert.equal((await send('revoke',{consent:'revoke-kanoa-profile-v1'})).status,200);assert.equal((await(await send('readiness')).json()).phase,'revoked');
 count=calls.length;assert.equal((await send('profile')).status,503);assert.equal(calls.length,count);
 assert.equal(calls.filter(x=>x==='/api/v1/apps').length,1);assert.equal(calls.filter(x=>x==='/oauth/token').length,1);
});
