import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {prepareDraftBatch} from '../../modules/workflows/draft-batch.mjs';
import {prepareDateShift} from '../../modules/workflows/date-shift.mjs';
import {resolveLocalTime} from '../../modules/workflows/workflows.mjs';
import {validateScheduleChanges,inspectScheduleBinding} from '../../modules/workflows/posting-schedules.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const NOW='2099-10-01T00:00:00.000Z';
const rules=(extra={})=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:30,overlapChoice:'later',slots:Array.from({length:7},(_,weekday)=>['09:00','10:00','11:00','12:00'].map((time,i)=>({id:`s-${weekday}-${i}`,weekday,time}))).flat(),...extra});
const draft=(id,channelId='bluesky')=>({id,title:`Titel ${id}`,body:`Basis ${id}`,tags:[' Label ','A\r\nB','A','A'],stage:'draft',scheduledAt:null,scheduleBinding:null,timezone:'Asia/Kathmandu',cover:'studio',createdAt:'2025-01-02T03:04:05.678Z',updatedAt:'2025-01-02T03:04:05.678Z',variants:[{id:`v-${id}`,channelId,body:`Kanal ${id}\r\n👩‍💻 <img onerror=alert(1)>`,inheritsBody:false,status:'draft',scheduledAt:null,timezone:'Asia/Kathmandu',publishedAt:null,publishedUrl:null,format:'post',mediaIds:[],statusNote:'Notiz\r\n exakt'}]});
function fixture(){
 const state={schemaVersion:3,revision:0,settings:{timezone:'Asia/Tokyo',locale:'en-GB'},channels:CHANNELS.map(c=>({id:c.id,platform:c.id,name:c.name,handle:'',color:c.color,enabled:true,connectionStatus:'manual',postingSchedule:rules()})),posts:[draft('one'),draft('two'),draft('three'),draft('spare')],media:[]};
 for(const [i,p] of state.posts.entries()){if(p.id==='spare')continue;p.stage='planned';p.scheduledAt=`2099-11-${String(1+i*5).padStart(2,'0')}T09:00:00.000Z`;Object.assign(p.variants[0],{status:'planned',scheduledAt:p.scheduledAt});}
 return state;
}
const stable=p=>{const n=structuredClone(p);delete n.updatedAt;return n;};
async function setup(t,factory=serverStore,{media=false}={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fixture-site',TAKT_SITE_ORIGIN:'https://planner.example'},calls=[];t.after(()=>env.DB.sql.close());let intercept;
 const handler=createSitesHandler(),realFetch=(path,options={})=>handler.fetch(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:(path,options={})=>{calls.push([options.method||'GET',path]);return intercept?intercept(path,options,realFetch):realFetch(path,options);}}),data=fixture();
 if(media){const m=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'exact.jpg',{type:'image/jpeg'}),'Exact Alt 👩‍💻');const second=await client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'second.jpg',{type:'image/jpeg'}),'Second ordered alt');data.posts[0].variants[0].mediaIds=[m.id,second.id];}
 await client.save(data);const store=factory({client,timezone:'UTC',channels:CHANNELS}),ui=normalizeState(await store.load()),canonical=await client.load();calls.length=0;
 return {env,client,store,ui,canonical,calls,intercept:fn=>{intercept=fn;}};
}
const preview=s=>s.store.previewDateShift(s.ui,{postIds:['one','three'],days:2});

