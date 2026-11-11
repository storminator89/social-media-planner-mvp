import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {prepareDraftBatch} from '../../modules/workflows/draft-batch.mjs';
import {prepareQueueReflow} from '../../modules/workflows/queue-reflow.mjs';
import {validateScheduleChanges,inspectScheduleBinding,findNextPostingSlots} from '../../modules/workflows/posting-schedules.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const NOW='2030-04-01T00:00:00.000Z',EARLY='2030-03-01T00:00:00.000Z';
const rules=(extra={})=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:60,overlapChoice:'later',slots:[{id:'weekly',weekday:3,time:'09:00'}],...extra});
const draft=(id,channelId='bluesky')=>({id,title:`Titel ${id}`,body:`Basis ${id}`,tags:[' Label ','A\r\nB','A','A'],stage:'draft',scheduledAt:null,scheduleBinding:null,timezone:'Asia/Kathmandu',cover:'studio',createdAt:'2025-01-02T03:04:05.678Z',updatedAt:'2025-01-02T03:04:05.678Z',variants:[{id:`v-${id}`,channelId,body:`Kanal ${id}\r\n👩‍💻 <img onerror=alert(1)>`,inheritsBody:false,status:'draft',scheduledAt:null,timezone:'Asia/Kathmandu',publishedAt:null,publishedUrl:null,format:'post',mediaIds:[],statusNote:'Notiz\r\n exakt'}]});
function original(){
 let state={schemaVersion:3,revision:0,settings:{timezone:'Asia/Tokyo',locale:'en-GB'},channels:CHANNELS.map(c=>({id:c.id,platform:c.id,name:c.name,handle:'',color:c.color,enabled:true,connectionStatus:'manual',postingSchedule:rules()})),posts:[draft('one'),draft('two'),draft('other','linkedin'),draft('past'),draft('spare')],media:[]};
 state=prepareDraftBatch(state,{postIds:['two','one','other'],now:NOW}).next;
 state=prepareDraftBatch(state,{postIds:['past'],now:EARLY}).next;
 for(const [i,post] of state.posts.entries()){post.timezone=['Asia/Kathmandu','America/New_York','Australia/Lord_Howe'][i%3];post.variants[0].timezone=post.timezone;}
 const fixed=draft('fixed');fixed.stage='planned';fixed.scheduledAt='2030-04-04T10:00:00.000Z';Object.assign(fixed.variants[0],{status:'planned',scheduledAt:fixed.scheduledAt});state.posts.push(fixed);
 return state;
}
function changed(state=original()){const next=structuredClone(state);next.channels.find(c=>c.id==='bluesky').postingSchedule=rules({slots:[{id:'new-weekly',weekday:4,time:'12:00'}]});return next;}
const reflow=(state,extra={})=>prepareQueueReflow(state,{channelId:'bluesky',now:NOW,...extra});
const stable=p=>{const n=structuredClone(p);delete n.updatedAt;return n;};
async function setup(t,factory=serverStore,{media=false}={}){
 t.mock.timers.enable({apis:['Date'],now:Date.parse(EARLY)});
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fixture-site',TAKT_SITE_ORIGIN:'https://planner.example'},calls=[];t.after(()=>env.DB.sql.close());let intercept;
 const handler=createSitesHandler(),realFetch=(path,options={})=>handler.fetch(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:(path,options={})=>{calls.push([options.method||'GET',path]);return intercept?intercept(path,options,realFetch):realFetch(path,options);}}),data=original();
 if(media){const m=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'exact.jpg',{type:'image/jpeg'}),'Exact Alt 👩‍💻');const second=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'second.jpg',{type:'image/jpeg'}),'Second ordered alt');data.posts[0].variants[0].mediaIds=[m.id,second.id];}
 const initial=await client.save(data);t.mock.timers.setTime(Date.parse(NOW));await client.save(changed(initial));
 const store=factory({client,timezone:'UTC',channels:CHANNELS}),ui=normalizeState(await store.load()),canonical=await client.load();calls.length=0;
 return {env,client,store,ui,canonical,calls,intercept:fn=>{intercept=fn;}};
}
const preview=s=>s.store.previewQueueReflow(s.ui,{channelId:'bluesky'});

