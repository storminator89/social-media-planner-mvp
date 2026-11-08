import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handleHostedMastodon} from '../../modules/mastodon/hosted.mjs';
import {createMastodonCipher} from '../../modules/mastodon/cipher.mjs';
import {MastodonStore} from '../../modules/mastodon/store.mjs';
import {readMastodonProfile,projectProfile} from '../../modules/mastodon/profile.mjs';
const origin='https://planner.example',prefix=origin+'/api/providers/mastodon/oauth/';
const account={id:'123',acct:'fixture_user',username:'fixture_user',display_name:'Example',note:'<script>alert(1)</script>',followers_count:2,following_count:3,statuses_count:4,locked:false,source:{note:'private'},access_token:'do-not-forward',roles:[{name:'admin'}]};
async function setup(t){
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../../server/0012_mastodon_oauth.sql',import.meta.url),'utf8'));t.after(()=>sql.close());
 const db={prepare(q){return{bind(...a){return{first:async()=>sql.prepare(q).get(...a),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})};}};}};
 const keyring=JSON.stringify({activeKeyId:'test',keys:{test:Buffer.alloc(32,8).toString('base64')}}),cipher=await createMastodonCipher(keyring);
 const store=new MastodonStore(db,cipher,{provider:'mastodon',siteId:'fixture',ownerId:'owner',instance:'https://kanoa.de',callback:prefix+'callback',scope:'profile'});
 await store.write(null,{phase:'linked',scope:'profile',subject:'123',acct:'fixture_user',accessToken:'fixture-token'});
 const env={DB:db,TAKT_MASTODON_ENABLED:'true',TAKT_MASTODON_OWNER_ID:'owner',TAKT_MASTODON_CONFIGURATION:JSON.stringify({siteId:'fixture',siteOrigin:origin,instance:'https://kanoa.de'}),TAKT_MASTODON_KEYRING_JSON:keyring};
 const calls=[];const fetchImpl=async req=>{calls.push(req);const r=new Response(JSON.stringify(account),{headers:{'Content-Type':'application/json'}});Object.defineProperty(r,'url',{value:req.url});return r;};
 const request=(extra={},path='profile',method='GET')=>new Request(prefix+path,{method,headers:{'oai-authenticated-user-id':'owner','X-Planner-Request':'1',...extra}});
 return{store,env,calls,fetchImpl,request,sql};
}
test('manual hosted profile read uses one fixed GET, strips private fields, writes nothing',async t=>{
 const h=await setup(t),before=h.sql.prepare('SELECT * FROM mastodon_oauth_attempts').get();
 const r=await handleHostedMastodon(h.request(),h.env,{fetchImpl:h.fetchImpl,clock:()=>1234});assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);
 const v=await r.json();assert.equal(v.fetchedAtMs,1234);assert.equal(v.canPublish,false);assert.deepEqual(v.profile,projectProfile(account,'123'));assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'https://kanoa.de/api/v1/accounts/verify_credentials');assert.equal(h.calls[0].method,'GET');assert.equal(h.calls[0].headers.get('Authorization'),'Bearer fixture-token');assert.equal(h.calls[0].headers.has('oai-authenticated-user-id'),false);
 for(const secret of ['fixture-token','do-not-forward','private','admin'])assert.ok(!JSON.stringify(v).includes(secret));assert.deepEqual(h.sql.prepare('SELECT * FROM mastodon_oauth_attempts').get(),before);
});
test('wrong owner, origin, method, search and missing manual header never reach provider',async t=>{
 const h=await setup(t);
 for(const request of [h.request({'oai-authenticated-user-id':'other'}),h.request({Origin:'https://evil.test'}),h.request({'Sec-Fetch-Site':'cross-site'}),h.request({'X-Planner-Request':''}),h.request({},'profile?x=1'),h.request({},'profile','POST')])assert.equal((await handleHostedMastodon(request,h.env,{fetchImpl:h.fetchImpl})).status,403);
 assert.equal(h.calls.length,0);
});
test('unlinked or unexpected scope never invokes profile fetch',async t=>{
 for(const change of [{phase:'revoked'},{scope:'read'},{phase:'verification_pending'}]){const h=await setup(t),row=await h.store.read();await h.store.write(row,{...row.value,...change});assert.equal((await handleHostedMastodon(h.request(),h.env,{fetchImpl:h.fetchImpl})).status,503);assert.equal(h.calls.length,0);}
});
test('mismatched account, provider failure, redirect and oversized body fail closed without details',async t=>{
 const h=await setup(t);
 for(const [body,status] of [[{...account,id:'456'},200],[{error:'fixture-token'},401],[{},302],[{...account,note:'x'.repeat(66000)},200]]){
  const r=await handleHostedMastodon(h.request(),h.env,{fetchImpl:async req=>{const r=new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});Object.defineProperty(r,'url',{value:req.url});return r;}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'MASTODON_UNCONFIRMED'});
 }
});
test('revocation during fetch suppresses result and does not overwrite it',async t=>{
 const h=await setup(t);await assert.rejects(readMastodonProfile({store:h.store,transport:async req=>{const row=await h.store.read();await h.store.write(row,{phase:'revoked'});return h.fetchImpl(req);}}));assert.equal((await h.store.read()).value.phase,'revoked');
});
test('profile allowlist validates types and excludes arbitrary fields',()=>{
 for(const change of [{followers_count:-1},{statuses_count:1.5},{locked:'true'},{acct:'remote@elsewhere'},{note:{}},{display_name:'x'.repeat(501)}])assert.throws(()=>projectProfile({...account,...change},'123'));
 assert.equal(Object.hasOwn(projectProfile(account,'123'),'source'),false);
});