test('dirty UI and stale revision reject before reads, uploads, resolves or writes',async t=>{
 const s=await setup(t);for(const mutate of [x=>x.posts[0].text+='changed',x=>x.posts.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.bluesky='',x=>x.channels[0].enabled=false]){const changed=structuredClone(s.ui);mutate(changed);assert.throws(()=>s.store.previewDateShift(changed,{postIds:['one','three'],days:2}),e=>e.code==='SHIFT_STATE_CHANGED');}
 assert.throws(()=>s.store.previewDateShift({...s.ui,revision:0},{postIds:['one','three'],days:2}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[]);
});
test('one-use preview binds displayed values, order, source and token; cancellation cannot cancel a newer token',async t=>{
 const s=await setup(t);for(const mutate of [p=>p.token='other',p=>p.days=3,p=>p.entries[0].to.instant=NOW,p=>p.entries[0].text='other',p=>p.entries.reverse(),p=>p.extra=true]){const p=preview(s);mutate(p);await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='SHIFT_PREVIEW_CHANGED');}
 const old=preview(s),fresh=preview(s);s.store.cancelDateShift(old);s.store.cancelDateShift(fresh);await assert.rejects(s.store.shiftDates(s.ui,fresh),e=>e.code==='SHIFT_PREVIEW_CHANGED');
 const p=preview(s),changed=structuredClone(s.ui);changed.posts[0].text='new input';await assert.rejects(s.store.shiftDates(changed,p),e=>e.code==='SHIFT_STATE_CHANGED');assert.deepEqual(s.calls,[]);
});
test('reload and an intervening save invalidate a private preview',async t=>{
 const s=await setup(t);let p=preview(s);await s.store.load();await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='SHIFT_PREVIEW_CHANGED');
 p=preview(s);const saved=await s.store.save(s.ui);await assert.rejects(s.store.shiftDates(saved,p),e=>e.code==='SHIFT_STATE_CHANGED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('elapsed first destination rejects before PUT without recalculating times',async t=>{
 const s=await setup(t),p=preview(s);t.mock.timers.enable({apis:['Date'],now:Date.parse(p.entries[0].to.instant)});await assert.rejects(s.store.shiftDates(s.ui,p),e=>['PAST_TIME','SHIFT_POST_REQUIRED'].includes(e.code));assert.deepEqual(s.calls,[]);
});
test('external revision conflict sends once, never retries/merges, preserves every concurrent change',async t=>{
 const s=await setup(t),p=preview(s),other=await s.client.load();other.posts[0].title='Concurrent';await s.client.save(other);const current=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='REVISION_CONFLICT');await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='SHIFT_PREVIEW_CHANGED');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),current);
});
test('transaction failure rolls back every rotation and locks uncertain mutations',async t=>{
 const s=await setup(t),p=preview(s),before=await s.client.load();s.calls.length=0;s.env.DB.sql.exec("CREATE TRIGGER reject_swap BEFORE INSERT ON planner_posts WHEN NEW.id='two' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(s.store.shiftDates(s.ui,p));await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);
});
for(const failure of ['lost','json','projection','metadata','time','binding','extra-post','media','unknown-409'])test(`committed ${failure} receipt locks all mutations until a successful load`,async t=>{
 const s=await setup(t,serverStore,{media:true}),p=preview(s),held=structuredClone(s.ui);
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNKNOWN_CONFLICT'}},{status:409});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost';else if(failure==='time')body.posts.find(p=>p.id==='three').scheduledAt=NOW;else if(failure==='binding')body.posts.find(p=>p.id==='three').timezone='UTC';else if(failure==='extra-post')body.posts.pop();else body.media[0].altText='changed';return Response.json(body);});
 await assert.rejects(s.store.shiftDates(s.ui,p));assert.deepEqual(s.ui,held);assert.equal(s.store.plannerRevision,held.revision);
 await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>preview(s),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['spare']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.scheduleDraftBatch(s.ui,{}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(async()=>{throw Error('load failed');});await assert.rejects(s.store.load());assert.throws(()=>preview(s),e=>e.code==='RELOAD_REQUIRED');
 s.intercept(null);const fresh=await s.store.load();assert.equal(fresh.revision,held.revision+1);assert.equal(fresh.posts.find(p=>p.id==='three').scheduledInstant,p.entries[1].to.instant);assert.ok(s.store.previewDateShift(fresh,{postIds:['one','three'],days:2}).token);
});
test('pending confirmation gates duplicates, preview, load and every mutation until its one receipt',async t=>{
 const s=await setup(t),p=preview(s);let release;const wait=new Promise(resolve=>release=resolve);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await wait;return fetch(path,options);});
 const pending=s.store.shiftDates(s.ui,p);await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='BUSY');assert.throws(()=>preview(s),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='BUSY');assert.throws(()=>s.store.previewDraftBatch(s.ui,{postIds:['spare']}),e=>e.code==='BUSY');await assert.rejects(s.store.scheduleDraftBatch(s.ui,{}),e=>e.code==='BUSY');release();await pending;await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='SHIFT_PREVIEW_CHANGED');assert.equal(s.calls.length,1);
});
test('source mirrors remain exact',()=>{
 for(const [a,b] of [['modules/data/takt-adapter.mjs','public/data-client/takt-adapter.mjs'],['modules/workflows/date-shift.mjs','public/workflows/date-shift.mjs']])assert.equal(readFileSync(new URL('../../'+a,import.meta.url),'utf8'),readFileSync(new URL('../../'+b,import.meta.url),'utf8'));
});
const shift=(state,options={})=>prepareDateShift(state,{postIds:['one','three'],days:2,now:NOW,...options});
function at(post,local,zone='Europe/Berlin'){
 post.timezone=zone;post.scheduledAt=resolveLocalTime(local.slice(0,10),local.slice(11),zone).instant;Object.assign(post.variants[0],{timezone:zone,scheduledAt:post.scheduledAt});
}
test('pure calendar shift preserves every non-timing field and every unselected byte',()=>{
 const source=fixture(),before=structuredClone(source),{next,entries}=shift(source);assert.deepEqual(source,before);
 for(const old of source.posts){const entry=entries.find(e=>e.postId===old.id);assert.deepEqual(next.posts.find(p=>p.id===old.id),entry?{...old,scheduledAt:entry.to.instant,variants:[{...old.variants[0],scheduledAt:entry.to.instant}]}:old);}
 assert.deepEqual(next.channels,source.channels);assert.deepEqual(next.settings,source.settings);
});
for(const [local,days,expected] of [['2028-02-28T10:45',1,'2028-02-29T10:45'],['2028-02-29T10:45',1,'2028-03-01T10:45'],['2027-12-31T10:45',1,'2028-01-01T10:45'],['2028-03-01T10:45',-1,'2028-02-29T10:45'],['2027-03-27T10:45',1,'2027-03-28T10:45'],['2027-10-30T10:45',1,'2027-10-31T10:45']])test(`civil date ${local} ${days}`,()=>{
 const state=fixture();at(state.posts[0],local);at(state.posts[2],'2028-06-01T08:15','Asia/Kathmandu');
 const {entries}=shift(state,{days,now:'2026-01-01T00:00:00.000Z'});assert.equal(entries[0].to.local,expected);assert.equal(entries[1].to.local.slice(11),'08:15');assert.equal(entries[1].to.timezone,'Asia/Kathmandu');
 if(local==='2027-03-27T10:45')assert.equal(Date.parse(entries[0].to.instant)-Date.parse(entries[0].from.instant),23*3600000);
 if(local==='2027-10-30T10:45')assert.equal(Date.parse(entries[0].to.instant)-Date.parse(entries[0].from.instant),25*3600000);
});
for(const [local,code] of [['2027-03-27T02:30','DST_GAP'],['2027-10-30T02:30','DST_AMBIGUOUS']])test(`entire batch rejects ${code} without change`,()=>{
 const state=fixture();at(state.posts[2],local);const before=structuredClone(state);assert.throws(()=>shift(state,{days:1,now:'2026-01-01T00:00:00.000Z'}),e=>e.code===code);assert.deepEqual(state,before);
});
test('offset and selection boundaries; 50 allowed, 51 rejected',()=>{
 for(const days of [undefined,0,-366,366,1.5,'1',NaN,Infinity])assert.throws(()=>shift(fixture(),{days}));
 for(const days of [-365,365])assert.equal(shift(fixture(),{days,now:'2090-01-01T00:00:00.000Z'}).entries.length,2);
 for(const postIds of [undefined,[],['one'],['one','one'],['one','missing'],['one',{}]])assert.throws(()=>shift(fixture(),{postIds}));
 const state=fixture();state.posts=[];for(let i=0;i<51;i++){const post=fixture().posts[0];post.id=`p${i}`;post.variants[0].id=`v${i}`;at(post,`2099-${String(1+Math.floor(i/20)).padStart(2,'0')}-${String(i%20+1).padStart(2,'0')}T10:00`);state.posts.push(post);}
 assert.equal(shift(state,{postIds:state.posts.slice(0,50).map(p=>p.id),days:100,now:'2090-01-01T00:00:00.000Z'}).entries.length,50);assert.throws(()=>shift(state,{postIds:state.posts.map(p=>p.id)}));
});
test('unsupported or ineligible selected row rejects whole campaign',()=>{
 for(const change of [p=>p.stage='draft',p=>p.stage='archived',p=>p.stage='published',p=>p.variants[0].status='failed',p=>p.variants.push({...p.variants[0],id:'extra'}),p=>p.scheduleBinding={},p=>delete p.scheduleBinding,p=>p.variants[0].scheduledAt=NOW,p=>p.variants[0].timezone='UTC',p=>p.variants[0].publishedAt=NOW,p=>p.variants[0].format='story',p=>p.scheduledAt=NOW,p=>{p.scheduledAt='2099-11-01T09:00:01.000Z';p.variants[0].scheduledAt=p.scheduledAt;}]){
 const state=fixture();change(state.posts[2]);const before=structuredClone(state);assert.throws(()=>shift(state));assert.deepEqual(state,before);
 }
});
test('fixed collisions and minimum gaps checked against final state only',()=>{
 const source=fixture();at(source.posts[0],'2099-11-01T10:00');at(source.posts[2],'2099-11-03T10:00');assert.equal(shift(source).entries.length,2);
 for(const time of ['10:00','10:29']){const state=structuredClone(source);at(state.posts[1],`2099-11-05T${time}`);assert.throws(()=>shift(state),e=>e.code==='SLOT_TAKEN');}
 const exactGap=structuredClone(source);at(exactGap.posts[1],'2099-11-05T10:30');assert.equal(shift(exactGap).entries.length,2);
});
test('queue reservation retained and collision prevents the entire shift',()=>{
 const state=fixture();state.posts[1].stage='draft';state.posts[1].scheduledAt=null;state.posts[1].variants[0].status='draft';state.posts[1].variants[0].scheduledAt=null;
 const queued=prepareDraftBatch(state,{postIds:['two'],now:'2099-11-03T06:00:00.000Z'}).next;
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(queued.posts[1].scheduledAt)).replace(' ','T');
 at(queued.posts[0],local.replace('2099-11-03','2099-11-01'));const before=structuredClone(queued);assert.throws(()=>shift(queued),e=>e.code==='SLOT_TAKEN');assert.deepEqual(queued,before);
});
for(const [name,factory] of [['server',serverStore],['browser',browserStore]])test(`${name} single atomic save retains canonical data and media`,async t=>{
 const s=await setup(t,factory,{media:true}),p=preview(s),before=structuredClone(s.canonical),ui=structuredClone(s.ui);assert.deepEqual(s.calls,[]);await s.store.shiftDates(s.ui,p);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(s.ui,ui);
 const after=await s.client.load();for(const old of before.posts){const entry=p.entries.find(e=>e.postId===old.id);assert.deepEqual(stable(after.posts.find(x=>x.id===old.id)),entry?{...stable(old),scheduledAt:entry.to.instant,variants:[{...old.variants[0],scheduledAt:entry.to.instant}]}:stable(old));}assert.deepEqual(after.media,before.media);assert.deepEqual(after.channels,before.channels);assert.deepEqual(after.settings,before.settings);
});
test('elapsed negative-shift destination rejects even while original remains future',async t=>{
 const s=await setup(t),p=s.store.previewDateShift(s.ui,{postIds:['one','three'],days:-2});t.mock.timers.enable({apis:['Date'],now:Date.parse(p.entries[0].to.instant)});await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='PAST_TIME');assert.deepEqual(s.calls,[]);
});
test('partial-success receipt never confirms or permits another mutation',async t=>{
 const s=await setup(t),p=preview(s);s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;const receipt=await response.json();receipt.posts.find(x=>x.id==='three').scheduledAt=s.canonical.posts.find(x=>x.id==='three').scheduledAt;return Response.json(receipt);});
 await assert.rejects(s.store.shiftDates(s.ui,p),e=>e.code==='INVALID_RESPONSE');assert.throws(()=>s.store.previewQueueSwap(s.ui,{postIds:['one','three'],channelId:'bluesky'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
});