test('whole-channel stale queue uses old UTC order, skips fixed occupancy, preserves zones and canonical fields',()=>{
 const source=changed();source.revision=7;const before=structuredClone(source),{next,entries,unchanged}=reflow(source);
 assert.deepEqual(source,before);assert.deepEqual(entries.map(e=>e.postId),['two','one']);assert.deepEqual(entries.map(e=>e.to.instant),['2030-04-11T10:00:00.000Z','2030-04-18T10:00:00.000Z']);assert.deepEqual(unchanged,{fixed:1,past:1});assert.equal(next.revision,7);
 for(const entry of entries){const old=source.posts.find(p=>p.id===entry.postId),post=next.posts.find(p=>p.id===entry.postId);assert.deepEqual(post,{...old,scheduledAt:entry.to.instant,scheduleBinding:post.scheduleBinding,variants:[{...old.variants[0],scheduledAt:entry.to.instant}]});assert.equal(post.scheduleBinding.sourceRevision,7);assert.equal(post.scheduleBinding.selectedAt,NOW);assert.equal(inspectScheduleBinding(post,next.channels).state,'current');assert.equal(entry.to.timezone,old.timezone);assert.equal(entry.text,old.variants[0].body);}
 for(const id of ['fixed','past','other','spare'])assert.deepEqual(next.posts.find(p=>p.id===id),source.posts.find(p=>p.id===id));
 assert.equal(validateScheduleChanges(next,source,NOW),true);
});
test('all old affected reservations are released before search; input order and hypothetical UI filters never select a subset',()=>{
 const source=original(),before=structuredClone(source),a=reflow(source),b=reflow({...source,posts:[...source.posts].reverse()});
 assert.deepEqual(a.entries.map(e=>e.to.instant),[source.posts.find(p=>p.id==='two').scheduledAt,source.posts.find(p=>p.id==='one').scheduledAt]);assert.deepEqual(a.entries,b.entries);assert.deepEqual(source,before);
 const ignored=prepareQueueReflow(changed(),{channelId:'bluesky',postIds:['one'],query:'one',tag:'Hidden',now:NOW});assert.deepEqual(ignored.entries.map(e=>e.postId),['two','one']);
});
test('missing paused disabled empty rules and all-channels reject rather than silently change scope',()=>{
 for(const mutate of [c=>c.enabled=false,c=>c.postingSchedule=null,c=>c.postingSchedule.paused=true,c=>c.postingSchedule.slots=[]]){const source=changed();mutate(source.channels.find(c=>c.id==='bluesky'));const before=structuredClone(source);assert.throws(()=>reflow(source),e=>e.code==='REFLOW_CHANNEL_REQUIRED');assert.deepEqual(source,before);}
 assert.throws(()=>reflow(changed(),{channelId:'all'}),e=>e.code==='REFLOW_CHANNEL_REQUIRED');assert.throws(()=>reflow(changed(),{channelId:'mastodon'}),e=>e.code==='REFLOW_EMPTY');
});
test('future hidden incompatible/multi-channel row blocks the entire queue; old past rows are explicitly unchanged',()=>{
 for(const mutate of [p=>p.variants.push({...p.variants[0],id:'multi',channelId:'linkedin'}),p=>p.stage='draft',p=>p.variants[0].status='ready',p=>p.variants[0].publishedAt=NOW,p=>p.variants[0].publishedUrl='https://example.com/post',p=>p.variants[0].format='story',p=>p.variants[0].timezone='UTC',p=>p.scheduledAt=null,p=>p.scheduleBinding.refs[0].channelId='linkedin']){
  const source=changed();mutate(source.posts.find(p=>p.id==='one'));const before=structuredClone(source);assert.throws(()=>reflow(source));assert.deepEqual(source,before);
 }
 const source=changed(),past=source.posts.find(p=>p.id==='past');past.variants.push({...past.variants[0],id:'old-multi',channelId:'linkedin'});past.scheduleBinding.refs.push({...past.scheduleBinding.refs[0],channelId:'linkedin'});const result=reflow(source);assert.deepEqual(result.next.posts.find(p=>p.id==='past'),past);assert.equal(result.unchanged.past,1);
});
test('60-day horizon is anchored once; insufficient horizon rejects the whole queue',()=>{
 let source=original();const prototype=source.posts.find(p=>p.id==='one');source.posts=Array.from({length:12},(_,i)=>({...structuredClone(prototype),id:`p${i}`,variants:[{...structuredClone(prototype.variants[0]),id:`v${i}`}]}));source=changed(source);const before=structuredClone(source);assert.throws(()=>reflow(source),e=>e.code==='REFLOW_NO_SLOT');assert.deepEqual(source,before);
});
for(const [name,zone,after,choice,expected] of [['gap','Europe/Berlin','2030-03-30T00:00:00.000Z','later','2030-04-07T00:30:00.000Z'],['fold','Europe/Berlin','2030-10-26T00:00:00.000Z','later','2030-10-27T01:30:00.000Z'],['reject-fold','Europe/Berlin','2030-10-26T00:00:00.000Z','reject','2030-11-03T01:30:00.000Z']])test(`reflow ${name} uses current DST rules and preserves source display zone`,()=>{
 let source=original();source.posts=source.posts.filter(p=>['one','two'].includes(p.id));for(const post of source.posts){const old=post.scheduledAt;post.scheduledAt='2099'+old.slice(4);post.scheduleBinding.instant=post.scheduledAt;post.scheduleBinding.refs[0].local='2099'+post.scheduleBinding.refs[0].local.slice(4);post.variants[0].scheduledAt=post.scheduledAt;}
 source.channels.find(c=>c.id==='bluesky').postingSchedule=rules({timezone:zone,overlapChoice:choice,slots:[{id:'sunday',weekday:0,time:'02:30'}]});const result=reflow(source,{now:after});assert.equal(result.entries[0].to.instant,expected);assert.equal(result.entries[0].to.timezone,source.posts.find(p=>p.id===result.entries[0].postId).timezone);assert.ok(result.next.posts.every(p=>inspectScheduleBinding(p,result.next.channels).state==='current'));
});
for(const [name,factory] of [['server',serverStore],['browser',browserStore]])test(`${name} preview then one real Worker/API CAS preserves canonical fields, media, settings and unrelated posts`,async t=>{
 const s=await setup(t,factory,{media:true}),held=structuredClone(s.ui),bucket=structuredClone([...s.env.BUCKET.data]),p=preview(s);assert.deepEqual(s.calls,[]);assert.equal(p.entries.length,2);
 const saved=await s.store.reflowQueue(s.ui,p);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.equal(saved.revision,held.revision+1);assert.deepEqual(s.ui,held);
 const after=await s.client.load();for(const old of s.canonical.posts){const post=after.posts.find(p=>p.id===old.id),entry=p.entries.find(e=>e.postId===old.id);assert.deepEqual(stable(post),entry?{...stable(old),scheduledAt:entry.to.instant,scheduleBinding:post.scheduleBinding,variants:[{...old.variants[0],scheduledAt:entry.to.instant}]}:stable(old));if(entry)assert.equal(post.scheduleBinding.sourceRevision,held.revision);}
 assert.deepEqual(after.channels,s.canonical.channels);assert.deepEqual(after.settings,s.canonical.settings);assert.deepEqual(after.media,s.canonical.media);assert.deepEqual([...s.env.BUCKET.data],bucket);assert.equal(after.posts.length,s.canonical.posts.length);assert.equal(after.capabilities.automaticPublishing,false);
 const next=s.store.previewQueueReflow(saved,{channelId:'bluesky'});assert.equal(next.revision,saved.revision);s.store.cancelQueueReflow(next);
});
test('dirty state/stale revision and full-state validation reject without any network action',async t=>{
 const s=await setup(t);for(const mutate of [x=>x.posts[0].text+='changed',x=>x.posts.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.bluesky='',x=>x.channels[0].enabled=false]){const changed=structuredClone(s.ui);mutate(changed);assert.throws(()=>s.store.previewQueueReflow(changed,{channelId:'bluesky'}),e=>e.code==='REFLOW_STATE_CHANGED');}
 assert.throws(()=>s.store.previewQueueReflow({...s.ui,revision:0},{channelId:'bluesky'}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[]);
 const invalid=structuredClone(s.canonical);invalid.posts.find(p=>p.id==='spare').body='X'.repeat(20001);let calls=0;const store=serverStore({client:{load:async()=>invalid,save:async()=>calls++},timezone:'UTC',channels:CHANNELS});const ui=await store.load();assert.throws(()=>store.previewQueueReflow(ui,{channelId:'bluesky'}),e=>e.code==='INVALID_STATE');assert.equal(calls,0);
});
test('display values, membership, order, unchanged counts and token are private one-use intent; cancellation is exact',async t=>{
 const s=await setup(t);for(const mutate of [p=>p.token='other',p=>p.channelId='linkedin',p=>p.entries[0].to.instant=NOW,p=>p.entries[0].from.instant=NOW,p=>p.entries[0].text='other',p=>p.entries.reverse(),p=>p.entries.pop(),p=>p.unchanged.past=0,p=>p.extra=true]){const p=preview(s);mutate(p);await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='REFLOW_PREVIEW_CHANGED');}
 const old=preview(s),fresh=preview(s);s.store.cancelQueueReflow(old);await s.store.reflowQueue(s.ui,fresh);assert.equal(s.calls.length,1);await assert.rejects(s.store.reflowQueue(s.ui,fresh),e=>e.code==='REFLOW_PREVIEW_CHANGED');
});
test('reload/intervening save invalidate an unchanged-looking preview',async t=>{
 const s=await setup(t);let p=preview(s);await s.store.load();await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='REFLOW_PREVIEW_CHANGED');p=preview(s);const saved=await s.store.save(s.ui);await assert.rejects(s.store.reflowQueue(saved,p),e=>e.code==='REFLOW_STATE_CHANGED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('source crossing into past rejects before PUT even with a future destination',async t=>{
 const s=await setup(t),p=preview(s);t.mock.timers.setTime(Date.parse(p.entries[0].from.instant));assert.ok(Date.parse(p.entries[0].to.instant)>Date.now());await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='PAST_TIME');assert.deepEqual(s.calls,[]);
});
test('destination crossing into past rejects before PUT',async t=>{
 const s=await setup(t);const p=preview(s);t.mock.timers.setTime(Date.parse(p.entries[0].to.instant));await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='PAST_TIME');assert.deepEqual(s.calls,[]);
});
test('one external revision conflict writes once, never merges, preserves concurrent data',async t=>{
 const s=await setup(t),p=preview(s),other=await s.client.load();other.posts[0].title='Other writer';await s.client.save(other);const before=await s.client.load();s.calls.length=0;await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='REVISION_CONFLICT');await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='REFLOW_PREVIEW_CHANGED');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),before);
});
test('repository failure rolls back all posts and retains unknown-outcome lock',async t=>{
 const s=await setup(t),p=preview(s),before=await s.client.load();s.calls.length=0;s.env.DB.sql.exec("CREATE TRIGGER reject_reflow BEFORE INSERT ON planner_posts WHEN NEW.id='one' BEGIN SELECT RAISE(ABORT,'test failure'); END;");await assert.rejects(s.store.reflowQueue(s.ui,p));assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');
});
for(const failure of ['lost','json','projection','metadata','binding','unrelated-post','media','revision','unknown-409'])test(`committed ${failure} receipt blocks all planner mutations until successful load`,async t=>{
 const s=await setup(t,serverStore,{media:true}),p=preview(s),held=structuredClone(s.ui);
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNKNOWN_CONFLICT'}},{status:409});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost';else if(failure==='binding')body.posts.find(p=>p.id==='one').scheduleBinding=null;else if(failure==='unrelated-post')body.posts.find(p=>p.id==='spare').title='changed';else if(failure==='revision')body.revision++;else body.media[0].altText='changed';return Response.json(body);});
 await assert.rejects(s.store.reflowQueue(s.ui,p));assert.deepEqual(s.ui,held);assert.equal(s.store.plannerRevision,held.revision);
 await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>preview(s),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['spare']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.scheduleDraftBatch(s.ui,{}),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewQueuePriority(s.ui,{postId:'one',channelId:'bluesky'}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.prioritizeQueue(s.ui,{}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(async()=>{throw Error('load failed');});await assert.rejects(s.store.load());assert.throws(()=>preview(s),e=>e.code==='RELOAD_REQUIRED');s.intercept(null);s.ui=normalizeState(await s.store.load());assert.equal(preview(s).revision,s.ui.revision);
});
test('pending single write gates duplicate confirmation, loads, every preview and every mutation',async t=>{
 const s=await setup(t),p=preview(s);let release;const wait=new Promise(resolve=>release=resolve);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await wait;return fetch(path,options);});
 const pending=s.store.reflowQueue(s.ui,p);await assert.rejects(s.store.reflowQueue(s.ui,p),e=>e.code==='BUSY');assert.throws(()=>preview(s),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='BUSY');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['spare']}),e=>e.code==='BUSY');await assert.rejects(s.store.scheduleDraftBatch(s.ui,{}),e=>e.code==='BUSY');assert.throws(()=>s.store.previewQueuePriority(s.ui,{postId:'one',channelId:'bluesky'}),e=>e.code==='BUSY');await assert.rejects(s.store.prioritizeQueue(s.ui,{}),e=>e.code==='BUSY');release();await pending;assert.equal(s.calls.length,1);
});
test('both browser mirrors use the exact canonical workflow and actual complete-state validator',()=>{
 for(const [a,b] of [['modules/data/takt-adapter.mjs','public/data-client/takt-adapter.mjs'],['modules/workflows/queue-reflow.mjs','public/workflows/queue-reflow.mjs'],['modules/data/domain.mjs','public/data-client/domain.mjs']])assert.equal(readFileSync(new URL('../../'+a,import.meta.url),'utf8'),readFileSync(new URL('../../'+b,import.meta.url),'utf8'));
});

