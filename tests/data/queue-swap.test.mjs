import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {prepareDraftBatch} from '../../modules/workflows/draft-batch.mjs';
import {prepareQueueSwap} from '../../modules/workflows/queue-swap.mjs';
import {validateScheduleChanges,inspectScheduleBinding} from '../../modules/workflows/posting-schedules.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const NOW='2099-10-01T00:00:00.000Z';
const rules=(extra={})=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:30,overlapChoice:'later',slots:Array.from({length:7},(_,weekday)=>['09:00','10:00','11:00','12:00'].map((time,i)=>({id:`s-${weekday}-${i}`,weekday,time}))).flat(),...extra});
const draft=(id,channelId='bluesky')=>({id,title:`Titel ${id}`,body:`Basis ${id}`,tags:[' Label ','A\r\nB','A','A'],stage:'draft',scheduledAt:null,scheduleBinding:null,timezone:'Asia/Kathmandu',cover:'studio',createdAt:'2025-01-02T03:04:05.678Z',updatedAt:'2025-01-02T03:04:05.678Z',variants:[{id:`v-${id}`,channelId,body:`Kanal ${id}\r\n👩‍💻 <img onerror=alert(1)>`,inheritsBody:false,status:'draft',scheduledAt:null,timezone:'Asia/Kathmandu',publishedAt:null,publishedUrl:null,format:'post',mediaIds:[],statusNote:'Notiz\r\n exakt'}]});
function fixture({now=NOW,schedule=rules(),fixed=true}={}){
 const state={schemaVersion:3,revision:0,settings:{timezone:'Asia/Tokyo',locale:'en-GB'},channels:CHANNELS.map(c=>({id:c.id,platform:c.id,name:c.name,handle:'',color:c.color,enabled:true,connectionStatus:'manual',postingSchedule:structuredClone(schedule)})),posts:[draft('one'),draft('two'),draft('three'),draft('later'),draft('other','linkedin'),draft('spare')],media:[]};
 const next=prepareDraftBatch(state,{postIds:['one','two','three','later','other'],now}).next;
 for(const [index,post] of next.posts.entries()){post.timezone=['Asia/Kathmandu','America/New_York','Australia/Lord_Howe'][index%3];post.variants[0].timezone=post.timezone;}
 if(fixed){const post=draft('fixed');post.stage='planned';post.scheduledAt=new Date(Date.parse(next.posts[0].scheduledAt)+30*60000).toISOString();Object.assign(post.variants[0],{status:'planned',scheduledAt:post.scheduledAt});next.posts.push(post);}
 return next;
}
const stable=p=>{const n=structuredClone(p);delete n.updatedAt;return n;};
const swap=(state,extra={})=>prepareQueueSwap(state,{postIds:['one','three'],channelId:'bluesky',now:NOW,...extra});
async function setup(t,factory=serverStore,{media=false}={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fixture-site',TAKT_SITE_ORIGIN:'https://planner.example'},calls=[];t.after(()=>env.DB.sql.close());let intercept;
 const handler=createSitesHandler(),realFetch=(path,options={})=>handler.fetch(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:(path,options={})=>{calls.push([options.method||'GET',path]);return intercept?intercept(path,options,realFetch):realFetch(path,options);}}),data=fixture();
 if(media){const m=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'exact.jpg',{type:'image/jpeg'}),'Exact Alt 👩‍💻');const second=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'second.jpg',{type:'image/jpeg'}),'Second ordered alt');data.posts[0].variants[0].mediaIds=[m.id,second.id];}
 await client.save(data);const store=factory({client,timezone:'UTC',channels:CHANNELS}),ui=normalizeState(await store.load()),canonical=await client.load();calls.length=0;
 return {env,client,store,ui,canonical,calls,intercept:fn=>{intercept=fn;}};
}
const preview=s=>s.store.previewQueueSwap(s.ui,{postIds:['one','three'],channelId:'bluesky'});

