import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {prepareDraftLabels} from '../../modules/workflows/draft-labels.mjs';
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
test('preview rejects dirty UI and stale revision without reading, writing, resolving or uploading',async t=>{
 const s=await setup(t);for(const mutate of [x=>x.posts[0].text+='changed',x=>x.posts.reverse(),x=>x.settings.timezone='UTC',x=>x.posts[0].variantTexts.bluesky='',x=>x.channels[0].enabled=false]){const changed=structuredClone(s.ui);mutate(changed);assert.throws(()=>s.store.previewDraftLabels(changed,{add:['Winter'],postIds:['one']}),e=>e.code==='LABELS_STATE_CHANGED');}
 assert.throws(()=>s.store.previewDraftLabels({...s.ui,revision:0},{add:['Winter'],postIds:['one']}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(s.calls,[]);
});
test('confirmation is bound to exact displayed values, current state and a consumed private one-use preview',async t=>{
 const s=await setup(t);for(const mutate of [p=>p.token='other',p=>p.entries[0].after=['Tampered'],p=>p.entries[0].text='other',p=>p.entries.reverse(),p=>p.extra=true]){const preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one','two']});mutate(preview);await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='LABELS_PREVIEW_CHANGED');}
 const old=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one']}),newer=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['two']});await assert.rejects(s.store.applyDraftLabels(s.ui,old));await assert.rejects(s.store.applyDraftLabels(s.ui,newer));
 const preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one']}),changed=structuredClone(s.ui);changed.posts[0].text='new input';await assert.rejects(s.store.applyDraftLabels(changed,preview),e=>e.code==='LABELS_STATE_CHANGED');assert.deepEqual(s.calls,[]);
});
test('reload and intervening saves invalidate a preview even when the selected draft looks unchanged',async t=>{
 const s=await setup(t);let preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one']});await s.store.load();await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='LABELS_PREVIEW_CHANGED');
 preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one']});const saved=await s.store.save(s.ui);await assert.rejects(s.store.applyDraftLabels(saved,preview),e=>e.code==='LABELS_STATE_CHANGED');assert.equal(s.calls.filter(c=>c[0]==='PUT').length,1);
});
test('one external revision conflict writes once, never merges and leaves all concurrent data intact',async t=>{
 const s=await setup(t),preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one','two']});const other=await s.client.load();other.posts[0].title='Other writer';await s.client.save(other);const current=await s.client.load();s.calls.length=0;
 await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='REVISION_CONFLICT');await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='LABELS_PREVIEW_CHANGED');assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.deepEqual(await s.client.load(),current);
});
for(const failure of ['lost','json','projection','metadata','extra-post','media','unknown-409'])test(`committed ${failure} receipt freezes all mutations, preserves UI and only reload reconciles`,async t=>{
 const s=await setup(t,serverStore,{media:true}),preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one','two']}),held=structuredClone(s.ui);
 s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('connection lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNKNOWN_CONFLICT'}},{status:409});const body=await response.json();if(failure==='projection')delete body.posts;else if(failure==='metadata')body.posts[0].variants[0].statusNote='lost';else if(failure==='extra-post')body.posts.pop();else body.media[0].altText='changed';return Response.json(body);});
 await assert.rejects(s.store.applyDraftLabels(s.ui,preview));assert.deepEqual(s.ui,held);assert.equal(s.store.plannerRevision,held.revision);
 await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['three']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.calls.length,1);
 s.intercept(null);const fresh=await s.store.load();assert.equal(fresh.revision,held.revision+1);assert.ok(fresh.posts.find(p=>p.id==='one').tags.includes('Winter'));assert.throws(()=>s.store.previewDraftLabels(fresh,{add:['Winter'],postIds:['one']}),e=>e.code==='LABELS_NO_CHANGE');
});
test('pending intent blocks duplicate confirmations, preview, load, generic save and split',async t=>{
 const s=await setup(t),preview=s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['one','two']});let release;const wait=new Promise(resolve=>release=resolve);s.intercept(async(path,options,fetch)=>{if(options.method==='PUT')await wait;return fetch(path,options);});
 const pending=s.store.applyDraftLabels(s.ui,preview);await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='BUSY');assert.throws(()=>s.store.previewDraftLabels(s.ui,{add:['Winter'],postIds:['three']}),e=>e.code==='BUSY');await assert.rejects(s.store.load(),e=>e.code==='BUSY');await assert.rejects(s.store.save(s.ui),e=>e.code==='BUSY');await assert.rejects(s.store.splitDraft(s.ui,{postId:'one'}),e=>e.code==='BUSY');release();await pending;assert.equal(s.calls.length,1);
});
for(const [label,factory] of [['server',serverStore],['browser',browserStore]])test(`${label}: one canonical save changes only selected raw tags, preserves metadata and scheduled controls`,async t=>{
 const s=await setup(t,factory,{media:true}),before=structuredClone(s.ui),bucket=structuredClone([...s.env.BUCKET.data]);
 const preview=s.store.previewDraftLabels(s.ui,{postIds:['two','one'],add:['Kampagne Winter','é'],remove:['A\r\nB']});assert.equal(s.calls.length,0);assert.deepEqual(preview.entries.map(e=>e.postId),['two','one']);
 const result=await s.store.applyDraftLabels(s.ui,preview);assert.deepEqual(s.calls,[['PUT','/api/planner/state']]);assert.equal(result.revision,before.revision+1);assert.deepEqual(s.ui,before);
 const after=await s.client.load();for(const old of s.canonical.posts){const actual=after.posts.find(p=>p.id===old.id);assert.deepEqual(stable(actual),{...stable(old),tags:['one','two'].includes(old.id)?[' Label ','A','A','Kampagne Winter','é']:old.tags});}
 assert.deepEqual(after.media,s.canonical.media);assert.deepEqual(after.channels,s.canonical.channels);assert.deepEqual(after.settings,s.canonical.settings);assert.deepEqual([...s.env.BUCKET.data],bucket);
});
test('pure workflow preserves exact whitespace, CRLF, duplicates, decomposed Unicode and unselected data',()=>{
 const state=fixture();state.posts[0].tags=[' A ','A','A','e\u0301','é','x\r\ny'];state.posts[1].variants=[];state.posts[2].variants.push(variant('extra','mastodon'));const held=structuredClone(state);
 const {next,entries}=prepareDraftLabels(state,{postIds:['one','two','three'],add:['Winter'],remove:['A']});assert.deepEqual(next.posts[0].tags,[' A ','e\u0301','é','x\r\ny','Winter']);assert.equal(entries.length,3);assert.deepEqual(state,held);
 for(const ids of [[],['one','one'],['missing'],[1]])assert.throws(()=>prepareDraftLabels(state,{postIds:ids,add:['X']}));
 for(const options of [{add:[]},{add:['']},{add:['x'.repeat(61)]},{add:['X'],remove:['X']},{add:['X','X']}])assert.throws(()=>prepareDraftLabels(state,{postIds:['one'],...options}));
 state.posts[0].tags=Array.from({length:20},(_,i)=>'L'+i);assert.throws(()=>prepareDraftLabels(state,{postIds:['one','two'],add:['new']}),e=>e.code==='LABELS_LIMIT');
 for(const mutate of [p=>p.stage='planned',p=>p.scheduledAt='2099-01-01T00:00:00Z',p=>p.scheduleBinding={},p=>p.variants[0].publishedUrl='https://example.com']){const data=fixture();mutate(data.posts[0]);assert.throws(()=>prepareDraftLabels(data,{postIds:['one','two'],add:['X']}),e=>e.code==='LABELS_DRAFT_REQUIRED');}
});
test('cancel consumes private preview and malformed reload cannot unlock unknown result',async t=>{
 const s=await setup(t);let preview=s.store.previewDraftLabels(s.ui,{postIds:['one'],add:['X']});s.store.cancelDraftLabels(preview);await assert.rejects(s.store.applyDraftLabels(s.ui,preview),e=>e.code==='LABELS_PREVIEW_CHANGED');assert.equal(s.calls.length,0);
 preview=s.store.previewDraftLabels(s.ui,{postIds:['one'],add:['X']});s.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method==='PUT')throw Error('lost');const body=await response.json();body.posts[0].tags=[42];return Response.json(body);});await assert.rejects(s.store.applyDraftLabels(s.ui,preview));await assert.rejects(s.store.load());await assert.rejects(s.store.save(s.ui),e=>e.code==='RELOAD_REQUIRED');
});
test('mirrors match exactly',()=>{for(const [a,b] of [['modules/data/takt-adapter.mjs','public/data-client/takt-adapter.mjs'],['modules/workflows/draft-labels.mjs','public/workflows/draft-labels.mjs']])assert.equal(readFileSync(new URL('../../'+a,import.meta.url),'utf8'),readFileSync(new URL('../../'+b,import.meta.url),'utf8'));});