test('fixed millisecond precision and minimum-gap neighbors stay occupied and exact',()=>{
 const source=changed(),fixed=source.posts.find(p=>p.id==='fixed');fixed.scheduledAt='2030-04-04T10:00:00.321Z';fixed.variants[0].scheduledAt=fixed.scheduledAt;source.channels.find(c=>c.id==='bluesky').postingSchedule.slots=['12:00','13:00','14:00','15:00'].map((time,i)=>({id:`thursday-${i}`,weekday:4,time}));
 const result=reflow(source);assert.deepEqual(result.entries.map(e=>e.to.instant),['2030-04-04T12:00:00.000Z','2030-04-04T13:00:00.000Z']);assert.deepEqual(result.next.posts.find(p=>p.id==='fixed'),fixed);
});
test('inherited text and an explicitly identical independent variant remain distinct',()=>{
 const source=changed(),one=source.posts.find(p=>p.id==='one'),two=source.posts.find(p=>p.id==='two');one.variants[0].inheritsBody=true;one.variants[0].body=one.body;two.variants[0].body=two.body;const result=reflow(source);
 for(const original of [one,two]){const next=result.next.posts.find(p=>p.id===original.id);assert.equal(next.variants[0].inheritsBody,original.variants[0].inheritsBody);assert.equal(next.variants[0].body,original.body);assert.equal(next.variants[0].statusNote,original.variants[0].statusNote);assert.deepEqual(next.tags,original.tags);}
});
test('half-hour DST fold uses the current explicit later choice',()=>{
 const source=changed();source.posts=source.posts.filter(p=>p.id==='one');const post=source.posts[0];post.scheduledAt='2099-04-10T07:00:00.000Z';post.variants[0].scheduledAt=post.scheduledAt;post.scheduleBinding.instant=post.scheduledAt;post.scheduleBinding.refs[0].local='2099-04-10T09:00';source.channels.find(c=>c.id==='bluesky').postingSchedule=rules({timezone:'Australia/Lord_Howe',slots:[{id:'fold',weekday:0,time:'01:45'}]});const result=reflow(source,{now:'2030-04-06T00:00:00.000Z'});assert.equal(result.entries[0].to.instant,'2030-04-06T15:15:00.000Z');assert.equal(result.entries[0].to.timezone,post.timezone);
});