test('exactly two existing reservations exchange; every other field and row survives',()=>{
 const source=fixture(),before=structuredClone(source),{next,entries}=swap(source);
 assert.deepEqual(source,before);assert.deepEqual(entries.map(e=>e.postId),['one','three']);
 assert.equal(entries[0].to.instant,source.posts[2].scheduledAt);assert.equal(entries[1].to.instant,source.posts[0].scheduledAt);
 for(const old of source.posts){const post=next.posts.find(p=>p.id===old.id),entry=entries.find(e=>e.postId===old.id);assert.deepEqual(post,entry?{...old,scheduledAt:entry.to.instant,scheduleBinding:post.scheduleBinding,variants:[{...old.variants[0],scheduledAt:entry.to.instant}]}:old);if(entry){assert.deepEqual(entry.fromBinding,old.scheduleBinding);assert.deepEqual(entry.toBinding,post.scheduleBinding);}}
});
test('selection rejects missing, duplicate, manual, foreign, malformed, stale and unsupported entries',()=>{
 for(const postIds of [undefined,[],['one'],['one','one'],['one','two','three'],['one','missing'],['one','fixed'],['one','spare'],['one','other'],[{},'one']])assert.throws(()=>swap(fixture(),{postIds}));
 for(const change of [p=>p.variants.push({...p.variants[0],id:'v-extra',channelId:'linkedin'}),p=>p.stage='draft',p=>p.variants[0].publishedAt=NOW,p=>p.variants[0].publishedUrl='https://example.com',p=>p.variants[0].format='story',p=>p.variants[0].timezone='UTC',p=>p.scheduleBinding.refs[0].slotId='gone',p=>p.scheduleBinding.refs[0].minimumGapMinutes=0,p=>p.scheduledAt=null])for(const index of [0,2]){const state=fixture();change(state.posts[index]);assert.throws(()=>swap(state));}
 for(const change of [c=>c.enabled=false,c=>c.postingSchedule.paused=true,c=>c.postingSchedule=null,c=>c.postingSchedule.slots.push({...c.postingSchedule.slots[0],id:'duplicate'})]){const state=fixture();change(state.channels.find(c=>c.id==='bluesky'));assert.throws(()=>swap(state));}
 assert.throws(()=>swap(fixture(),{now:'2100-01-01T00:00:00.000Z'}));
});
test('duplicate reservations and fixed collisions never move or compact other entries',()=>{
 const state=fixture();state.posts[2]=structuredClone({...state.posts[0],id:'three'});assert.throws(()=>swap(state));
 const fixed=fixture(),p=fixed.posts.find(p=>p.id==='fixed');p.scheduledAt=fixed.posts[0].scheduledAt;p.variants[0].scheduledAt=p.scheduledAt;assert.throws(()=>swap(fixed),e=>e.code==='SLOT_TAKEN');
});
for(const [zone,now,time] of [['Europe/Berlin','2027-03-25T00:00:00.000Z','02:30'],['Europe/Berlin','2027-10-25T00:00:00.000Z','02:30'],['Australia/Lord_Howe','2027-04-01T00:00:00.000Z','01:45']])test(`DST exchange ${zone} ${now} retains original UTC reservations`,()=>{
 const source=fixture({now,schedule:rules({timezone:zone,slots:[{id:'sun',weekday:0,time}]}),fixed:false}),{next,entries}=swap(source,{now});
 assert.equal(entries[0].to.instant,source.posts[2].scheduledAt);assert.equal(entries[1].to.instant,source.posts[0].scheduledAt);assert.equal(validateScheduleChanges(next,source,now),true);
});
for(const [name,factory] of [['server',serverStore],['browser',browserStore]])test(`${name} preview + one real Worker/API CAS preserves canonical content, bindings, zones, media and fixed rows`,async t=>{
 const s=await setup(t,factory,{media:true}),held=structuredClone(s.ui),bucket=structuredClone([...s.env.BUCKET.data]),p=preview(s);assert.deepEqual(s.calls,[]);
 const saved=await s.store.swapQueue(s.ui,p);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.equal(saved.revision,held.revision+1);assert.deepEqual(s.ui,held);
 const after=await s.client.load();for(const old of s.canonical.posts){const post=after.posts.find(p=>p.id===old.id),entry=p.entries.find(e=>e.postId===old.id);assert.deepEqual(stable(post),entry?{...stable(old),scheduledAt:entry.to.instant,scheduleBinding:post.scheduleBinding,variants:[{...old.variants[0],scheduledAt:entry.to.instant}]}:stable(old));if(entry)assert.equal(post.scheduleBinding.sourceRevision,held.revision);}
 assert.deepEqual(after.channels,s.canonical.channels);assert.deepEqual(after.settings,s.canonical.settings);assert.deepEqual(after.media,s.canonical.media);assert.deepEqual([...s.env.BUCKET.data],bucket);assert.equal(after.posts.length,s.canonical.posts.length);assert.equal(after.capabilities.automaticPublishing,false);
});
test('dirty UI and stale revision reject before reads, uploads, resolves or writes',async t=>{
 const s=await setup(t);for(const mutate of [x=>x.posts[0].text+='changed',x=>x.posts.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.bluesky='',x=>x.channels[0].enabled=false]){const changed=structuredClone(s.ui);mutate(changed);assert.throws(()=>s.store.previewQueueSwap(changed,{postIds:['one','three'],channelId:'bluesky'}),e=>e.code==='SWAP_STATE_CHANGED');}
 assert.throws(()=>s.store.previewQueueSwap({...s.ui,revision:0},{postIds:['one','three'],channelId:'bluesky'}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[]);
});
test('one-use preview binds displayed values, order, source and token; cancellation cannot cancel a newer token',async t=>{
 const s=await setup(t);for(const mutate of [p=>p.token='other',p=>p.channelId='linkedin',p=>p.entries[0].to.instant=NOW,p=>p.entries[0].text='other',p=>p.entries.reverse(),p=>p.extra=true]){const p=preview(s);mutate(p);await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='SWAP_PREVIEW_CHANGED');}
 const old=preview(s),fresh=preview(s);s.store.cancelQueueSwap(old);s.store.cancelQueueSwap(fresh);await assert.rejects(s.store.swapQueue(s.ui,fresh),e=>e.code==='SWAP_PREVIEW_CHANGED');
 const p=preview(s),changed=structuredClone(s.ui);changed.posts[0].text='new input';await assert.rejects(s.store.swapQueue(changed,p),e=>e.code==='SWAP_STATE_CHANGED');assert.deepEqual(s.calls,[]);
});
test('reload and an intervening save invalidate a private preview',async t=>{
 const s=await setup(t);let p=preview(s);await s.store.load();await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='SWAP_PREVIEW_CHANGED');
 p=preview(s);const saved=await s.store.save(s.ui);await assert.rejects(s.store.swapQueue(saved,p),e=>e.code==='SWAP_STATE_CHANGED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('elapsed first destination rejects before PUT without recalculating times',async t=>{
 const s=await setup(t),p=preview(s);t.mock.timers.enable({apis:['Date'],now:Date.parse(p.entries[0].to.instant)});await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='PAST_TIME');assert.deepEqual(s.calls,[]);
});
test('external revision conflict sends once, never retries/merges, preserves every concurrent change',async t=>{
 const s=await setup(t),p=preview(s),other=await s.client.load();other.posts[0].title='Concurrent';await s.client.save(other);const current=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='REVISION_CONFLICT');await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='SWAP_PREVIEW_CHANGED');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),current);
});
test('transaction failure rolls back every rotation and locks uncertain mutations',async t=>{
 const s=await setup(t),p=preview(s),before=await s.client.load();s.calls.length=0;s.env.DB.sql.exec("CREATE TRIGGER reject_swap BEFORE INSERT ON planner_posts WHEN NEW.id='two' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(s.store.swapQueue(s.ui,p));await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);
});
for(const failure of ['lost','json','projection','metadata','time','binding','extra-post','media','unknown-409'])test(`committed ${failure} receipt locks all mutations until a successful load`,async t=>{
 const s=await setup(t,serverStore,{media:true}),p=preview(s),held=structuredClone(s.ui);
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNKNOWN_CONFLICT'}},{status:409});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost';else if(failure==='time')body.posts.find(p=>p.id==='three').scheduledAt=NOW;else if(failure==='binding')body.posts.find(p=>p.id==='three').scheduleBinding=null;else if(failure==='extra-post')body.posts.pop();else body.media[0].altText='changed';return Response.json(body);});
 await assert.rejects(s.store.swapQueue(s.ui,p));assert.deepEqual(s.ui,held);assert.equal(s.store.plannerRevision,held.revision);
 await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>preview(s),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['spare']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.scheduleDraftBatch(s.ui,{}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(async()=>{throw Error('load failed');});await assert.rejects(s.store.load());assert.throws(()=>preview(s),e=>e.code==='RELOAD_REQUIRED');
 s.intercept(null);const fresh=await s.store.load();assert.equal(fresh.revision,held.revision+1);assert.equal(fresh.posts.find(p=>p.id==='three').scheduledInstant,p.entries[1].to.instant);assert.ok(s.store.previewQueueSwap(fresh,{postIds:['one','two'],channelId:'bluesky'}).token);
});
test('pending confirmation gates duplicates, preview, load and every mutation until its one receipt',async t=>{
 const s=await setup(t),p=preview(s);let release;const wait=new Promise(resolve=>release=resolve);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await wait;return fetch(path,options);});
 const pending=s.store.swapQueue(s.ui,p);await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='BUSY');assert.throws(()=>preview(s),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='BUSY');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['spare']}),e=>e.code==='BUSY');await assert.rejects(s.store.scheduleDraftBatch(s.ui,{}),e=>e.code==='BUSY');release();await pending;await assert.rejects(s.store.swapQueue(s.ui,p),e=>e.code==='SWAP_PREVIEW_CHANGED');assert.equal(s.calls.length,1);
});
test('both source mirrors remain byte identical',()=>{
 for(const [a,b] of [['modules/data/takt-adapter.mjs','public/data-client/takt-adapter.mjs'],['modules/workflows/queue-swap.mjs','public/workflows/queue-swap.mjs']])assert.equal(readFileSync(new URL('../../'+a,import.meta.url),'utf8'),readFileSync(new URL('../../'+b,import.meta.url),'utf8'));
});
