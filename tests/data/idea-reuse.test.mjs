import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const code=name=>error=>error.code===name;
const stable=post=>{const value=structuredClone(post);delete value.updatedAt;return value;};
const idea=()=>({id:'idea',title:'  Titel <b> & 🐕\r\n',body:'  Text\r\n👩‍💻\n',tags:[' Label ','A\r\nB','Label','Label','e\u0301','é'],stage:'idea',scheduledAt:null,scheduleBinding:null,timezone:'Asia/Kathmandu',cover:null,createdAt:'2025-01-02T03:04:05.678Z',variants:[]});
async function seed(t,factory=serverStore,patch={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];let intercept=null;t.after(()=>env.DB.sql.close());
 const fetcher=async(path,options={})=>handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:async(path,options={})=>{calls.push([options.method||'GET',path]);return intercept?intercept(path,options,fetcher):fetcher(path,options);}});
 const channels=CHANNELS.map(c=>({id:c.id,platform:c.id,name:c.name,handle:'',color:c.color,enabled:true,connectionStatus:'manual',postingSchedule:null}));
 const other={...idea(),id:'other',stage:'planned',title:'Leave unchanged',body:'Other',tags:[' other '],scheduledAt:'2026-10-25T01:30:17.123Z',timezone:'Europe/Berlin',variants:[{id:'other-v',channelId:'linkedin',body:'',inheritsBody:false,status:'planned',format:'post',scheduledAt:'2026-10-25T01:30:17.123Z',timezone:'Europe/Berlin',mediaIds:[],statusNote:'exact hidden note\r\n',publishedAt:null,publishedUrl:null}]};
 await client.save({schemaVersion:3,revision:0,settings:{timezone:'Europe/Berlin',locale:'en-GB'},channels,posts:[{...idea(),...patch},other]});
 const store=factory({client,timezone:'Europe/Berlin',channels:CHANNELS}),ui=await store.load(),canonical=await client.load();calls.length=0;
 return {env,client,store,ui,canonical,calls,intercept:fn=>intercept=fn};
}
const methods=['reuseIdea','archiveDrafts','archiveAction','changeChannelMedia','splitDraft','scheduleDraftBatch','applyDraftLabels','applyDraftReplace','prioritizeQueue','shiftDates','swapQueue','returnDrafts','reflowQueue','save','previewArchiveDrafts','previewDraftBatch','previewDraftLabels','previewDraftReplace','previewQueuePriority','previewDateShift','previewQueueSwap','previewReturnDrafts','previewQueueReflow'];
for(const [label,factory] of [['server',serverStore],['browser',browserStore]]){
 test(label+': exact source remains and fresh channel-less draft is saved in one canonical CAS',async t=>{
  const s=await seed(t,factory),before=structuredClone(s.canonical),started=Date.now(),out=await s.store.reuseIdea(s.ui,{postId:'idea'});
  assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.equal(out.state.revision,s.ui.revision+1);assert.notEqual(out.copyId,'idea');assert.equal(out.state.posts.length,3);
  const after=await s.client.load(),copy=after.posts.find(p=>p.id===out.copyId),source=before.posts.find(p=>p.id==='idea');
  for(const old of before.posts)assert.deepEqual(stable(after.posts.find(p=>p.id===old.id)),stable(old));
  assert.deepEqual(stable(copy),{...stable(source),id:out.copyId,stage:'draft',createdAt:copy.createdAt});
  assert.ok(Date.parse(copy.createdAt)>=started);assert.notEqual(copy.updatedAt,source.updatedAt);assert.deepEqual(copy.variants,[]);assert.equal(copy.scheduledAt,null);assert.equal(copy.scheduleBinding,null);
  assert.deepEqual(after.channels,before.channels);assert.deepEqual(after.settings,before.settings);assert.deepEqual(after.media,before.media);
  const again=await s.store.reuseIdea(out.state,{postId:'idea'});assert.notEqual(again.copyId,out.copyId);assert.equal(again.state.posts.filter(p=>p.status==='idea').length,1);
 });
 test(label+': title-only idea is copied without synthesizing text or channels',async t=>{
  const s=await seed(t,factory,{body:''}),out=await s.store.reuseIdea(s.ui,{postId:'idea'}),copy=out.state.posts.find(p=>p.id===out.copyId);assert.equal(copy.text,'');assert.equal(copy.title,idea().title);assert.deepEqual(copy.channels,[]);
 });
 test(label+': missing/nonidea/dirty/stale source and 100-post quota reject before write',async t=>{
  const s=await seed(t,factory);for(const postId of ['missing','other',null])await assert.rejects(s.store.reuseIdea(s.ui,{postId}),code('IDEA_REQUIRED'));
  await assert.rejects(s.store.reuseIdea({...s.ui,revision:0},{postId:'idea'}),code('REVISION_CONFLICT'));
  const dirty=structuredClone(s.ui);dirty.posts.find(p=>p.id==='idea').text+='unsaved';await assert.rejects(s.store.reuseIdea(dirty,{postId:'idea'}),code('IDEA_STATE_CHANGED'));assert.equal(s.calls.length,0);
  const state=await s.client.load();state.posts=Array.from({length:100},(_,i)=>({...idea(),id:i?'archived-'+i:'idea',stage:i?'archived':'idea'}));await s.client.save(state);const ui=await s.store.load();s.calls.length=0;await assert.rejects(s.store.reuseIdea(ui,{postId:'idea'}),code('IDEA_LIMIT'));assert.equal(s.calls.length,0);
 });
 test(label+': source cover or empty content is refused rather than rewritten',async t=>{
  for(const patch of [{cover:'studio'},{title:'',body:''}]){const s=await seed(t,factory,patch);await assert.rejects(s.store.reuseIdea(s.ui,{postId:'idea'}),code('IDEA_REQUIRED'));assert.equal(s.calls.length,0);}
 });
 test(label+': remote source change rejects CAS without consuming original or creating draft',async t=>{
  const s=await seed(t,factory),other=await s.client.load();other.posts.find(p=>p.id==='idea').body='Newer source';await s.client.save(other);const before=await s.client.load();s.calls.length=0;
  await assert.rejects(s.store.reuseIdea(s.ui,{postId:'idea'}),code('REVISION_CONFLICT'));assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),before);assert.equal(s.store.mutationRequiresReload,false);
 });
 test(label+': duplicate click and every concurrent mutation is serialized, no extra write',async t=>{
  const s=await seed(t,factory);let release;const gate=new Promise(r=>release=r);s.intercept(async(path,options,fetcher)=>{if(options.method==='PUT')await gate;return fetcher(path,options);});const pending=s.store.reuseIdea(s.ui,{postId:'idea'});
  await assert.rejects(s.store.reuseIdea(s.ui,{postId:'idea'}),code('BUSY'));await assert.rejects(s.store.load(),code('BUSY'));await assert.rejects(s.store.save(s.ui),code('BUSY'));assert.equal(s.calls.length,1);release();await pending;
 });
 test(label+': committed lost reply fences every mutation until fully verified reload',async t=>{
  const s=await seed(t,factory);s.intercept(async(path,options,fetcher)=>{const reply=await fetcher(path,options);if(options.method==='PUT')throw Error('Lost receipt');return reply;});await assert.rejects(s.store.reuseIdea(s.ui,{postId:'idea'}));assert.equal(s.store.mutationRequiresReload,true);assert.equal(s.store.plannerRevision,s.ui.revision);
  for(const method of methods)await assert.rejects(async()=>s.store[method](s.ui,{}),code('RELOAD_REQUIRED'));assert.equal(s.calls.length,1);
  s.intercept(async(path,options,fetcher)=>{const r=await fetcher(path,options),body=await r.json();delete body.posts[0].updatedAt;return Response.json(body);});await assert.rejects(s.store.load());assert.equal(s.store.mutationRequiresReload,true);
  s.intercept(null);const loaded=await s.store.load();assert.equal(s.store.mutationRequiresReload,false);assert.equal(loaded.posts.length,3);assert.equal(loaded.posts.filter(p=>p.status==='idea').length,1);
 });
}
for(const [label,alter] of [
 ['revision',s=>s.revision++],['missing new draft',s=>s.posts=s.posts.filter(p=>['idea','other'].includes(p.id))],['consumed source',s=>s.posts.find(p=>p.id==='idea').stage='draft'],['title',s=>s.posts.find(p=>!['idea','other'].includes(p.id)).title='normalized'],['tags',s=>s.posts.find(p=>!['idea','other'].includes(p.id)).tags.reverse()],['creation time',s=>s.posts.find(p=>!['idea','other'].includes(p.id)).createdAt=idea().createdAt],['source text',s=>s.posts.find(p=>p.id==='idea').body='changed'],['unrelated hidden note',s=>s.posts.find(p=>p.id==='other').variants[0].statusNote+='!'],['unrelated scheduled milliseconds',s=>s.posts.find(p=>p.id==='other').scheduledAt='2026-10-25T01:30:00.000Z'],['channel settings',s=>s.channels[0].enabled=false],['locale',s=>s.settings.locale='de-DE'],['bookkeeping',s=>s.posts[0].updatedAt='bad'],['hidden field',s=>s.posts[0].surprise='bad'],['missing title',s=>delete s.posts[0].title],['malformed collections',s=>s.posts=null]
])test('exact full receipt refuses '+label,async t=>{
 const s=await seed(t);s.intercept(async(path,options,fetcher)=>{const reply=await fetcher(path,options);if(options.method!=='PUT')return reply;const body=await reply.json();alter(body);return Response.json(body);});await assert.rejects(s.store.reuseIdea(s.ui,{postId:'idea'}),code('INVALID_RESPONSE'));assert.equal(s.store.mutationRequiresReload,true);assert.equal(s.store.plannerRevision,s.ui.revision);assert.equal(s.calls.length,1);
});
test('invalid source bookkeeping fails locally, without canonicalizing hidden data away',async t=>{
 const s=await seed(t);s.intercept(async(path,options,fetcher)=>{const reply=await fetcher(path,options),body=await reply.json();body.posts[0].updatedAt='bad';return Response.json(body);});const ui=await s.store.load();s.calls.length=0;await assert.rejects(s.store.reuseIdea(ui,{postId:'idea'}),code('IDEA_STATE_CHANGED'));assert.equal(s.calls.length,0);
});
