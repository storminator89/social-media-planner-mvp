import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {prepareDraftBatch} from '../../modules/workflows/draft-batch.mjs';
import {validateScheduleChanges,findNextPostingSlots,selectPostingSlot} from '../../modules/workflows/posting-schedules.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const rules=(timezone='Europe/Berlin')=>({schemaVersion:1,timezone,paused:false,minimumGapMinutes:60,overlapChoice:'later',slots:Array.from({length:7},(_,weekday)=>['10:00','10:15','11:00'].map((time,i)=>({id:`s-${weekday}-${i}`,weekday,time}))).flat()});
const variant=(id,channelId='bluesky')=>({id:`v-${id}`,channelId,body:`Kanal ${id}\r\n👩‍💻 <img onerror=alert(1)>`,inheritsBody:false,status:'draft',scheduledAt:null,timezone:'Asia/Kathmandu',publishedAt:null,publishedUrl:null,format:'post',mediaIds:[],statusNote:'Notiz\r\n exakt'});
const draft=(id,channelId='bluesky')=>({id,title:`Titel ${id}`,body:`Basis ${id}`,tags:[' Label ','A\r\nB','A','A'],stage:'draft',scheduledAt:null,scheduleBinding:null,timezone:'Asia/Kathmandu',cover:'studio',createdAt:'2025-01-02T03:04:05.678Z',updatedAt:'2025-01-02T03:04:05.678Z',variants:[variant(id,channelId)]});
const fixture=()=>({schemaVersion:3,revision:0,settings:{timezone:'Asia/Tokyo',locale:'en-GB'},channels:CHANNELS.map(c=>({id:c.id,platform:c.id,name:c.name,handle:'',color:c.color,enabled:true,connectionStatus:'manual',postingSchedule:rules()})),posts:[draft('one'),draft('two'),draft('three','linkedin')],media:[]});
const stable=p=>{const n=structuredClone(p);delete n.updatedAt;return n;};
async function setup(t,factory=serverStore,{media=false}={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fixture-site',TAKT_SITE_ORIGIN:'https://planner.example'},calls=[];t.after(()=>env.DB.sql.close());
 let intercept;const handler=createSitesHandler();
 const realFetch=(path,options={})=>handler.fetch(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:(path,options={})=>{calls.push([options.method||'GET',path]);return intercept?intercept(path,options,realFetch):realFetch(path,options);}});
 let state=fixture();
 if(media){const jpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217]);const m=await client.uploadMedia(new File([jpeg],'exact.jpg',{type:'image/jpeg'}),'Exact Alt 👩‍💻');const second=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'second.jpg',{type:'image/jpeg'}),'Second ordered alt');state.posts[0].variants[0].mediaIds=[m.id,second.id];}
 // Unrelated fixed precision/fold and a bound post must survive byte-for-byte.
 const fixed=draft('fixed','instagram');fixed.stage='planned';fixed.scheduledAt='2026-10-25T01:30:17.123Z';fixed.variants[0].status='planned';fixed.variants[0].scheduledAt=fixed.scheduledAt;
 state.posts.push(fixed);state=await client.save(state);
 const proposal=findNextPostingSlots(state,{postId:'bound',channelIds:['mastodon'],after:'2099-10-01T00:00:00.000Z',limit:1}),chosen=selectPostingSlot(state,proposal,proposal.suggestions[0],{now:'2099-10-01T00:00:00.000Z'});
 const bound=draft('bound','mastodon');bound.stage='planned';bound.scheduledAt=chosen.scheduledAt;bound.timezone=chosen.timezone;bound.scheduleBinding=chosen.scheduleBinding;Object.assign(bound.variants[0],{status:'planned',scheduledAt:chosen.scheduledAt,timezone:chosen.timezone});state.posts.push(bound);await client.save(state);
 const store=factory({client,timezone:'UTC',channels:CHANNELS}),ui=normalizeState(await store.load()),canonical=await client.load();calls.length=0;
 return {env,store,ui,canonical,client,calls,intercept:fn=>{intercept=fn;}};
}
const now='2099-10-01T00:00:00.000Z';
test('pure planning reserves sequential slots at one revision, respects gaps and other channels, never mutates inputs',()=>{
 const source=fixture();source.revision=7;const before=structuredClone(source);
 const {next,entries}=prepareDraftBatch(source,{postIds:['two','one','three'],now});
 assert.deepEqual(source,before);assert.deepEqual(entries.map(e=>e.postId),['two','one','three']);
 assert.equal(Date.parse(entries[1].instant)-Date.parse(entries[0].instant),3600000);assert.equal(entries[0].instant,entries[2].instant);
 assert.ok(entries.every(e=>e.timezone==='Asia/Tokyo'));assert.ok(next.posts.every(p=>p.scheduleBinding.sourceRevision===7));assert.equal(next.revision,7);assert.equal(validateScheduleChanges(next,source,now),true);
});
test('occupied fixed slot is never moved and minimum-gap collisions are skipped only as slot candidates',()=>{
 const source=fixture();source.revision=3;const fixed=draft('fixed');fixed.stage='planned';fixed.scheduledAt='2099-10-01T08:30:00.000Z';Object.assign(fixed.variants[0],{status:'planned',scheduledAt:fixed.scheduledAt});source.posts.push(fixed);
 const {next,entries}=prepareDraftBatch(source,{postIds:['one','two'],now});assert.equal(entries[0].instant,'2099-10-02T08:00:00.000Z');assert.deepEqual(next.posts.at(-1),fixed);
});
test('invalid or unavailable selected drafts fail the whole preparation without dropping an item',()=>{
 for(const ids of [[],['one','one'],['one','missing'],['one',1],null])assert.throws(()=>prepareDraftBatch(fixture(),{postIds:ids,now}));
 for(const mutate of [p=>p.stage='planned',p=>p.scheduledAt=now,p=>p.scheduleBinding={},p=>p.variants=[],p=>p.variants.push(variant('extra','linkedin')),p=>p.variants[0].body='',p=>p.variants[0].publishedAt=now,p=>p.variants[0].publishedUrl='https://example.com/p',p=>p.variants[0].format='story']){
  const source=fixture();mutate(source.posts[1]);const before=structuredClone(source);assert.throws(()=>prepareDraftBatch(source,{postIds:['one','two'],now}));assert.deepEqual(source,before);
 }
 for(const mutate of [c=>c.enabled=false,c=>c.postingSchedule=null,c=>c.postingSchedule.paused=true,c=>c.postingSchedule.slots=[]]){const source=fixture();mutate(source.channels.find(c=>c.id==='bluesky'));assert.throws(()=>prepareDraftBatch(source,{postIds:['one'],now}));}
});
test('DST gaps and reject folds use the next actual saved slot; later-fold choice preserves its exact UTC instant',()=>{
 const source=fixture();source.channels.forEach(c=>c.postingSchedule={...rules(),overlapChoice:'reject',slots:[{id:'sun',weekday:0,time:'02:30'}]});
 const gap=prepareDraftBatch(source,{postIds:['one'],now:'2026-03-28T00:00:00.000Z'});assert.equal(gap.entries[0].instant,'2026-04-05T00:30:00.000Z');
 const fold=prepareDraftBatch(source,{postIds:['one'],now:'2026-10-24T00:00:00.000Z'});assert.equal(fold.entries[0].instant,'2026-11-01T01:30:00.000Z');
 source.channels.forEach(c=>c.postingSchedule.overlapChoice='later');const later=prepareDraftBatch(source,{postIds:['one'],now:'2026-10-24T00:00:00.000Z'});assert.equal(later.entries[0].instant,'2026-10-25T01:30:00.000Z');
});
test('search horizon shortage is all-or-nothing',()=>{
 const source=fixture();source.channels.forEach(c=>c.postingSchedule.slots=[{id:'weekly',weekday:0,time:'10:00'}]);source.posts=Array.from({length:15},(_,i)=>draft('p'+i));const before=structuredClone(source);
 assert.throws(()=>prepareDraftBatch(source,{postIds:source.posts.map(p=>p.id),now}),e=>e.code==='BATCH_NO_SLOT');assert.deepEqual(source,before);
});
for(const [label,factory] of [['server',serverStore],['browser',browserStore]])test(`${label} intent plus actual Worker/API persists one canonical batch and exact metadata/media with unchanged planned posts`,async t=>{
 const s=await setup(t,factory,{media:true}),before=structuredClone(s.ui),bucket=structuredClone([...s.env.BUCKET.data]);
 const preview=s.store.previewDraftBatch(s.ui,{postIds:['two','one','three']});assert.equal(s.calls.length,0);assert.equal(s.store.plannerRevision,s.ui.revision);
 const result=await s.store.scheduleDraftBatch(s.ui,preview);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.equal(result.revision,before.revision+1);assert.deepEqual(s.ui,before);
 const after=await s.client.load();
 for(const entry of preview.entries){const old=s.canonical.posts.find(p=>p.id===entry.postId),post=after.posts.find(p=>p.id===entry.postId);assert.deepEqual(stable(post),{...stable(old),stage:'planned',scheduledAt:entry.instant,timezone:entry.timezone,scheduleBinding:post.scheduleBinding,variants:old.variants.map(v=>({...v,status:'planned',scheduledAt:entry.instant,timezone:entry.timezone}))});assert.equal(post.scheduleBinding.sourceRevision,before.revision);}
 for(const id of ['fixed','bound'])assert.deepEqual(stable(after.posts.find(p=>p.id===id)),stable(s.canonical.posts.find(p=>p.id===id)));
 assert.deepEqual(after.media,s.canonical.media);assert.deepEqual(after.settings,s.canonical.settings);assert.deepEqual(after.channels,s.canonical.channels);assert.deepEqual([...s.env.BUCKET.data],bucket);
 assert.equal(after.capabilities.automaticPublishing,false);assert.equal(after.posts.length,s.canonical.posts.length);
});
test('preview rejects dirty UI and stale revision without reading, writing, resolving or uploading',async t=>{
 const s=await setup(t);for(const mutate of [x=>x.posts[0].text+='changed',x=>x.posts.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.bluesky='',x=>x.channels[0].enabled=false]){const changed=structuredClone(s.ui);mutate(changed);assert.throws(()=>s.store.previewDraftBatch(changed,{postIds:['one']}),e=>e.code==='BATCH_STATE_CHANGED');}
 assert.throws(()=>s.store.previewDraftBatch({...s.ui,revision:0},{postIds:['one']}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[]);
});
test('confirmation is bound to exact displayed values, current state and a consumed private one-use preview',async t=>{
 const s=await setup(t);for(const mutate of [p=>p.token='other',p=>p.entries[0].instant='2099-01-01T00:00:00.000Z',p=>p.entries[0].text='other',p=>p.entries.reverse(),p=>p.extra=true]){const preview=s.store.previewDraftBatch(s.ui,{postIds:['one','two']});mutate(preview);await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='BATCH_PREVIEW_CHANGED');}
 const old=s.store.previewDraftBatch(s.ui,{postIds:['one']}),newer=s.store.previewDraftBatch(s.ui,{postIds:['two']});await assert.rejects(s.store.scheduleDraftBatch(s.ui,old));await assert.rejects(s.store.scheduleDraftBatch(s.ui,newer));
 const preview=s.store.previewDraftBatch(s.ui,{postIds:['one']}),changed=structuredClone(s.ui);changed.posts[0].text='new input';await assert.rejects(s.store.scheduleDraftBatch(changed,preview),e=>e.code==='BATCH_STATE_CHANGED');assert.deepEqual(s.calls,[]);
});
test('reload and intervening saves invalidate a preview even when the selected draft looks unchanged',async t=>{
 const s=await setup(t);let preview=s.store.previewDraftBatch(s.ui,{postIds:['one']});await s.store.load();await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='BATCH_PREVIEW_CHANGED');
 preview=s.store.previewDraftBatch(s.ui,{postIds:['one']});const saved=await s.store.save(s.ui);await assert.rejects(s.store.scheduleDraftBatch(saved,preview),e=>e.code==='BATCH_STATE_CHANGED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('expiration rejects before network without recomputing or shifting preview times',async t=>{
 const s=await setup(t),preview=s.store.previewDraftBatch(s.ui,{postIds:['one','two']});t.mock.timers.enable({apis:['Date'],now:Date.parse(preview.entries[0].instant)});
 await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='PAST_TIME');assert.deepEqual(s.calls,[]);
});
test('one external revision conflict writes once, never merges and leaves all concurrent data intact',async t=>{
 const s=await setup(t),preview=s.store.previewDraftBatch(s.ui,{postIds:['one','two']});const other=await s.client.load();other.posts[0].title='Other writer';await s.client.save(other);const current=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='REVISION_CONFLICT');await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='BATCH_PREVIEW_CHANGED');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),current);
});
test('repository failure rolls back the entire batch and freezes unknown outcomes',async t=>{
 const s=await setup(t),preview=s.store.previewDraftBatch(s.ui,{postIds:['one','two']}),before=await s.client.load();s.calls.length=0;
 s.env.DB.sql.exec("CREATE TRIGGER reject_batch BEFORE INSERT ON planner_posts WHEN NEW.id='two' AND NEW.stage='planned' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview));await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);
});
for(const failure of ['lost','json','projection','metadata','extra-post','media','unknown-409'])test(`committed ${failure} receipt freezes all mutations, preserves UI and only reload reconciles`,async t=>{
 const s=await setup(t,serverStore,{media:true}),preview=s.store.previewDraftBatch(s.ui,{postIds:['one','two']}),held=structuredClone(s.ui);
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNKNOWN_CONFLICT'}},{status:409});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost';else if(failure==='extra-post')body.posts.pop();else body.media[0].altText='changed';return Response.json(body);});
 await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview));assert.deepEqual(s.ui,held);assert.equal(s.store.plannerRevision,held.revision);
 await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['three']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(null);const fresh=await s.store.load();assert.equal(fresh.revision,held.revision+1);assert.equal(fresh.posts.find(p=>p.id==='one').status,'scheduled');assert.throws(()=>s.store.previewDraftBatch(fresh,{postIds:['one']}),e=>e.code==='BATCH_DRAFT_REQUIRED');
});
test('pending intent blocks duplicate confirmations, preview, load, generic save and split',async t=>{
 const s=await setup(t),preview=s.store.previewDraftBatch(s.ui,{postIds:['one','two']});let release;const wait=new Promise(resolve=>release=resolve);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await wait;return fetch(path,options);});
 const pending=s.store.scheduleDraftBatch(s.ui,preview);await assert.rejects(s.store.scheduleDraftBatch(s.ui,preview),e=>e.code==='BUSY');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['three']}),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='BUSY');release();await pending;assert.equal(s.calls.length,1);
});
test('server/browser workflow and adapter mirrors remain identical',()=>{
 for(const file of ['takt-adapter.mjs'])assert.equal(readFileSync(new URL('../../modules/data/'+file,import.meta.url),'utf8'),readFileSync(new URL('../../public/data-client/'+file,import.meta.url),'utf8'));
 assert.equal(readFileSync(new URL('../../modules/workflows/draft-batch.mjs',import.meta.url),'utf8'),readFileSync(new URL('../../public/workflows/draft-batch.mjs',import.meta.url),'utf8'));
});