test('reduced current gap skips a candidate forbidden by an unchanged past binding original gap',()=>{
 const base={schemaVersion:3,revision:0,settings:{timezone:'UTC',locale:'de-DE'},channels:[{id:'bluesky',platform:'bluesky',name:'Bluesky',handle:'',color:'#aabbcc',enabled:true,connectionStatus:'manual',postingSchedule:rules({timezone:'UTC',minimumGapMinutes:120,slots:Array.from({length:7},(_,weekday)=>['10:00','13:00'].map((time,i)=>({id:`old-${weekday}-${i}`,weekday,time}))).flat()})}],posts:[draft('early'),draft('future')],media:[]};
 let source=prepareDraftBatch(base,{postIds:['early','future'],now:NOW}).next;source.revision=5;source.channels[0].postingSchedule=rules({timezone:'UTC',minimumGapMinutes:30,slots:Array.from({length:7},(_,weekday)=>['11:00','12:00','13:00'].map((time,i)=>({id:`new-${weekday}-${i}`,weekday,time}))).flat()});
 const before=structuredClone(source),at='2030-04-01T10:30:00.000Z',result=reflow(source,{now:at});assert.equal(result.entries.length,1);assert.equal(result.entries[0].postId,'future');assert.equal(result.entries[0].to.instant,'2030-04-01T12:00:00.000Z');assert.equal(result.unchanged.past,1);assert.deepEqual(result.next.posts.find(p=>p.id==='early'),source.posts.find(p=>p.id==='early'));assert.equal(result.next.posts.find(p=>p.id==='early').scheduleBinding.refs[0].minimumGapMinutes,120);assert.equal(result.next.posts.find(p=>p.id==='future').scheduleBinding.refs[0].minimumGapMinutes,30);assert.equal(validateScheduleChanges(result.next,source,at),true);assert.deepEqual(source,before);
});

test('real persisted schedule edit with a reduced gap reflows past the preserved historical gap',async t=>{
 const s=await setup(t),current=await s.client.load();t.mock.timers.setTime(Date.parse('2030-04-03T07:15:00.000Z'));current.channels.find(c=>c.id==='bluesky').postingSchedule=rules({minimumGapMinutes:30,slots:['09:30','10:00','10:30'].map((time,i)=>({id:`reduced-${i}`,weekday:3,time}))});await s.client.save(current);s.ui=normalizeState(await s.store.load());const before=await s.client.load();s.calls.length=0;
 const p=preview(s);assert.equal(p.entries.length,1);assert.equal(p.entries[0].postId,'one');assert.equal(p.entries[0].to.instant,'2030-04-03T08:00:00.000Z');await s.store.reflowQueue(s.ui,p);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);const after=await s.client.load();assert.deepEqual(stable(after.posts.find(p=>p.id==='two')),stable(before.posts.find(p=>p.id==='two')));assert.equal(after.posts.find(p=>p.id==='one').scheduleBinding.refs[0].minimumGapMinutes,30);
});
