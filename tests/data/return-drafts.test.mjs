import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {prepareReturnDrafts} from '../../modules/workflows/return-drafts.mjs';
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
 state.posts.push(fixed);for(const p of state.posts.filter(p=>p.stage==='draft')){p.stage='planned';p.scheduledAt='2099-10-15T10:01:02.123Z';p.variants[0].status='planned';p.variants[0].scheduledAt=p.scheduledAt;}state=await client.save(state);
 const proposal=findNextPostingSlots(state,{postId:'bound',channelIds:['mastodon'],after:'2099-10-01T00:00:00.000Z',limit:1}),chosen=selectPostingSlot(state,proposal,proposal.suggestions[0],{now:'2099-10-01T00:00:00.000Z'});
 const bound=draft('bound','mastodon');bound.stage='planned';bound.scheduledAt=chosen.scheduledAt;bound.timezone=chosen.timezone;bound.scheduleBinding=chosen.scheduleBinding;Object.assign(bound.variants[0],{status:'planned',scheduledAt:chosen.scheduledAt,timezone:chosen.timezone});state.posts.push(bound);await client.save(state);
 const store=factory({client,timezone:'UTC',channels:CHANNELS}),ui=normalizeState(await store.load()),canonical=await client.load();calls.length=0;
 return {env,store,ui,canonical,client,calls,intercept:fn=>{intercept=fn;}};
}
const now='2099-10-01T00:00:00.000Z';
test('preview rejects dirty UI and stale revision without reading, writing, resolving or uploading',async t=>{
 const s=await setup(t);for(const mutate of [x=>x.posts[0].text+='changed',x=>x.posts.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.bluesky='',x=>x.channels[0].enabled=false]){const changed=structuredClone(s.ui);mutate(changed);assert.throws(()=>s.store.previewReturnDrafts(changed,{postIds:['one']}),e=>e.code==='RETURN_STATE_CHANGED');}
 assert.throws(()=>s.store.previewReturnDrafts({...s.ui,revision:0},{postIds:['one']}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[]);
});
test('confirmation is bound to exact displayed values, current state and a consumed private one-use preview',async t=>{
 const s=await setup(t);for(const mutate of [p=>p.token='other',p=>p.entries[0].instant='2099-01-01T00:00:00.000Z',p=>p.entries[0].text='other',p=>p.entries.reverse(),p=>p.extra=true]){const preview=s.store.previewReturnDrafts(s.ui,{postIds:['one','two']});mutate(preview);await assert.rejects(s.store.returnDrafts(s.ui,preview),e=>e.code==='RETURN_PREVIEW_CHANGED');}
 const old=s.store.previewReturnDrafts(s.ui,{postIds:['one']}),newer=s.store.previewReturnDrafts(s.ui,{postIds:['two']});await assert.rejects(s.store.returnDrafts(s.ui,old));await assert.rejects(s.store.returnDrafts(s.ui,newer));
 const preview=s.store.previewReturnDrafts(s.ui,{postIds:['one']}),changed=structuredClone(s.ui);changed.posts[0].text='new input';await assert.rejects(s.store.returnDrafts(changed,preview),e=>e.code==='RETURN_STATE_CHANGED');assert.deepEqual(s.calls,[]);
});
test('reload and intervening saves invalidate a preview even when the selected draft looks unchanged',async t=>{
 const s=await setup(t);let preview=s.store.previewReturnDrafts(s.ui,{postIds:['one']});await s.store.load();await assert.rejects(s.store.returnDrafts(s.ui,preview),e=>e.code==='RETURN_PREVIEW_CHANGED');
 preview=s.store.previewReturnDrafts(s.ui,{postIds:['one']});const saved=await s.store.save(s.ui);await assert.rejects(s.store.returnDrafts(saved,preview),e=>e.code==='RETURN_STATE_CHANGED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('one external revision conflict writes once, never merges and leaves all concurrent data intact',async t=>{
 const s=await setup(t),preview=s.store.previewReturnDrafts(s.ui,{postIds:['one','two']});const other=await s.client.load();other.posts[0].title='Other writer';await s.client.save(other);const current=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.returnDrafts(s.ui,preview),e=>e.code==='REVISION_CONFLICT');await assert.rejects(s.store.returnDrafts(s.ui,preview),e=>e.code==='RETURN_PREVIEW_CHANGED');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),current);
});
test('repository failure rolls back the entire batch and freezes unknown outcomes',async t=>{
 const s=await setup(t),preview=s.store.previewReturnDrafts(s.ui,{postIds:['one','two']}),before=await s.client.load();s.calls.length=0;
 s.env.DB.sql.exec("CREATE TRIGGER reject_batch BEFORE INSERT ON planner_posts WHEN NEW.id='two' AND NEW.stage='draft' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(s.store.returnDrafts(s.ui,preview));await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);
});
for(const failure of ['lost','json','projection','metadata','extra-post','media','unknown-409'])test(`committed ${failure} receipt freezes all mutations, preserves UI and only reload reconciles`,async t=>{
 const s=await setup(t,serverStore,{media:true}),preview=s.store.previewReturnDrafts(s.ui,{postIds:['one','two']}),held=structuredClone(s.ui);
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNKNOWN_CONFLICT'}},{status:409});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost';else if(failure==='extra-post')body.posts.pop();else body.media[0].altText='changed';return Response.json(body);});
 await assert.rejects(s.store.returnDrafts(s.ui,preview));assert.deepEqual(s.ui,held);assert.equal(s.store.plannerRevision,held.revision);
 await assert.rejects(s.store.returnDrafts(s.ui,preview),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewReturnDrafts(s.ui,{postIds:['three']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(null);const fresh=await s.store.load();assert.equal(fresh.revision,held.revision+1);assert.equal(fresh.posts.find(p=>p.id==='one').status,'draft');assert.throws(()=>s.store.previewReturnDrafts(fresh,{postIds:['one']}),e=>e.code==='RETURN_POST_REQUIRED');
});
test('pending intent blocks duplicate confirmations, preview, load, generic save and split',async t=>{
 const s=await setup(t),preview=s.store.previewReturnDrafts(s.ui,{postIds:['one','two']});let release;const wait=new Promise(resolve=>release=resolve);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await wait;return fetch(path,options);});
 const pending=s.store.returnDrafts(s.ui,preview);await assert.rejects(s.store.returnDrafts(s.ui,preview),e=>e.code==='BUSY');assert.throws(()=>s.store.previewReturnDrafts(s.ui,{postIds:['three']}),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='BUSY');release();await pending;assert.equal(s.calls.length,1);
});

