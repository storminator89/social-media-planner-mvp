import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {findNextPostingSlots,selectPostingSlot} from '../../modules/workflows/posting-schedules.mjs';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const NOW='2099-10-01T00:00:00.000Z';
const definitions=CHANNELS.map(c=>({id:c.id,platform:c.id,name:c.name,handle:'',color:c.color,enabled:true,connectionStatus:'manual',postingSchedule:null}));
const rules=(time='02:30',overlapChoice='later')=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:30,overlapChoice,slots:[{id:'sunday',weekday:0,time}]});
const variant=(id,channelId,body,inheritsBody=false)=>({id,channelId,body,inheritsBody,format:'post',status:'draft',statusNote:`Notiz ${channelId} 👩‍💻\r\n`,scheduledAt:null,timezone:'Asia/Kathmandu',publishedAt:null,publishedUrl:null,mediaIds:[]});
const draft=(id='source')=>({id,title:'Titel <b> & 🐕',body:'Basis\r\n👩‍💻',tags:[' Label ','A\r\nB','Label','Label','e\u0301','é'],stage:'draft',scheduledAt:null,scheduleBinding:null,timezone:'Asia/Kathmandu',cover:'studio',createdAt:'2025-01-02T03:04:05.678Z',variants:[variant('z-instagram','instagram','Basis\r\n👩‍💻',true),variant('a-linkedin','linkedin',''),variant('b-bluesky','bluesky','Eigener Text'),variant('c-mastodon','mastodon','Basis\r\n👩‍💻')]});
const stable=post=>{const copy=structuredClone(post);delete copy.updatedAt;return copy;};
function setup(t,factory=serverStore){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];let intercept=null;t.after(()=>env.DB.sql.close());
 const realFetch=async(path,options={})=>handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:async(path,options={})=>{calls.push([options.method||'GET',path]);return intercept?intercept(path,options,realFetch):realFetch(path,options);}});
 return {env,client,calls,intercept:fn=>{intercept=fn;},store:factory({client,timezone:'Europe/Berlin',channels:CHANNELS})};
}
async function seeded(t,factory=serverStore,{count=4,media=false,rich=false}={}){
 const s=setup(t,factory);let state={schemaVersion:3,revision:0,settings:{timezone:'Europe/Berlin',locale:'de-DE'},channels:structuredClone(definitions),posts:[]};
 if(rich){state.channels.find(c=>c.id==='instagram').postingSchedule=rules();state.channels.find(c=>c.id==='linkedin').postingSchedule=rules('03:30');}
 state=await s.client.save(state);const source=draft();source.variants=source.variants.slice(0,count);
 if(media){const jpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217]);const m=await s.client.uploadMedia(new File([jpeg],'unchanged.jpg',{type:'image/jpeg'}),'Exact alt & 🐕');const second=await s.client.uploadMedia(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,0,0,255,217])],'second.jpg',{type:'image/jpeg'}),'Second ordered alt');source.variants.forEach(v=>v.mediaIds=[m.id,second.id]);}
 state.posts=[source];
 if(rich){
  const proposal=findNextPostingSlots(state,{postId:'bound',channelIds:['instagram'],after:NOW});
  const chosen=selectPostingSlot(state,proposal,proposal.suggestions[0],{now:NOW});
  const bound={...draft('bound'),stage:'planned',scheduledAt:chosen.scheduledAt,timezone:chosen.timezone,scheduleBinding:chosen.scheduleBinding,variants:[{...variant('bound-v','instagram','Unrelated bound'),status:'planned',scheduledAt:chosen.scheduledAt,timezone:chosen.timezone}]};
  const fold={...draft('fold'),stage:'planned',scheduledAt:'2026-10-25T01:30:17.123Z',timezone:'Europe/Berlin',variants:[{...variant('fold-v','bluesky','Unrelated folded time'),status:'planned',scheduledAt:'2026-10-25T01:30:17.123Z',timezone:'Europe/Berlin'}]};
  state.posts.push(bound,fold);
 }
 await s.client.save(state);s.ui=normalizeState(await s.store.load());s.canonical=await s.client.load();s.calls.length=0;return s;
}
for(const [label,factory] of [['server',serverStore],['browser',browserStore]])for(const count of [2,4])test(`${label}: canonical ${count}-channel split atomically preserves IDs, metadata, JPEG and unrelated folded/bound schedules`,async t=>{
 const {store,client,calls,ui,canonical,env}=await seeded(t,factory,{count,media:true,rich:true});const held=structuredClone(ui),mediaBefore=structuredClone([...env.BUCKET.data]);
 const result=await store.splitDraft(ui,{postId:'source'});assert.equal(calls.length,1);assert.deepEqual(calls[0],['PUT','/api/planner/state']);assert.deepEqual(ui,held);assert.equal(result.revision,canonical.revision+1);
 const after=await client.load(),source=canonical.posts.find(p=>p.id==='source'),pieces=after.posts.filter(p=>!['bound','fold'].includes(p.id));
 assert.equal(pieces.length,count);assert.equal(new Set(after.posts.map(p=>p.id)).size,after.posts.length);assert.equal(after.posts.find(p=>p.id==='source').variants[0].id,source.variants[0].id);
 for(const piece of pieces){assert.equal(piece.variants.length,1);assert.deepEqual(stable(piece),{...stable(source),id:piece.id,variants:[source.variants.find(v=>v.id===piece.variants[0].id)]});assert.equal(piece.scheduledAt,null);assert.equal(piece.scheduleBinding,null);}
 for(const id of ['bound','fold'])assert.deepEqual(stable(after.posts.find(p=>p.id===id)),stable(canonical.posts.find(p=>p.id===id)));
 assert.deepEqual(after.channels,canonical.channels);assert.deepEqual(after.settings,canonical.settings);assert.deepEqual(after.media,canonical.media);assert.deepEqual([...env.BUCKET.data],mediaBefore);
 assert.equal(result.posts.find(p=>p.channels.includes('linkedin')&&p.id!=='bound').variantTexts.linkedin,'');
 assert.deepEqual(env.DB.sql.prepare('SELECT id,post_id FROM planner_variants WHERE owner_id=? ORDER BY id').all('alice').map(v=>v.id),canonical.posts.flatMap(p=>p.variants.map(v=>v.id)).sort());
});

