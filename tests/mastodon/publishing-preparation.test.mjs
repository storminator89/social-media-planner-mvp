import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePublication,createPublicationCandidate,requiredPublishingScopes,PUBLISHING_AVAILABLE} from '../../modules/mastodon/publishing-preparation.mjs';
const input={ownerId:'owner1',subject:'42',text:'A reviewed post',visibility:'private',sensitive:false};
const image={storageId:'image1',sha256:'a'.repeat(64),mime:'image/png',bytes:100,altText:'A tree'};
function fixture({approve=true,fail=false}={}){
 const calls=[],reserved=new Set();
 const candidate=createPublicationCandidate({authorize:async p=>{calls.push(['authorize',p]);return approve;},ledger:{reserve:async p=>{const k=p.ownerId+p.reviewId;if(reserved.has(k))return false;reserved.add(k);calls.push(['reserve',p]);return true;},finish:async p=>calls.push(['finish',p])},provider:{upload:async p=>{calls.push(['upload',p]);return{id:'9',ready:true};},publish:async p=>{calls.push(['publish',p]);if(fail)throw Error('TIMEOUT');return{id:'123'};}}});
 const execute=async (plan,overrides={})=>candidate.execute({plan,identity:{ownerId:'owner1'},grant:{ownerId:'owner1',subject:'42',instance:'https://kanoa.de',phase:'linked',scopes:['write:statuses','write:media']},confirmedReviewId:plan.reviewId,explicitAction:'publish_now',...overrides});
 return{calls,execute};
}
test('publishing stays unavailable, narrow additional scopes',()=>{
 assert.equal(PUBLISHING_AVAILABLE,false);assert.deepEqual(requiredPublishingScopes(),['write:statuses']);assert.deepEqual(requiredPublishingScopes({hasImage:true}),['write:statuses','write:media']);
});
test('review snapshot is frozen and content/account/visibility/image changes bind approval',async()=>{
 const p=await preparePublication({...input,image});assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.image));
 for(const change of [{text:'edited'},{subject:'43'},{visibility:'public'},{image:{...image,altText:'Other'}}])assert.notEqual((await preparePublication({...input,image,...change})).reviewId,p.reviewId);
});
test('manual approved publication, reminder is never scheduled_at',async()=>{
 const plan=await preparePublication({...input,remindAt:Date.now()+600000});const f=fixture();assert.equal((await f.execute(plan)).state,'published');
 const request=f.calls.find(c=>c[0]==='publish')[1];assert.equal('scheduled_at' in request,false);assert.equal(request.idempotencyKey,plan.reviewId);
 await assert.rejects(f.execute(plan),/ATTEMPT_ALREADY_EXISTS/);assert.equal(f.calls.filter(c=>c[0]==='publish').length,1);
});
test('images upload only after approval and durable reservation',async()=>{
 const plan=await preparePublication({...input,image}),f=fixture();await f.execute(plan);assert.deepEqual(f.calls.map(c=>c[0]),['authorize','reserve','upload','publish','finish']);assert.deepEqual(f.calls[3][1].media_ids,['9']);
});
test('denial performs no upload or publication',async()=>{
 const f=fixture({approve:false});await assert.rejects(f.execute(await preparePublication({...input,image})),/ACTION_NOT_APPROVED/);assert.deepEqual(f.calls.map(c=>c[0]),['authorize']);
});
test('profile-only grant and other owner/account are rejected before approval',async()=>{
 for(const grant of [{scopes:['profile']},{ownerId:'other'},{subject:'99'},{instance:'https://evil.example'},{expiresAt:1}]){
  const f=fixture();await assert.rejects(f.execute(await preparePublication(input),{grant:{ownerId:'owner1',subject:'42',instance:'https://kanoa.de',phase:'linked',scopes:['write:statuses'],...grant}}));assert.equal(f.calls.length,0);
 }
});
test('changed review, missing action and stale confirmation are rejected',async()=>{
 const p=await preparePublication(input);
 for(const overrides of [{plan:{...p,text:'unreviewed'}},{explicitAction:'schedule'},{confirmedReviewId:'old'}]){const f=fixture();await assert.rejects(f.execute(p,overrides));assert.equal(f.calls.length,0);}
});
test('uncertain post stays reserved, no retry',async()=>{
 const p=await preparePublication(input),f=fixture({fail:true});await assert.rejects(f.execute(p),/TIMEOUT/);await assert.rejects(f.execute(p),/ATTEMPT_ALREADY_EXISTS/);assert.equal(f.calls.filter(c=>c[0]==='publish').length,1);assert.equal(f.calls.some(c=>c[0]==='finish'),false);
});
test('concurrent clicks issue at most one publish',async()=>{
 const f=fixture(),p=await preparePublication(input),r=await Promise.allSettled([f.execute(p),f.execute(p)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.calls.filter(c=>c[0]==='publish').length,1);
});
test('validation rejects unknown fields, unsafe image input, ambiguous choices',async()=>{
 for(const change of [{scheduled_at:'tomorrow'},{visibility:undefined},{text:''},{sensitive:undefined},{image:{...image,mime:'image/svg+xml'}},{image:{...image,storageId:'https://evil.example'}},{remindAt:1}])await assert.rejects(preparePublication({...input,...change}));
});
test('caller cannot mutate payload while awaiting authorization',async()=>{
 const plan={...await preparePublication(input)},calls=[];
 const c=createPublicationCandidate({authorize:async()=>{plan.text='Mutated during approval';return true;},ledger:{reserve:async()=>true,finish:async()=>{}},provider:{publish:async p=>{calls.push(p);return{id:'123'};}}});
 await c.execute({plan,identity:{ownerId:'owner1'},grant:{ownerId:'owner1',subject:'42',instance:'https://kanoa.de',phase:'linked',scopes:['write:statuses']},confirmedReviewId:plan.reviewId,explicitAction:'publish_now'});
 assert.equal(calls[0].status,input.text);
});
test('pending or uncertain media never causes a post or another upload',async()=>{
 for(const mediaResult of ['pending','timeout']){
  let reserved=false,uploads=0,posts=0;
  const plan=await preparePublication({...input,image});
  const c=createPublicationCandidate({authorize:async()=>true,ledger:{reserve:async()=>{if(reserved)return false;reserved=true;return true;},finish:async()=>assert.fail('cannot finish')},provider:{upload:async()=>{uploads++;if(mediaResult==='timeout')throw Error('UPLOAD_TIMEOUT');return{id:'9',ready:false};},publish:async()=>{posts++;}}});
  const args={plan,identity:{ownerId:'owner1'},grant:{ownerId:'owner1',subject:'42',instance:'https://kanoa.de',phase:'linked',scopes:['write:statuses','write:media']},confirmedReviewId:plan.reviewId,explicitAction:'publish_now'};
  await assert.rejects(c.execute(args),/MEDIA_NOT_READY|UPLOAD_TIMEOUT/);await assert.rejects(c.execute(args),/ATTEMPT_ALREADY_EXISTS/);assert.equal(uploads,1);assert.equal(posts,0);
 }
});
