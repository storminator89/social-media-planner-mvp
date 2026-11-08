import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleHostedPublishing} from '../../modules/mastodon/publishing-hosted.mjs';
import {createMastodonCipher} from '../../modules/mastodon/cipher.mjs';
import {MastodonStore} from '../../modules/mastodon/store.mjs';
import {MastodonPublishingGrantStore} from '../../modules/mastodon/publishing-grant-store.mjs';
const origin='https://test.chatgpt.site',prefix='/api/providers/mastodon/publishing/';
async function fixture(t,{unknown=false,revokeUnknown=false}={}){
 const sql=new DatabaseSync(':memory:');for(const name of ['0012_mastodon_oauth','0013_mastodon_publishing'])sql.exec(await readFile(new URL('../../server/'+name+'.sql',import.meta.url),'utf8'));t.after(()=>sql.close());
 const db={prepare(q){return{bind(...a){return{first:async()=>sql.prepare(q).get(...a),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})};}};}};
 const key=JSON.stringify({activeKeyId:'test',keys:{test:Buffer.alloc(32,5).toString('base64')}}),cipher=await createMastodonCipher(key),base={provider:'mastodon',siteId:'site',ownerId:'owner',instance:'https://kanoa.de'};
 const profile=new MastodonStore(db,cipher,{...base,callback:origin+'/api/providers/mastodon/oauth/callback',scope:'profile'});await profile.write(null,{phase:'linked',subject:'42',acct:'test'});
 const grants=new MastodonPublishingGrantStore(db,cipher,{...base,callback:origin+prefix+'oauth/callback',scope:'profile write:statuses',purpose:'publishing'});await grants.write(null,{phase:'linked',purpose:'publishing',scope:'profile write:statuses',subject:'42',accessToken:'fixture',clientId:'fixture-client',clientSecret:'fixture-secret'});
 const env={DB:db,TAKT_MASTODON_OWNER_ID:'owner',TAKT_MASTODON_PUBLISHING_ENABLED:'true',TAKT_MASTODON_CONFIGURATION:JSON.stringify({siteId:'site',siteOrigin:origin,instance:'https://kanoa.de'}),TAKT_MASTODON_KEYRING_JSON:key};let posts=0,revokes=0,now=100000;const requests=[];
 const fetchImpl=async r=>{requests.push(r);const response=v=>{const out=Response.json(v);Object.defineProperty(out,'url',{value:r.url});return out;};if(r.url.endsWith('/oauth/revoke')){revokes++;if(revokeUnknown)throw Error('timeout');return response({});}if(r.url.endsWith('verify_credentials'))return response({id:'42'});posts++;if(unknown)throw Error('timeout');return response({id:'123',account:{id:'42'},visibility:'private'});};
 const call=(path,body,headers={})=>handleHostedPublishing(new Request(origin+prefix+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'owner',Origin:origin,'Content-Type':'application/json','X-Planner-Request':'1',...headers},...(body?{body:JSON.stringify(body)}:{})}),env,{fetchImpl,clock:()=>now});
 return {env,call,sql,posts:()=>posts,revokes:()=>revokes,advance:ms=>now+=ms,requests,grants,profile};
}
const fields={text:'Test',visibility:'private',sensitive:false,spoilerText:''};
const submit=plan=>({confirmedReviewId:plan.reviewId,explicitAction:'publish_now'});
test('hosted text review posts once; profile unchanged; no outbound identity',async t=>{const f=await fixture(t),before=await f.profile.read(),plan=await(await f.call('preview',fields)).json();assert.equal((await f.call('submit',submit(plan))).status,200);assert.equal((await f.call('submit',submit(plan))).status,409);const next=await(await f.call('preview',fields)).json();assert.equal((await f.call('submit',submit(next))).status,409);assert.equal(f.posts(),1);assert.deepEqual(await f.profile.read(),before);for(const r of f.requests)assert.equal(r.headers.get('oai-authenticated-user-id'),null);});
test('unknown publication remains fenced across new previews',async t=>{const f=await fixture(t,{unknown:true});for(let n=0;n<2;n++){const plan=await(await f.call('preview',fields)).json();assert.equal((await f.call('submit',submit(plan))).status,409);}assert.equal(f.posts(),1);assert.equal(f.sql.prepare('SELECT state FROM mastodon_publications').get().state,'outcome_unknown');});
test('cancel/edit/account change and CSRF prevent writes',async t=>{const f=await fixture(t);let p=await(await f.call('preview',fields)).json();await f.call('cancel',{});assert.equal((await f.call('submit',submit(p))).status,409);p=await(await f.call('preview',fields)).json();await f.call('preview',{...fields,text:'changed'});assert.equal((await f.call('submit',submit(p))).status,409);assert.equal((await f.call('preview',fields,{Origin:'https://evil.test'})).status,403);assert.equal((await f.call('preview',fields,{'oai-authenticated-user-id':'other'})).status,403);const row=await f.grants.read();await f.grants.write(row,{...row.value,subject:'99'});assert.equal((await f.call('preview',fields)).status,409);assert.equal(f.posts(),0);});
test('feature gate defaults closed; text only',async t=>{const f=await fixture(t);assert.equal((await f.call('preview',{...fields,image:{}})).status,409);delete f.env.TAKT_MASTODON_PUBLISHING_ENABLED;assert.equal((await f.call('preview',fields)).status,503);assert.equal((await(await f.call('readiness')).json()).canPublish,false);assert.equal(f.posts(),0);});