test('CSV import → batch planning → reload preserves CSV identities, exact text and labels in one planning save',async t=>{
 const {csvDraftState}=await import('../../public/planner-csv.js'),{previewPlanningImport,applyPlanningImport}=await import('../../public/planner-import.js');
 const s=await setup(t,browserStore,{media:true});const imported=await csvDraftState(s.ui,'Text,Tags\r\n"Literal <b> & 👩‍💻\nSecond line","Campaign,Tipps"\r\nAnother,Other','bluesky'),incoming=previewPlanningImport(s.ui,imported),withDrafts=await s.store.save(applyPlanningImport(s.ui,incoming));
 const before=await s.client.load(),ids=incoming.additions.map(p=>p.id);s.calls.length=0;const preview=s.store.previewDraftBatch(withDrafts,{postIds:ids});await s.store.scheduleDraftBatch(withDrafts,preview);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);
 const after=await s.client.load();for(const id of ids){const old=before.posts.find(p=>p.id===id),post=after.posts.find(p=>p.id===id);assert.equal(post.body,old.body);assert.deepEqual(post.tags,old.tags);assert.equal(post.variants[0].id,old.variants[0].id);assert.equal(post.variants[0].body,old.variants[0].body);assert.equal(post.variants[0].inheritsBody,old.variants[0].inheritsBody);assert.equal(post.stage,'planned');assert.deepEqual(post.variants[0].mediaIds,[]);}
 for(const old of before.posts.filter(p=>!ids.includes(p.id)))assert.deepEqual(stable(after.posts.find(p=>p.id===old.id)),stable(old));
 const reloaded=await s.store.load();assert.equal(reloaded.posts.filter(p=>ids.includes(p.id)).length,2);assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('adapter eligibility refuses empty/overlong own text and missing image alt before any write',async t=>{
 for(const kind of ['empty','long','alt']){
  const s=await setup(t,serverStore,{media:kind==='alt'}),data=await s.client.load();
  if(kind==='empty')data.posts.find(p=>p.id==='two').variants[0].body='';else if(kind==='long')data.posts.find(p=>p.id==='two').variants[0].body='x'.repeat(301);else s.env.DB.sql.prepare("UPDATE planner_media SET alt_text='' WHERE owner_id='alice'").run();
  if(kind!=='alt')await s.client.save(data);const ui=await s.store.load();s.calls.length=0;assert.throws(()=>s.store.previewDraftBatch(ui,{postIds:['one','two']}),e=>e.code==='BATCH_CONTENT_REQUIRED');assert.deepEqual(s.calls,[]);
 }
});
test('canonical UTF-8 byte growth is rejected before PUT instead of truncating or partially planning',async t=>{
 const s=await setup(t),data=await s.client.load();
 const bytes=value=>new TextEncoder().encode(JSON.stringify({schemaVersion:value.schemaVersion,revision:value.revision,settings:value.settings,channels:value.channels,posts:value.posts})).byteLength;
 while(bytes(data)<1024*1024-44000)data.posts.push({...draft('large-'+data.posts.length),body:'界'.repeat(6500),variants:[]});
 const filler={...draft('last'),body:'',variants:[]};data.posts.push(filler);const room=1024*1024-bytes(data)-240;assert.ok(room>0);filler.body='界'.repeat(Math.floor(room/3))+'x'.repeat(room%3);assert.ok(bytes(data)<1024*1024);await s.client.save({schemaVersion:data.schemaVersion,revision:data.revision,settings:data.settings,channels:data.channels,posts:data.posts});
 const ui=await s.store.load();s.calls.length=0;assert.throws(()=>s.store.previewDraftBatch(ui,{postIds:['one','two']}),e=>e.code==='BATCH_LIMIT'&&e.status===413);assert.deepEqual(s.calls,[]);
});
