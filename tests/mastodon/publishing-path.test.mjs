import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {MastodonPublishingLedger} from '../../modules/mastodon/publishing-ledger.mjs';
import {MastodonPublishingGrantStore} from '../../modules/mastodon/publishing-grant-store.mjs';
import {createMastodonCipher} from '../../modules/mastodon/cipher.mjs';
import {createPublishingSession} from '../../modules/mastodon/publishing-session.mjs';
import {createMastodonPublishingFlow} from '../../modules/mastodon/publishing-oauth.mjs';
const fields={text:'An exact reviewed text',visibility:'private',sensitive:false};
async function fixture(t,{fail=false}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../../docs/mastodon/publishing-schema.sql',import.meta.url),'utf8'));t.after(()=>sql.close());
 const db={prepare(q){return{bind(...a){return{first:async()=>sql.prepare(q).get(...a),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})};}};}};
 const context={siteId:'site',ownerId:'owner',purpose:'publishing',scope:'profile write:statuses'};
 const cipher=await createMastodonCipher(JSON.stringify({activeKeyId:'fixture',keys:{fixture:Buffer.alloc(32,5).toString('base64')}}));
 const grantStore=new MastodonPublishingGrantStore(db,cipher,context),ledger=new MastodonPublishingLedger(db,context);
 await grantStore.write(null,{purpose:'publishing',phase:'linked',scope:context.scope,subject:'42',accessToken:'fixture-only'});
 let calls=0;
 const options={offlineFixture:true,identity:{ownerId:'owner'},grantStore,ledger,authorize:async()=>true,provider:{publish:async()=>{calls++;if(fail)throw Error('UNKNOWN');return{id:'123'};}}};
 return{sql,db,context,ledger,grantStore,options,session:createPublishingSession(options),calls:()=>calls};
}
const submit=(session,plan)=>session.submit({confirmedReviewId:plan.reviewId,explicitAction:'publish_now'});
test('runtime stays closed by default, no profile-store substitution',async t=>{
 const f=await fixture(t);assert.throws(()=>createPublishingSession({...f.options,offlineFixture:false}),/OFFLINE/);
 assert.throws(()=>createMastodonPublishingFlow({}),/DISABLED/);
 assert.throws(()=>createPublishingSession({...f.options,identity:{ownerId:'other'}}),/OWNER/);
 assert.throws(()=>new MastodonPublishingGrantStore(f.db,{}, {...f.context,purpose:'profile'}),/CONTEXT/);
});
test('durable ledger stops independent-session concurrent and repeated submits',async t=>{
 const f=await fixture(t),second=createPublishingSession(f.options);
 const [a,b]=await Promise.all([f.session.preview(fields),second.preview(fields)]);
 const results=await Promise.allSettled([submit(f.session,a),submit(second,b)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.calls(),1);
 const fresh=createPublishingSession(f.options),p=await fresh.preview(fields);await assert.rejects(submit(fresh,p),/ATTEMPT_ALREADY_EXISTS/);
 assert.equal((await f.ledger.read({ownerId:'owner',reviewId:p.reviewId})).state,'published');
});
test('unknown network outcome remains locked even in a new session',async t=>{
 const f=await fixture(t,{fail:true}),p=await f.session.preview(fields);await assert.rejects(submit(f.session,p),/UNKNOWN/);
 const again=createPublishingSession(f.options),q=await again.preview(fields);await assert.rejects(submit(again,q),/ATTEMPT_ALREADY_EXISTS/);assert.equal(f.calls(),1);
 assert.equal((await f.ledger.read({ownerId:'owner',reviewId:p.reviewId})).state,'outcome_unknown');
});
test('owner boundary and site boundary, no arbitrary finish/reset',async t=>{
 const f=await fixture(t),p=await f.session.preview(fields),args={ownerId:'owner',reviewId:p.reviewId};
 await assert.rejects(f.ledger.reserve({...args,ownerId:'other',state:'outcome_unknown'}),/OWNER/);
 await assert.rejects(f.ledger.finish({...args,state:'published',providerId:'123'}),/CONFLICT/);
 await f.ledger.reserve({...args,state:'outcome_unknown'});
 const other=new MastodonPublishingLedger(f.db,{siteId:'other',ownerId:'owner'});assert.equal(await other.read(args),null);
 await assert.rejects(f.ledger.finish({...args,state:'ready'}),/INVALID/);
});
test('cancel, stale approval and new preview invalidate the previous approval',async t=>{
 const f=await fixture(t),a=await f.session.preview(fields);f.session.cancel();await assert.rejects(submit(f.session,a),/PREVIEW/);
 const b=await f.session.preview(fields),c=await f.session.preview({...fields,text:'Changed'});await assert.rejects(submit(f.session,b),/PREVIEW/);await submit(f.session,c);assert.equal(f.calls(),1);
});
test('cancel during asynchronous preview cannot resurrect approval',async t=>{
 const f=await fixture(t),pending=f.session.preview(fields);f.session.cancel();await assert.rejects(pending,/SUPERSEDED/);assert.equal(f.calls(),0);
});
test('no media, scheduler, identity override, broad or profile-only grants',async t=>{
 const f=await fixture(t);
 for(const extra of [{image:{}},{scheduled_at:'tomorrow'},{ownerId:'other'}])await assert.rejects(f.session.preview({...fields,...extra}),/TEXT_ONLY/);
 for(const scope of ['profile','write','profile write:statuses write:media']){const row=await f.grantStore.read();await f.grantStore.write(row,{...row.value,scope});await assert.rejects(f.session.preview(fields),/GRANT/);}
 assert.equal(f.calls(),0);
});
test('grant changes after preview require another review, encrypted secrets stay hidden',async t=>{
 const f=await fixture(t),p=await f.session.preview(fields),r=await f.grantStore.read();await f.grantStore.write(r,{...r.value,subject:'99'});await assert.rejects(submit(f.session,p),/ACCOUNT_MISMATCH/);assert.equal(f.calls(),0);
 assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM mastodon_publishing_grants').all()).includes('fixture-only'));
});
