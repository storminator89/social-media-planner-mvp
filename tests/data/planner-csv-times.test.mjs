import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createSitesHandler} from '../../worker/handler.mjs';
import {CHANNELS} from '../../public/model.js';
import {csvDraftState} from '../../public/planner-csv.js';
import {parsePlanningExport,previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';
import {createPlannerImportUI} from '../../public/planner-import-ui.js';
import {D1TestAdapter,R2TestAdapter,png} from './support.mjs';
const now='2030-01-01T00:00:00.000Z';
const raw='Text,Tags,Posting Time\nDraft,Tag,\n"Timed <img onerror=evil>\nSecond line",Tag,2030-04-06 09:00';
const draft=id=>({id,title:'Keep title',tags:['Keep label'],text:'Keep body',variantTexts:{mastodon:'Own body'},channels:['mastodon'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'Europe/Berlin',cover:null,mediaItems:[],createdAt:now,updatedAt:now});
const strip=p=>{const r=structuredClone(p);delete r.updatedAt;return r};
async function setup(t,factory=browserStore){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter(),TAKT_SITE_ID:'fixture-site',TAKT_SITE_ORIGIN:'https://planner.example'},calls=[];let intercept=null;t.after(()=>env.DB.sql.close());const handler=createSitesHandler();
 const realFetch=(path,opts={})=>handler.fetch(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);
 const client=createPlannerClient({fetcher:(path,opts={})=>{calls.push([opts.method||'GET',path]);return intercept?intercept(path,opts,realFetch):realFetch(path,opts)}});
 const store=factory({client,timezone:'Europe/Berlin',channels:CHANNELS});await store.save({...await store.load(),posts:[draft('existing')]});
 const key='synthetic/existing-image';env.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice','existing-image-id',key,'original.png','image/png',png.length,'Original alt',now);env.BUCKET.data.set(key,{value:new Uint8Array(png),opts:{httpMetadata:{contentType:'image/png'}}});
 const canonical=await client.load();canonical.posts[0].variants[0].mediaIds=['existing-image-id'];canonical.posts[0].variants[0].statusNote='Keep canonical private note';canonical.posts[0].stage='planned';canonical.posts[0].scheduledAt='2030-10-27T01:30:12.345Z';canonical.posts[0].variants[0].status='planned';canonical.posts[0].variants[0].scheduledAt=canonical.posts[0].scheduledAt;await client.save(canonical);
 const current=await store.load();calls.length=0;env.BUCKET.put=()=>assert.fail('CSV must not upload media');env.BUCKET.delete=()=>assert.fail('CSV must not delete media');return {env,client,store,current,calls,intercept:fn=>intercept=fn};
}
async function preview(h,source=raw,timezone='Europe/Berlin'){
 const file=await csvDraftState(h.current,source,'mastodon',{now,timezone}),p=previewPlanningImport(h.current,file);return {preview:p,next:applyPlanningImport(h.current,p),options:{expectedInstants:p.expectedInstants,requireFuture:true}};
}
for(const [label,factory] of [['browser',browserStore],['server',serverStore]])test(`${label}: timed CSV actual UI→adapter→Worker→API→SQLite preserves existing exact fold, media and canonical metadata`,async t=>{
 const h=await setup(t,factory),before=await h.client.load(),bytes=structuredClone([...h.env.BUCKET.data]);let state=h.current;h.calls.length=0;
 const el=()=>({value:'',disabled:false,children:[],focus(){},replaceChildren(){this.children=[]},append(x){this.children.push(x)}}),nodes=Object.fromEntries(['input','[data-import-status]','[data-import-list]','[data-import-confirm]','[data-import-close]','[data-csv-options]','[data-csv-channel]','[data-csv-zone-field]','[data-csv-zone]'].map(k=>[k,el()]));globalThis.document={activeElement:el(),createElement:el};const dialog={open:false,querySelector:s=>nodes[s],addEventListener(){},showModal(){this.open=true},close(){this.open=false}};
 const ui=createPlannerImportUI({dialog,getState:()=>state,canOpen:()=>true,save:async(next,expectedInstants,{requireFuture})=>{state=await h.store.save(next,{expectedInstants,requireFuture})}});ui.open();const data=new TextEncoder().encode(raw);nodes.input.files=[{name:'timed.csv',size:data.byteLength,arrayBuffer:async()=>data.buffer}];await nodes.input.onchange();nodes['[data-csv-channel]'].value='mastodon';await nodes['[data-csv-channel]'].onchange();nodes['[data-csv-zone]'].value='Europe/Berlin';await nodes['[data-csv-zone]'].onchange();assert.equal(h.calls.length,0);await nodes['[data-import-confirm]'].onclick();await nodes['[data-import-confirm]'].onclick();
 assert.equal(nodes['[data-import-status]'].textContent,'Import gespeichert.');assert.deepEqual(h.calls,[['POST','/api/planner/resolve-time'],['PUT','/api/planner/state']]);const after=await h.client.load();assert.equal(after.posts.length,3);assert.deepEqual(strip(after.posts.find(p=>p.id==='existing')),strip(before.posts[0]));assert.deepEqual(after.channels,before.channels);assert.deepEqual(after.settings,before.settings);assert.deepEqual(after.media,before.media);assert.deepEqual([...h.env.BUCKET.data],bytes);assert.equal(after.capabilities.automaticPublishing,false);
 const timed=after.posts.find(p=>p.id.startsWith('csv-time-'));assert.equal(timed.scheduledAt,'2030-04-06T07:00:00.000Z');assert.equal(timed.stage,'planned');assert.equal(timed.scheduleBinding,null);assert.equal(timed.variants[0].publishedAt,null);assert.equal(timed.variants[0].publishedUrl,null);assert.deepEqual(timed.variants[0].mediaIds,[]);
 const loaded=await h.store.load(),again=await csvDraftState(loaded,raw,'mastodon',{now:'2031-01-01T00:00:00.000Z',timezone:'Europe/Berlin'}),repeat=previewPlanningImport(loaded,again);assert.equal(repeat.duplicates.length,2);assert.equal(repeat.additions.length,0);
});
test('historical JSON imports retain their old contract and exact receipt succeeds',async t=>{
 const h=await setup(t),p={...draft('historical-json'),status:'scheduled',scheduledAt:'2000-01-15T12:00',scheduledInstant:null},incoming=parsePlanningExport(JSON.stringify({...h.current,posts:[p]})),plan=previewPlanningImport(h.current,incoming);const result=await h.store.save(applyPlanningImport(h.current,plan),{expectedInstants:plan.expectedInstants});assert.equal(result.posts.find(p=>p.id==='historical-json').scheduledInstant,'2000-01-15T11:00:00.000Z');
});
test('requireFuture map covers every new schedule; absent, partial, extra and nonboolean options reject before any request',async t=>{
 const h=await setup(t),plan=await preview(h),before=await h.client.load();h.calls.length=0;
 for(const options of [{requireFuture:true},{requireFuture:true,expectedInstants:{}},{requireFuture:true,expectedInstants:{...plan.options.expectedInstants,existing:'2030-10-27T01:30:12.345Z'}},{...plan.options,requireFuture:'yes'}])await assert.rejects(h.store.save(plan.next,options),e=>e.code==='INVALID_IMPORT_EXPECTATION');assert.deepEqual(h.calls,[]);assert.deepEqual(await h.client.load(),before);
});
test('server resolver mismatch rejects whole mixed CSV before state PUT',async t=>{
 const h=await setup(t),plan=await preview(h),before=await h.client.load();h.calls.length=0;h.client.resolveTime=async()=>({scheduledAt:'2030-04-06T08:00:00.000Z'});await assert.rejects(h.store.save(plan.next,plan.options),e=>e.code==='IMPORT_TIME_CHANGED');assert.deepEqual(h.calls,[]);assert.deepEqual(await h.client.load(),before);
});
test('advancing time during async resolution is checked after the final await and before PUT',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(now)});const h=await setup(t),plan=await preview(h,'Text,Posting Time\nFirst,2030-01-01 00:01\nSecond,2030-01-01 00:02','UTC'),before=await h.client.load(),resolve=h.client.resolveTime;let resolved=0;h.calls.length=0;h.client.resolveTime=async(...args)=>{const result=await resolve(...args);if(++resolved===2)t.mock.timers.setTime(Date.parse('2030-01-01T00:01:00.000Z'));return result};await assert.rejects(h.store.save(plan.next,plan.options),e=>e.code==='IMPORT_TIME_ELAPSED');assert.equal(resolved,2);assert.equal(h.calls.filter(([m])=>m==='PUT').length,0);assert.deepEqual(await h.client.load(),before);await h.store.save(h.current);
});
test('CSV caller mutations during resolution cannot change captured intended content or UTC map',async t=>{
 const h=await setup(t),plan=await preview(h),expected=Object.values(plan.options.expectedInstants)[0],resolve=h.client.resolveTime;h.client.resolveTime=async(...args)=>{plan.next.posts.at(-1).text='MUTATED';plan.options.expectedInstants[plan.next.posts.at(-1).id]='2030-04-06T08:00:00.000Z';return resolve(...args)};const saved=await h.store.save(plan.next,plan.options);assert.equal(saved.posts.find(p=>p.id.startsWith('csv-time-')).scheduledInstant,expected);assert.match(saved.posts.find(p=>p.id.startsWith('csv-time-')).text,/Timed <img/);
});
test('one CAS conflict leaves concurrent state untouched, never retries or merges',async t=>{
 const h=await setup(t),plan=await preview(h),remote=await h.client.load();remote.posts[0].title='Other tab';await h.client.save(remote);const before=await h.client.load();h.calls.length=0;await assert.rejects(h.store.save(plan.next,plan.options),e=>e.code==='REVISION_CONFLICT');assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);assert.deepEqual(await h.client.load(),before);
});
test('SQL failure rolls back all rows and uncertain import freezes mutation until load',async t=>{
 const h=await setup(t),plan=await preview(h),before=await h.client.load();h.env.DB.sql.exec("CREATE TRIGGER reject_csv_time BEFORE INSERT ON planner_posts WHEN NEW.id LIKE 'csv-time-%' BEGIN SELECT RAISE(ABORT,'test failure'); END;");h.calls.length=0;await assert.rejects(h.store.save(plan.next,plan.options));await assert.rejects(h.store.save(h.current),e=>e.code==='RELOAD_REQUIRED');assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);assert.deepEqual(await h.client.load(),before);
});
for(const failure of ['lost','json','wrong-revision','missing-post','changed-time','changed-body','changed-note','changed-media','extra-variant','unknown-409'])test(`committed ${failure} import receipt does not confirm success or allow blind retry`,async t=>{
 const h=await setup(t),plan=await preview(h),held=structuredClone(h.current);h.intercept(async(path,options,fetch)=>{const response=await fetch(path,options);if(options.method!=='PUT')return response;if(failure==='lost')throw Error('lost');if(failure==='json')return new Response('truncated');if(failure==='unknown-409')return Response.json({error:{code:'UNRECOGNIZED'}},{status:409});const body=await response.json(),timed=body.posts.find(p=>p.id.startsWith('csv-time-'));if(failure==='wrong-revision')body.revision++;if(failure==='missing-post')body.posts.pop();if(failure==='changed-time')timed.scheduledAt='2030-04-06T08:00:00.000Z';if(failure==='changed-body')timed.body='Different';if(failure==='changed-note')body.posts.find(p=>p.id==='existing').variants[0].statusNote='Changed';if(failure==='changed-media')body.media[0].altText='Changed';if(failure==='extra-variant')timed.variants.push({...timed.variants[0],id:'extra-variant'});return Response.json(body)});
 await assert.rejects(h.store.save(plan.next,plan.options));assert.deepEqual(h.current,held);assert.equal(h.store.plannerRevision,held.revision);await assert.rejects(h.store.save(h.current),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(h.store.splitDraft(h.current,{postId:'any'}),e=>e.code==='RELOAD_REQUIRED');assert.throws(()=>h.store.previewDraftBatch(h.current,{postIds:['any']}),e=>e.code==='RELOAD_REQUIRED');await assert.rejects(h.store.scheduleDraftBatch(h.current,{}),e=>e.code==='RELOAD_REQUIRED');assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);
 h.intercept(null);const loaded=await h.store.load();assert.equal(loaded.posts.length,3);const repeat=previewPlanningImport(loaded,await csvDraftState(loaded,raw,'mastodon',{now:'2031-01-01T00:00:00.000Z',timezone:'Europe/Berlin'}));assert.equal(repeat.duplicates.length,2);assert.equal(repeat.additions.length,0);
});
test('adapter mirrors remain byte-identical and HTTP schema has no CSV flags',async t=>{
 assert.equal(readFileSync(new URL('../../modules/data/takt-adapter.mjs',import.meta.url),'utf8'),readFileSync(new URL('../../public/data-client/takt-adapter.mjs',import.meta.url),'utf8'));const h=await setup(t),plan=await preview(h);h.intercept((path,opts,fetch)=>{if(opts.method==='PUT'){assert.deepEqual(Object.keys(JSON.parse(opts.body)).sort(),['channels','posts','revision','schemaVersion','settings']);assert.deepEqual(Object.keys(opts.headers).sort(),['Content-Type','X-Planner-Request']);}return fetch(path,opts)});await h.store.save(plan.next,plan.options);
});
