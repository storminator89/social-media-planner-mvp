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
for(const [label,factory] of [['server',serverStore],['browser',browserStore]]){
 test(label+': archive retains canonical history, media and variants; copy uses fresh identities and no delivery state',async t=>{
  const s=await seeded(t,factory,{count:3,media:true,rich:true});
  const before=await s.client.load();const result=await s.store.archiveAction(s.ui,{postId:'fold',action:'archive'});const ui=normalizeState(result.state);
  assert.equal(ui.posts.find(p=>p.id==='fold').status,'archived');assert.equal(ui.posts.find(p=>p.id==='fold').scheduledAt,null);
  const archived=(await s.client.load()).posts.find(p=>p.id==='fold');assert.deepEqual(stable(archived),{...stable(before.posts.find(p=>p.id==='fold')),stage:'archived',scheduleBinding:null});
  const copy=await s.store.archiveAction(ui,{postId:'fold',action:'copy'});const canonical=await s.client.load();const fresh=canonical.posts.find(p=>p.id===copy.copyId);
  assert.equal(fresh.stage,'draft');assert.equal(fresh.scheduledAt,null);assert.equal(fresh.scheduleBinding,null);assert.notEqual(fresh.id,archived.id);
  assert.deepEqual(stable(canonical.posts.find(p=>p.id==='fold')),stable(archived));
  fresh.variants.forEach((v,i)=>{assert.notEqual(v.id,archived.variants[i].id);assert.equal(v.scheduledAt,null);assert.equal(v.publishedAt,null);assert.equal(v.publishedUrl,null);assert.equal(v.status,'draft');assert.deepEqual(v.mediaIds,archived.variants[i].mediaIds);assert.equal(v.body,archived.variants[i].body);});
  const archiveSource=await s.store.archiveAction(copy.state,{postId:'source',action:'archive'});const source=(await s.client.load()).posts.find(p=>p.id==='source');
  assert.deepEqual(source.variants,before.posts.find(p=>p.id==='source').variants);
  const sourceCopy=await s.store.archiveAction(archiveSource.state,{postId:'source',action:'copy'});assert.equal(sourceCopy.state.posts.find(p=>p.id===sourceCopy.copyId).mediaItems.length,2);
 });
 test(label+': generic save preserves archive and blocks removal, edits, implicit unarchive and forged archive',async t=>{
  const s=await seeded(t,factory);let {state:ui}=await s.store.archiveAction(s.ui,{postId:'source',action:'archive'});const before=(await s.client.load()).posts[0];
  for(const mutate of [u=>u.posts.splice(0,1),u=>u.posts[0].text='changed',u=>u.posts[0].status='draft',u=>u.posts.push({...u.posts[0],id:'forged'})]){const candidate=structuredClone(ui);mutate(candidate);await assert.rejects(s.store.save(candidate),e=>e.code==='ARCHIVE_READ_ONLY');}
  ui=await s.store.save(ui);assert.deepEqual(stable((await s.client.load()).posts[0]),stable(before));normalizeState(ui);
 });
 test(label+': archived richer unsupported variants fail closed',async t=>{
  const s=await seeded(t,factory);const canonical=await s.client.load();canonical.posts[0].stage='archived';canonical.posts[0].variants[0].format='story';await s.client.save(canonical);await assert.rejects(s.store.load(),e=>e.code==='UI_SCHEMA_UNSUPPORTED');
 });
}
test('archive releases queue occupancy but preserves original scheduled history',async t=>{
 const s=await seeded(t,serverStore,{rich:true});const before=await s.client.load(),bound=before.posts.find(p=>p.id==='bound');
 const result=await s.store.archiveAction(s.ui,{postId:'bound',action:'archive'});const after=await s.client.load(),archive=after.posts.find(p=>p.id==='bound');
 assert.equal(archive.scheduleBinding,null);assert.equal(archive.scheduledAt,bound.scheduledAt);assert.deepEqual(archive.variants,bound.variants);
 const proposal=findNextPostingSlots(after,{postId:'another',channelIds:['instagram'],after:NOW});assert.equal(proposal.suggestions[0].instant,bound.scheduledAt);
});
test('unknown committed archive copy blocks all repeats and saves until explicit reload',async t=>{
 const s=await seeded(t);const {state:ui}=await s.store.archiveAction(s.ui,{postId:'source',action:'archive'});let writes=0;
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method==='PUT'){writes++;throw Error('lost receipt');}return response;});
 await assert.rejects(s.store.archiveAction(ui,{postId:'source',action:'copy'}));await assert.rejects(s.store.archiveAction(ui,{postId:'source',action:'copy'}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(writes,1);
 s.intercept(null);const loaded=await s.store.load();assert.equal(loaded.posts.length,2);assert.equal(loaded.posts.filter(p=>p.status==='draft').length,1);
});
test('altered receipt blocks write retries without updating private snapshot',async t=>{
 const s=await seeded(t);s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;const body=await response.json();body.posts[0].variants[0].statusNote='lost';return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});});
 await assert.rejects(s.store.archiveAction(s.ui,{postId:'source',action:'archive'}),e=>e.code==='INVALID_RESPONSE');assert.equal(s.store.plannerRevision,s.ui.revision);await assert.rejects(s.store.archiveAction(s.ui,{postId:'source',action:'archive'}),e=>e.code==='RELOAD_REQUIRED');
});
test('CAS rejects stale tabs, invalid actions and dirty snapshots',async t=>{
 const s=await seeded(t);const other=serverStore({client:s.client,timezone:'Europe/Berlin',channels:CHANNELS});const old=await other.load();
 await assert.rejects(s.store.archiveAction({...s.ui,revision:0},{postId:'source',action:'archive'}),e=>e.code==='REVISION_CONFLICT');const dirty=structuredClone(s.ui);dirty.posts[0].text+='x';await assert.rejects(s.store.archiveAction(dirty,{postId:'source',action:'archive'}),e=>e.code==='ARCHIVE_STATE_CHANGED');await assert.rejects(s.store.archiveAction(s.ui,{postId:'source',action:'copy'}),e=>e.code==='ARCHIVE_NOT_ALLOWED');
 await s.store.archiveAction(s.ui,{postId:'source',action:'archive'});await assert.rejects(other.save(old),e=>e.status===409);
});
test('pending archive serializes double clicks, reads and ordinary writes',async t=>{
 const s=await seeded(t);let release;const gate=new Promise(r=>release=r);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await gate;return fetch(path,options);});const pending=s.store.archiveAction(s.ui,{postId:'source',action:'archive'});
 await assert.rejects(s.store.archiveAction(s.ui,{postId:'source',action:'archive'}),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');release();await pending;
});
test('copy respects total post limit including archive, while archive remains available at limit',async t=>{
 const s=await seeded(t,serverStore,{count:1});let state=await s.client.load();state.posts=Array.from({length:100},(_,i)=>({...draft('p'+i),variants:[{...variant('v'+i,'instagram','text'),timezone:'Asia/Kathmandu'}]}));await s.client.save(state);let ui=await s.store.load();({state:ui}=await s.store.archiveAction(ui,{postId:'p0',action:'archive'}));const count=s.calls.length;await assert.rejects(s.store.archiveAction(ui,{postId:'p0',action:'copy'}),e=>e.code==='ARCHIVE_LIMIT');assert.equal(s.calls.length,count);
});
test('uncertain archive reload refuses malformed canonical hidden metadata and stays fenced',async t=>{
 const s=await seeded(t);s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method==='PUT')throw Error('lost');return response;});await assert.rejects(s.store.archiveAction(s.ui,{postId:'source',action:'archive'}));
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);const state=await response.json();state.posts[0].variants[0].statusNote=17;return new Response(JSON.stringify(state),{headers:{'Content-Type':'application/json'}});});await assert.rejects(s.store.load());await assert.rejects(s.store.archiveAction(s.ui,{postId:'source',action:'archive'}),e=>e.code==='RELOAD_REQUIRED');s.intercept(null);assert.equal((await s.store.load()).posts[0].status,'archived');
});