test('guard rejects local edits, reordering, unknown target and stale revision without a write',async t=>{
 const s=await seeded(t);for(const mutate of [x=>x.posts[0].text+=' changed',x=>x.posts[0].tags.reverse(),x=>x.posts[0].channels.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.linkedin='new',x=>x.posts[0].media={dataUrl:'data:image/jpeg;base64,/9j/'}]){const changed=structuredClone(s.ui);mutate(changed);await assert.rejects(s.store.splitDraft(changed,{postId:'source'}),e=>e.code==='SPLIT_STATE_CHANGED');}
 await assert.rejects(s.store.splitDraft(s.ui,{postId:'unknown'}),e=>e.code==='SPLIT_NOT_ALLOWED');await assert.rejects(s.store.splitDraft({...s.ui,revision:0},{postId:'source'}),e=>e.code==='REVISION_CONFLICT');assert.equal(s.calls.length,0);
});
for(const kind of ['single','idea','scheduled'])test(`guard rejects ${kind} source with no write`,async t=>{
 const s=await seeded(t,serverStore,{count:kind==='single'?1:2});if(kind!=='single'){const data=await s.client.load(),p=data.posts[0];if(kind==='idea'){p.stage='idea';p.variants=[];}else{p.stage='planned';p.scheduledAt='2099-11-01T00:00:00.000Z';p.variants.forEach(v=>{v.status='planned';v.scheduledAt=p.scheduledAt;});}await s.client.save(data);s.ui=await s.store.load();}s.calls.length=0;await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.code==='SPLIT_NOT_ALLOWED');assert.equal(s.calls.length,0);
});
test('100-post quota rejects all pieces before PUT, boundary 100 succeeds',async t=>{
 const s=await seeded(t,serverStore,{count:2});let data=await s.client.load();for(let i=0;i<99;i++)data.posts.push({...draft(`filler-${i}`),variants:[]});await s.client.save(data);let ui=await s.store.load();s.calls.length=0;await assert.rejects(s.store.splitDraft(ui,{postId:'source'}),e=>e.code==='SPLIT_LIMIT');assert.equal(s.calls.length,0);
 data=await s.client.load();data.posts=data.posts.filter(p=>p.id!=='filler-98');await s.client.save(data);ui=await s.store.load();const result=await s.store.splitDraft(ui,{postId:'source'});assert.equal(result.posts.length,100);
});
test('300-variant boundary is unchanged and malformed over-limit snapshots reject before write',async t=>{
 const source=draft(),base={schemaVersion:3,revision:1,settings:{timezone:'Europe/Berlin',locale:'de-DE'},channels:structuredClone(definitions),posts:[source],media:[]};
 for(let i=0;i<74;i++)base.posts.push({...draft(`filler-${i}`),variants:draft().variants.map(v=>({...v,id:`${i}-${v.id}`}))});let writes=0;
 const client={load:async()=>structuredClone(base),save:async next=>{writes++;return {...next,revision:next.revision+1,media:[]};}};const store=serverStore({client,timezone:'Europe/Berlin',channels:CHANNELS});let ui=await store.load();await store.splitDraft(ui,{postId:'source'});assert.equal(writes,1);
 base.posts.push({...draft('too-many'),variants:[variant('overflow','instagram','Base')]});ui=await store.load();await assert.rejects(store.splitDraft(ui,{postId:'source'}),e=>e.code==='SPLIT_LIMIT');assert.equal(writes,1);
});
test('concurrent writer rejects one CAS and leaves their full state unchanged',async t=>{
 const s=await seeded(t);const other=await s.client.load();other.posts[0].body='Other writer';other.posts[0].variants.filter(v=>v.inheritsBody).forEach(v=>v.body='Other writer');await s.client.save(other);const before=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),before);assert.equal(s.store.plannerRevision,s.ui.revision);
});
test('precommit SQLite trigger rollback is all-or-nothing and uncertain HTTP failure requires reload',async t=>{
 const s=await seeded(t),before=await s.client.load();s.env.DB.sql.exec("CREATE TRIGGER reject_split BEFORE INSERT ON planner_posts WHEN NEW.id!='source' BEGIN SELECT RAISE(ABORT,'test failure'); END;");s.calls.length=0;
 await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}));await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);
 s.env.DB.sql.exec('DROP TRIGGER reject_split');const fresh=await s.store.load();assert.equal((await s.store.splitDraft(fresh,{postId:'source'})).posts.length,4);
});
for(const failure of ['lost','json','projection','metadata','extra-post','media'])test(`committed ${failure} receipt never retries or installs unconfirmed state`,async t=>{
 const s=await seeded(t,serverStore,{media:true});s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated',{status:200});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost note';else if(failure==='extra-post')body.posts.pop();else body.media[0].altText='changed';return Response.json(body);});
 const held=structuredClone(s.ui);await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}));assert.equal(s.store.plannerRevision,s.ui.revision);assert.deepEqual(s.ui,held);await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(null);const fresh=await s.store.load();assert.equal(fresh.posts.length,4);assert.equal(fresh.revision,s.ui.revision+1);await assert.rejects(s.store.splitDraft(fresh,{postId:'source'}),e=>e.code==='SPLIT_NOT_ALLOWED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('doubleclick and concurrent read/save are blocked while split is pending; newer input is untouched',async t=>{
 const s=await seeded(t);let release;const gate=new Promise(resolve=>{release=resolve;});s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await gate;return fetch(path,options);});const pending=s.store.splitDraft(s.ui,{postId:'source'});
 await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');s.ui.posts[0].text='newer unsaved typing';release();await pending;assert.equal(s.ui.posts[0].text,'newer unsaved typing');assert.equal(s.calls.length,1);
});
test('split cannot race a pending explicit load',async t=>{
 const s=await seeded(t);let release;const gate=new Promise(resolve=>{release=resolve;});s.intercept(async(path,options,fetch)=>{if(!options.method)await gate;return fetch(path,options);});const loading=s.store.load();await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.code==='BUSY');release();await loading;
});
test('subsequent independent queue scheduling preserves moved IDs and rejects DST ambiguity without a write',async t=>{
 const s=await seeded(t,serverStore,{count:2,rich:true});let ui=await s.store.splitDraft(s.ui,{postId:'source'});const pieces=ui.posts.filter(p=>p.status==='draft'),before=await s.client.load();
 for(const piece of pieces){const proposal=findNextPostingSlots(ui,{postId:piece.id,channelIds:piece.channels,after:NOW});const chosen=selectPostingSlot(ui,proposal,proposal.suggestions[0],{now:NOW});ui=await s.store.save({...ui,posts:ui.posts.map(p=>p.id===piece.id?{...p,status:'scheduled',scheduledAt:chosen.local,scheduledInstant:chosen.scheduledAt,scheduleBinding:chosen.scheduleBinding,timeZone:chosen.timezone}:p)});}
 const after=await s.client.load(),scheduled=after.posts.filter(p=>pieces.some(piece=>piece.id===p.id));assert.notEqual(scheduled[0].scheduledAt,scheduled[1].scheduledAt);for(const p of scheduled){const old=before.posts.find(x=>x.id===p.id);assert.equal(p.variants[0].id,old.variants[0].id);assert.equal(p.variants[0].statusNote,old.variants[0].statusNote);assert.equal(p.variants[0].inheritsBody,old.variants[0].inheritsBody);assert.equal(p.variants[0].body,old.variants[0].body);}
 const p=ui.posts.find(p=>p.id===pieces[0].id);s.calls.length=0;await assert.rejects(s.store.save({...ui,posts:ui.posts.map(x=>x.id===p.id?{...x,scheduledAt:'2099-10-25T02:30',timeZone:'Europe/Berlin',scheduledInstant:null,scheduleBinding:null}:x)}),e=>e.code==='DST_AMBIGUOUS');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,0);
});