const revokeConsent={consent:'revoke-kanoa-publishing-v1'},fenceConsent={consent:'fence-kanoa-publishing-v1'},recoverConsent={consent:'confirmed-manual-kanoa-publishing-revocation-v1'};
test('explicit separate revoke preserves profile and ledger, works with feature disabled',async t=>{const f=await fixture(t),profile=await f.profile.read();const plan=await(await f.call('preview',fields)).json();await f.call('submit',submit(plan));const ledger=f.sql.prepare('SELECT * FROM mastodon_publications').all();delete f.env.TAKT_MASTODON_PUBLISHING_ENABLED;assert.equal((await f.call('revoke',{})).status,400);assert.equal((await f.call('revoke',revokeConsent,{Origin:'https://evil.test'})).status,403);assert.equal((await f.call('revoke',revokeConsent)).status,200);assert.equal(f.revokes(),1);assert.equal((await f.grants.read()).value.phase,'revoked');assert.deepEqual(await f.profile.read(),profile);assert.deepEqual(f.sql.prepare('SELECT * FROM mastodon_publications').all(),ledger);assert.equal((await f.call('revoke',revokeConsent)).status,409);assert.equal(f.revokes(),1);});
test('uncertain revoke is not repeated; two-stage manual recovery retains publication fence',async t=>{const f=await fixture(t,{unknown:true,revokeUnknown:true}),plan=await(await f.call('preview',fields)).json();await f.call('submit',submit(plan));assert.equal((await f.call('revoke',revokeConsent)).status,409);assert.equal((await f.call('revoke',revokeConsent)).status,409);assert.equal(f.revokes(),1);assert.equal((await(await f.call('recover',fenceConsent)).json()).phase,'recovery_pending');assert.equal((await f.call('recover',recoverConsent)).status,409);f.advance(60001);assert.equal((await(await f.call('readiness')).json()).recoveryReady,true);assert.equal((await(await f.call('recover',recoverConsent)).json()).phase,'recovered');assert.equal((await(await f.call('readiness')).json()).canStart,true);assert.equal(f.sql.prepare('SELECT state FROM mastodon_publications').get().state,'outcome_unknown');assert.equal(f.posts(),1);});
test('declined, expired, wrong-account and unknown exchanges have manual recovery without provider calls',async t=>{for(const value of [{phase:'declined'},{phase:'pending',expiresAtMs:1},{phase:'exchange_outcome_unknown'},{phase:'registration_outcome_unknown'},{phase:'linked',subject:'99',expiresAt:1}]){const f=await fixture(t),old=await f.grants.read();await f.grants.write(old,{...old.value,...value});const ready=await(await f.call('readiness')).json();assert.equal(ready.canPublish,false);assert.equal(ready.canRecover,true);assert.equal((await f.call('recover',{})).status,400);await f.call('recover',fenceConsent);f.advance(60001);await f.call('recover',recoverConsent);assert.equal((await(await f.call('readiness')).json()).canStart,true);assert.equal(f.requests.length,0);}});
test('disconnected profile cannot trap write grant; concurrent revoke sends only once',async t=>{const f=await fixture(t);const p=await f.profile.read();await f.profile.write(p,{phase:'revoked'});assert.equal((await(await f.call('readiness')).json()).canRevoke,true);const out=await Promise.all([f.call('revoke',revokeConsent),f.call('revoke',revokeConsent)]);assert.equal(out.filter(r=>r.status===200).length,1);assert.equal(f.revokes(),1);});

test('each outgoing submission has review-bound Idempotency-Key and no scheduling fields',async t=>{
 const f=await fixture(t),plan=await(await f.call('preview',fields)).json();
 assert.equal((await f.call('submit',submit(plan))).status,200);
 const posts=f.requests.filter(r=>new URL(r.url).pathname==='/api/v1/statuses');
 assert.equal(posts.length,1);assert.equal(posts[0].method,'POST');
 assert.match(posts[0].headers.get('Idempotency-Key'),/^[a-f0-9]{64}$/);
 assert.equal(posts[0].headers.get('Idempotency-Key'),plan.reviewId);
 const body=new URLSearchParams(await posts[0].text());assert.equal(body.has('scheduled_at'),false);
 const next=await(await f.call('preview',{...fields,text:'Different approved text'})).json();
 assert.notEqual(next.reviewId,plan.reviewId);assert.equal((await f.call('submit',submit(next))).status,200);
 assert.equal(f.requests.filter(r=>new URL(r.url).pathname==='/api/v1/statuses')[1].headers.get('Idempotency-Key'),next.reviewId);
});
test('unknown outcome remains fenced beyond the provider one-hour deduplication window',async t=>{
 const f=await fixture(t,{unknown:true}),plan=await(await f.call('preview',fields)).json();
 assert.equal((await f.call('submit',submit(plan))).status,409);f.advance(3600001);
 const next=await(await f.call('preview',fields)).json();assert.equal(next.reviewId,plan.reviewId);
 assert.equal((await f.call('submit',submit(next))).status,409);assert.equal(f.posts(),1);
 assert.equal(f.requests.filter(r=>new URL(r.url).pathname==='/api/v1/statuses')[0].headers.get('Idempotency-Key'),plan.reviewId);
 assert.equal(f.sql.prepare('SELECT state FROM mastodon_publications').get().state,'outcome_unknown');
});