for(const [label,factory] of [['server',serverStore],['browser',browserStore]])test(`${label} one Worker CAS preserves all content and unrelated posts while clearing only selected planning`,async t=>{
 const s=await setup(t,factory,{media:true}),before=structuredClone(s.canonical),preview=s.store.previewReturnDrafts(s.ui,{postIds:['one','bound','fixed']});
 await s.store.returnDrafts(s.ui,preview);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);const after=await s.client.load();
 for(const old of before.posts){const p=after.posts.find(p=>p.id===old.id);const expected=stable(old);if(['one','bound','fixed'].includes(old.id)){expected.stage='draft';expected.scheduledAt=null;expected.scheduleBinding=null;expected.variants[0].status='draft';expected.variants[0].scheduledAt=null;}assert.deepEqual(stable(p),expected);}
 for(const field of ['media','settings','channels'])assert.deepEqual(after[field],before[field]);
});
test('pure all-or-nothing eligibility, bounded selection, no mutation and no current-rule requirement',()=>{
 const source=fixture();for(const p of source.posts){p.stage='planned';p.scheduledAt='2000-01-01T00:00:00.000Z';Object.assign(p.variants[0],{status:'planned',scheduledAt:p.scheduledAt});}source.channels.forEach(c=>{c.enabled=false;c.postingSchedule.paused=true;});const held=structuredClone(source);
 assert.equal(prepareReturnDrafts(source,{postIds:['one','two']}).entries.length,2);assert.deepEqual(source,held);
 for(const ids of [[],['one','one'],['one','missing'],['one',1],null,Array.from({length:101},(_,i)=>'p'+i)])assert.throws(()=>prepareReturnDrafts(source,{postIds:ids}));
 for(const mutate of [p=>p.stage='draft',p=>p.scheduledAt=null,p=>p.variants=[],p=>p.variants.push(variant('extra')),p=>p.variants[0].status='failed',p=>p.variants[0].format='story',p=>p.variants[0].publishedAt=now,p=>p.variants[0].publishedUrl='https://example.com/p',p=>p.variants[0].scheduledAt=now]){const bad=structuredClone(source);mutate(bad.posts[1]);const held=structuredClone(bad);assert.throws(()=>prepareReturnDrafts(bad,{postIds:['one','two']}));assert.deepEqual(bad,held);}
});
test('cancellation consumes exact private intent and date passage does not exclude a planned row',async t=>{
 const s=await setup(t);let p=s.store.previewReturnDrafts(s.ui,{postIds:['one']});s.store.cancelReturnDrafts(p);await assert.rejects(s.store.returnDrafts(s.ui,p),e=>e.code==='RETURN_PREVIEW_CHANGED');assert.equal(s.calls.length,0);
 p=s.store.previewReturnDrafts(s.ui,{postIds:['one']});t.mock.timers.enable({apis:['Date'],now:Date.parse(p.entries[0].instant)+1});await s.store.returnDrafts(s.ui,p);assert.equal(s.calls.length,1);
});
test('mirrored modules are identical',()=>{for(const [folder,name] of [['data','takt-adapter'],['workflows','return-drafts']])assert.equal(readFileSync(new URL(`../../modules/${folder}/${name}.mjs`,import.meta.url),'utf8'),readFileSync(new URL(`../../public/${folder==='data'?'data-client':folder}/${name}.mjs`,import.meta.url),'utf8'));});
test('local HTTP route persists draft return across restart',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createLocalHandler}=await import('../../server/handler.mjs');
 const directory=await mkdtemp(join(tmpdir(),'takt-return-'));let app=createLocalHandler({directory});t.after(async()=>{app.close();await rm(directory,{recursive:true,force:true});});const calls=[];
 const client=createPlannerClient({fetcher:(path,options={})=>{calls.push(options.method||'GET');return app.fetch(new Request('http://localhost:3000'+path,options));}});
 const state=fixture();state.posts=state.posts.slice(0,1);const p=state.posts[0];p.stage='planned';p.scheduledAt='2000-01-01T00:00:00.000Z';Object.assign(p.variants[0],{status:'planned',scheduledAt:p.scheduledAt});await client.save(state);
 const store=browserStore({client,timezone:'UTC',channels:CHANNELS}),ui=await store.load(),preview=store.previewReturnDrafts(ui,{postIds:['one']});calls.length=0;await store.returnDrafts(ui,preview);assert.deepEqual(calls,['PUT']);app.close();app=createLocalHandler({directory});const loaded=await client.load();assert.equal(loaded.posts[0].stage,'draft');assert.equal(loaded.posts[0].body,p.body);assert.deepEqual(loaded.posts[0].tags,p.tags);assert.equal(loaded.posts[0].variants[0].statusNote,p.variants[0].statusNote);
});
test('stale paused disabled bindings may return and every workflow stays locked after an uncertain write or bad reload',async t=>{
 const s=await setup(t),data=await s.client.load();data.channels.forEach(c=>{c.enabled=false;c.postingSchedule.paused=true;c.postingSchedule.slots=[];});await s.client.save(data);const ui=await s.store.load(),preview=s.store.previewReturnDrafts(ui,{postIds:['bound']});s.calls.length=0;
 s.intercept(async(path,options,fetch)=>{if(options.method==='PUT'){await fetch(path,options);throw Error('lost');}return Response.json({});});await assert.rejects(s.store.returnDrafts(ui,preview));await assert.rejects(s.store.load());
 for(const call of [()=>s.store.previewQueueReflow(ui,{channelId:'mastodon'}),()=>s.store.previewQueuePriority(ui,{postId:'bound',channelId:'mastodon'}),()=>s.store.previewDraftBatch(ui,{postIds:['one']})])assert.throws(call,e=>e.code==='RELOAD_REQUIRED');
 for(const call of [()=>s.store.reflowQueue(ui,{}),()=>s.store.prioritizeQueue(ui,{}),()=>s.store.scheduleDraftBatch(ui,{}),()=>s.store.save(ui),()=>s.store.splitDraft(ui,{postId:'one'})])await assert.rejects(call,e=>e.code==='RELOAD_REQUIRED');
 s.intercept(null);assert.equal((await s.store.load()).posts.find(p=>p.id==='bound').status,'draft');
});