test('canonical byte expansion is rejected before PUT with no partial split or media write',async t=>{
 const s=await seeded(t),data=await s.client.load(),source=data.posts[0];source.body='界'.repeat(6500);source.variants.forEach(v=>{v.body=source.body;v.inheritsBody=true;});
 const core=value=>({schemaVersion:value.schemaVersion,revision:value.revision,settings:value.settings,channels:value.channels,posts:value.posts});
 while(new TextEncoder().encode(JSON.stringify(core(data))).byteLength<1024*1024-43000){const id=`large-${data.posts.length}`;data.posts.push({...draft(id),body:'界'.repeat(6500),variants:[]});}
 assert.ok(new TextEncoder().encode(JSON.stringify(core(data))).byteLength<1024*1024);await s.client.save(core(data));const ui=await s.store.load(),before=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.splitDraft(ui,{postId:'source'}),e=>e.code==='SPLIT_LIMIT'&&e.status===413);assert.equal(s.calls.length,0);assert.deepEqual(await s.client.load(),before);assert.equal(s.env.BUCKET.data.size,0);
 // Independently verify the real API rejects the expanded UTF-8 request too.
 const original=before.posts.find(p=>p.id==='source');const expanded={...before,posts:before.posts.flatMap(p=>p.id==='source'?original.variants.map((v,i)=>({...original,id:i?`expanded-${i}`:original.id,variants:[v]})):[p])};
 await assert.rejects(s.client.save(expanded),e=>e.status===413&&e.code==='PAYLOAD_TOO_LARGE');assert.deepEqual(await s.client.load(),before);
});

test('explicit API 413 rejection remains all-or-nothing without an automatic retry',async t=>{
 const s=await seeded(t),before=await s.client.load();s.intercept(async(path,options,fetch)=>options.method==='PUT'?Response.json({error:{code:'PAYLOAD_TOO_LARGE',message:'too large'}},{status:413}):fetch(path,options));s.calls.length=0;
 await assert.rejects(s.store.splitDraft(s.ui,{postId:'source'}),e=>e.status===413);assert.equal(s.calls.length,1);assert.deepEqual(await s.client.load(),before);
});
