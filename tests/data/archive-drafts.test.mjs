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

async function batchSeed(t,factory=serverStore){
 const s=await seeded(t,factory,{media:true,rich:true});const state=await s.client.load(),source=state.posts.find(p=>p.id==='source'),ids=source.variants[0].mediaIds;
 source.variants.find(v=>v.channelId==='instagram').mediaIds=[];source.variants.find(v=>v.channelId==='linkedin').mediaIds=[...ids].reverse();
 state.posts.push({...draft('empty'),title:'',body:'',variants:[]},{...draft('untouched'),variants:[variant('untouched-v','linkedin','Do not change')]},{...draft('idea'),stage:'idea',variants:[],cover:null});
 await s.client.save(state);s.ui=normalizeState(await s.store.load());s.canonical=await s.client.load();s.calls.length=0;return s;
}
const receipt=state=>({...state,posts:state.posts.map(stable),updatedAt:null,revision:0});
const code=name=>error=>error.code===name;
for(const [label,factory] of [['server',serverStore],['browser',browserStore]]){
 test(label+': complete canonical batch preview and exactly selected stage changes in one CAS, without projections/uploads',async t=>{
  const s=await batchSeed(t,factory),before=s.canonical,p=s.store.previewArchiveDrafts(s.ui,{postIds:['empty','source']});
  assert.deepEqual(p.entries.map(e=>e.postId),['empty','source']);assert.deepEqual(p.entries[0].channels,[]);assert.equal(p.entries[1].channels.find(c=>c.channelId==='linkedin').text,'');
  for(const entry of p.entries)for(const c of entry.channels){const v=before.posts.find(x=>x.id===entry.postId).variants.find(v=>v.channelId===c.channelId);assert.equal(c.text,v.body);assert.equal(c.inheritsBody,v.inheritsBody);assert.deepEqual(c.mediaItems.map(m=>m.id),v.mediaIds);}
  assert.equal(s.calls.length,0);const result=await s.store.archiveDrafts(s.ui,p);assert.equal(result.revision,s.ui.revision+1);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);
  const after=await s.client.load(),expected=structuredClone(before);expected.posts.forEach(p=>{if(['empty','source'].includes(p.id))p.stage='archived';});assert.deepEqual(receipt(after),receipt(expected));assert.equal(after.media.length,before.media.length);
 });
 test(label+': selected-only draft eligibility, duplicate/empty IDs, dirty and stale inputs all reject before writes',async t=>{
  const s=await batchSeed(t,factory);
  for(const postIds of [[],['source','source'],['source','missing'],['source','idea'],['source','bound'],[1],Array(101).fill('source')])assert.throws(()=>s.store.previewArchiveDrafts(s.ui,{postIds}));
  assert.throws(()=>s.store.previewArchiveDrafts({...s.ui,revision:0},{postIds:['source']}),code('REVISION_CONFLICT'));
  const dirty=structuredClone(s.ui);dirty.posts[0].title+='!';assert.throws(()=>s.store.previewArchiveDrafts(dirty,{postIds:['source']}),code('ARCHIVE_STATE_CHANGED'));assert.equal(s.calls.length,0);
 });
 test(label+': cancelled, modified and consumed previews cannot persist or be replayed',async t=>{
  const s=await batchSeed(t,factory),preview=()=>s.store.previewArchiveDrafts(s.ui,{postIds:['source','empty']});let p=preview();s.store.cancelArchiveDrafts(p);await assert.rejects(s.store.archiveDrafts(s.ui,p),code('ARCHIVE_PREVIEW_CHANGED'));p=preview();p.entries.reverse();await assert.rejects(s.store.archiveDrafts(s.ui,p),code('ARCHIVE_PREVIEW_CHANGED'));
  p=preview();const dirty=structuredClone(s.ui);dirty.posts[0].text+='!';await assert.rejects(s.store.archiveDrafts(dirty,p),code('ARCHIVE_STATE_CHANGED'));await assert.rejects(s.store.archiveDrafts(s.ui,p),code('ARCHIVE_PREVIEW_CHANGED'));assert.equal(s.calls.length,0);
  p=preview();const out=await s.store.archiveDrafts(s.ui,p);await assert.rejects(s.store.archiveDrafts(out,p),code('ARCHIVE_PREVIEW_CHANGED'));assert.equal(s.calls.length,1);
 });
 test(label+': stale remote revision rejects the entire batch; no partial selected state',async t=>{
  const s=await batchSeed(t,factory),p=s.store.previewArchiveDrafts(s.ui,{postIds:['source','empty']}),other=await s.client.load();other.posts.find(p=>p.id==='untouched').title='Remote title';await s.client.save(other);const before=await s.client.load();await assert.rejects(s.store.archiveDrafts(s.ui,p),code('REVISION_CONFLICT'));assert.deepEqual(await s.client.load(),before);assert.equal(s.store.mutationRequiresReload,false);
 });
 test(label+': pending one-CAS write serializes doubleclick, load, preview, ordinary save and archive actions',async t=>{
  const s=await batchSeed(t,factory),p=s.store.previewArchiveDrafts(s.ui,{postIds:['source','empty']});let release;const gate=new Promise(r=>release=r);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await gate;return fetch(path,options);});const pending=s.store.archiveDrafts(s.ui,p);
  for(const act of [()=>s.store.archiveDrafts(s.ui,p),()=>s.store.archiveAction(s.ui,{postId:'source',action:'archive'}),()=>s.store.save(s.ui),()=>s.store.load()])await assert.rejects(act,code('BUSY'));assert.throws(()=>s.store.previewArchiveDrafts(s.ui,{postIds:['source']}),code('BUSY'));s.store.cancelArchiveDrafts(p);assert.equal(s.calls.length,1);release();await pending;
 });
 test(label+': lost committed receipt fences every planner mutation; canonical-only reload clears it',async t=>{
  const s=await batchSeed(t,factory),p=s.store.previewArchiveDrafts(s.ui,{postIds:['source','empty']});s.intercept(async(path,options,fetch)=>{const reply=await fetch(path,options);if(options.method==='PUT')throw Error('lost');return reply;});await assert.rejects(s.store.archiveDrafts(s.ui,p));assert.equal(s.store.mutationRequiresReload,true);assert.equal(s.store.plannerRevision,s.ui.revision);
  const methods=['archiveDrafts','archiveAction','changeChannelMedia','splitDraft','scheduleDraftBatch','applyDraftLabels','applyDraftReplace','prioritizeQueue','shiftDates','swapQueue','returnDrafts','reflowQueue','save','previewArchiveDrafts','previewDraftBatch','previewDraftLabels','previewDraftReplace','previewQueuePriority','previewDateShift','previewQueueSwap','previewReturnDrafts','previewQueueReflow'];
  for(const method of methods)await assert.rejects(async()=>s.store[method](s.ui,{}),code('RELOAD_REQUIRED'));assert.equal(s.calls.length,1);
  s.intercept(async(path,options,fetch)=>{const reply=await fetch(path,options),body=await reply.json();body.posts.find(p=>p.id==='source').variants[0].statusNote=17;return Response.json(body);});await assert.rejects(s.store.load());assert.equal(s.store.mutationRequiresReload,true);
  s.intercept(null);const loaded=await s.store.load();assert.equal(s.store.mutationRequiresReload,false);assert.equal(loaded.posts.filter(p=>p.status==='archived').length,2);assert.equal(loaded.revision,s.ui.revision+1);
 });
}
for(const [name,alter] of [
 ['wrong revision',s=>s.revision++],['partial selected',s=>s.posts.find(p=>p.id==='empty').stage='draft'],['missing post',s=>s.posts.pop()],['hidden note',s=>s.posts.find(p=>p.id==='source').variants[0].statusNote='different'],['empty override',s=>s.posts.find(p=>p.id==='source').variants.find(v=>v.channelId==='linkedin').body='different'],['media order',s=>s.posts.find(p=>p.id==='source').variants.find(v=>v.channelId==='linkedin').mediaIds.reverse()],['media metadata',s=>s.media[0].altText+='!'],['unrelated fold timestamp',s=>s.posts.find(p=>p.id==='fold').scheduledAt='2026-10-25T01:30:00.000Z'],['unrelated settings',s=>s.settings.locale='en-GB'],['missing timestamp',s=>delete s.posts[0].createdAt],['malformed bookkeeping',s=>s.posts[0].updatedAt='bad'],['extra hidden field',s=>s.posts[0].extra='bad']]){
 test('full receipt rejects '+name+' and retains global fence',async t=>{const s=await batchSeed(t),p=s.store.previewArchiveDrafts(s.ui,{postIds:['source','empty']});s.intercept(async(path,options,fetch)=>{const reply=await fetch(path,options);if(options.method!=='PUT')return reply;const body=await reply.json();alter(body);return Response.json(body);});await assert.rejects(s.store.archiveDrafts(s.ui,p),code('INVALID_RESPONSE'));assert.equal(s.store.mutationRequiresReload,true);assert.equal(s.store.plannerRevision,s.ui.revision);assert.equal(s.calls.length,1);});
}
test('100 stored posts including archive remain counted; all 100 drafts may be archived but no copy slot is created',async t=>{
 const s=await seeded(t),canonical=await s.client.load();canonical.posts=Array.from({length:100},(_,i)=>({...draft('p'+i),variants:[]}));await s.client.save(canonical);const ui=await s.store.load(),p=s.store.previewArchiveDrafts(ui,{postIds:ui.posts.map(p=>p.id)}),result=await s.store.archiveDrafts(ui,p);assert.equal(result.posts.length,100);assert.equal(result.posts.filter(p=>p.status==='archived').length,100);await assert.rejects(s.store.archiveAction(result,{postId:'p0',action:'copy'}),code('ARCHIVE_LIMIT'));
});

test('lost receipt reload refuses malformed bookkeeping until a fully validated snapshot is read',async t=>{
 for(const malformed of [s=>s.posts[0].updatedAt=42,s=>delete s.posts[0].updatedAt,s=>s.updatedAt='bad',s=>s.posts[0].updatedAt='2000-01-01T00:00:00.000Z']){
  const s=await batchSeed(t),preview=s.store.previewArchiveDrafts(s.ui,{postIds:['source','empty']});s.intercept(async(path,options,fetch)=>{const reply=await fetch(path,options);if(options.method==='PUT')throw Error('lost');return reply;});await assert.rejects(s.store.archiveDrafts(s.ui,preview));
  s.intercept(async(path,options,fetch)=>{const reply=await fetch(path,options),body=await reply.json();malformed(body);return Response.json(body);});await assert.rejects(s.store.load());assert.equal(s.store.mutationRequiresReload,true);await assert.rejects(s.store.save(s.ui),code('RELOAD_REQUIRED'));
  s.intercept(null);await s.store.load();assert.equal(s.store.mutationRequiresReload,false);
 }
});
