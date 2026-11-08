import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore} from '../../modules/data/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {PlannerRepository} from '../../modules/data/repository.mjs';
import {D1TestAdapter,R2TestAdapter,fixture,png} from './support.mjs';
const channels=[{id:'instagram',name:'Instagram',color:'#aabbcc'}];
function setup(){const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};const fetcher=(path,opts={})=>handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);const client=createPlannerClient({fetcher});return{env,client,store:createTaktStore({client,timezone:'Europe/Berlin',channels})};}
function ui(){return{schemaVersion:2,revision:0,channels:channels.map(c=>({...c,platform:c.id,enabled:true,connectionStatus:'manual',postingSchedule:null})),settings:{timezone:'Europe/Berlin'},posts:[{id:'post-1',scheduleBinding:null,scheduledInstant:null,text:'Hallo',channels:['instagram'],status:'scheduled',scheduledAt:'2026-11-09T09:00',timeZone:'Europe/Berlin',cover:'forms',media:null,createdAt:'2026-11-07T09:00:00Z'}]};}
test('adapter starts empty, preserves IANA settings, round-trips local time',async()=>{const {store,env}=setup();assert.deepEqual((await store.load()).posts,[]);const saved=await store.save(ui());assert.equal(saved.settings.timezone,'Europe/Berlin');assert.equal(saved.posts[0].scheduledAt,'2026-11-09T09:00');assert.equal(saved.posts[0].timeZone,'Europe/Berlin');assert.equal(saved.posts[0].cover,'forms');assert.equal((await new PlannerRepository(env.DB).load('alice')).posts[0].scheduledAt,'2026-11-09T08:00:00.000Z');});
test('adapter retains per-post zone independently from global display setting',async()=>{const {store,env}=setup();await store.load();const input=ui();input.posts[0].timeZone='Asia/Kathmandu';const saved=await store.save(input);assert.equal(saved.posts[0].timeZone,'Asia/Kathmandu');assert.equal(saved.posts[0].scheduledAt,'2026-11-09T09:00');assert.equal(saved.settings.timezone,'Europe/Berlin');assert.equal((await new PlannerRepository(env.DB).load('alice')).posts[0].scheduledAt,'2026-11-09T03:15:00.000Z');});
test('adapter uploads data URL once and returns only private relative media URL',async()=>{const {store,env}=setup();await store.load();const input=ui();input.posts[0].media={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),name:'test.png',alt:'Beschreibung',type:'image/png'};const saved=await store.save(input);assert.match(saved.posts[0].media.url,/^\/api\/planner\/media\//);assert.equal(saved.posts[0].media.dataUrl,undefined);assert.equal(saved.posts[0].media.alt,'Beschreibung');const repeated=await store.save({...input,revision:saved.revision});assert.equal(env.BUCKET.data.size,1);await store.save(repeated);assert.equal(env.BUCKET.data.size,1);});
test('adapter rejects remote URL injection and non-image data URL',async()=>{const {store}=setup();await store.load();const input=ui();input.posts[0].media={id:'foreign',url:'https://evil.example/image',alt:'x'};await assert.rejects(store.save(input),e=>e.code==='INVALID_MEDIA');input.posts[0].media={dataUrl:'data:image/svg+xml;base64,AA==',alt:'x'};await assert.rejects(store.save(input),e=>e.code==='INVALID_MEDIA');});
test('adapter surfaces DST ambiguity without silently choosing an instant',async()=>{const {store}=setup();await store.load();const input=ui();input.posts[0].scheduledAt='2026-10-25T02:30';await assert.rejects(store.save(input),e=>e.code==='DST_AMBIGUOUS');});
test('adapter never retries a revision conflict',async()=>{const {store,env}=setup();await store.load();const repo=new PlannerRepository(env.DB);await repo.save('alice',fixture());await assert.rejects(store.save(ui()),e=>e.status===409);assert.equal((await repo.load('alice')).revision,1);});
test('adapter rejects advanced variant state instead of flattening it',async()=>{const {store,env}=setup();const advanced=fixture();advanced.posts[0].variants[0].format='reel';await new PlannerRepository(env.DB).save('alice',advanced);await assert.rejects(store.load(),e=>e.code==='UI_SCHEMA_UNSUPPORTED');});
test('failed initial advanced-state load does not permit destructive adapter save',async()=>{const {store,env}=setup();const advanced=fixture();advanced.posts[0].variants[0].format='reel';await new PlannerRepository(env.DB).save('alice',advanced);await assert.rejects(store.load());await assert.rejects(store.save(ui()),e=>e.code==='NOT_LOADED');});
test('ordered attachments round trip, reorder, remove and reject destructive legacy projection',async()=>{
 const {store,env}=setup();await store.load();const input=ui();
 const a={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),name:'a.png',alt:'A',type:'image/png'},b={...a,name:'b.png',alt:'B'};
 input.posts[0].attachments=[a,b];input.posts[0].media=a;
 let saved=await store.save(input);assert.equal(saved.posts[0].attachments.length,2);assert.equal(env.BUCKET.data.size,2);
 const ids=saved.posts[0].attachments.map(m=>m.id);assert.deepEqual((await new PlannerRepository(env.DB).load('alice')).posts[0].variants[0].mediaIds,ids);
 const old=structuredClone(saved);delete old.posts[0].attachments;await assert.rejects(store.save(old),e=>e.code==='ATTACHMENTS_REQUIRED');
 saved.posts[0].attachments.reverse();saved.posts[0].media=saved.posts[0].attachments[0];saved=await store.save(saved);assert.deepEqual(saved.posts[0].attachments.map(m=>m.id),ids.reverse());
 saved.posts[0].attachments.splice(1);saved=await store.save(saved);assert.equal(saved.posts[0].attachments.length,1);assert.equal(env.BUCKET.data.size,2);
});
test('attachments reject mismatches, excess, unknown second reference and duplicate references without planner change',async()=>{
 const {store,env}=setup();await store.load();const input=ui();const a={id:'unknown',url:'/api/planner/media/unknown',alt:'A'};
 input.posts[0].attachments=[a];await assert.rejects(store.save(input),e=>e.code==='INVALID_ATTACHMENTS');input.posts[0].media=a;
 input.posts[0].attachments=Array(11).fill(a);await assert.rejects(store.save(input),e=>e.code==='INVALID_ATTACHMENTS');
 input.posts[0].attachments=[a];await assert.rejects(store.save(input),e=>e.code==='INVALID_MEDIA');assert.equal((await new PlannerRepository(env.DB).load('alice')).revision,0);
});
test('identical local attachment is rejected before upload or planner write',async()=>{
 const {store,env}=setup();await store.load();const input=ui();const a={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),name:'same.png',alt:'Same',type:'image/png'};
 input.posts[0].attachments=[a,{...a}];input.posts[0].media=a;
 await assert.rejects(store.save(input),e=>e.code==='DUPLICATE_ATTACHMENT'&&e.message.includes('doppelten Anhang'));
 assert.equal(env.BUCKET.data.size,0);assert.equal((await new PlannerRepository(env.DB).load('alice')).revision,0);
 assert.equal(input.posts[0].attachments.length,2);
});
for(const localFirst of [false,true])test(`warm upload cache rejects cloud plus same local attachment before upload/write, localFirst=${localFirst}`,async()=>{
 const {store,env}=setup();await store.load();const input=ui();const local={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),name:'same.png',alt:'Same',type:'image/png'};
 input.posts[0].attachments=[local];input.posts[0].media=local;const saved=await store.save(input);const cloud=saved.posts[0].media;
 const candidate=structuredClone(saved);candidate.posts[0].attachments=localFirst?[local,cloud]:[cloud,local];candidate.posts[0].media=candidate.posts[0].attachments[0];
 const original=structuredClone(candidate);await assert.rejects(store.save(candidate),e=>e.code==='DUPLICATE_ATTACHMENT'&&e.message.includes('doppelten Anhang'));
 assert.deepEqual(candidate,original);assert.equal(env.BUCKET.data.size,1);assert.equal((await new PlannerRepository(env.DB).load('alice')).revision,saved.revision);
 assert.deepEqual((await store.load()).posts[0].attachments,[cloud]);
});
test('upload receipt resolving to an existing cloud attachment is rejected before planner save',async()=>{
 const {store,client}=setup();await store.load();const input=ui();const local={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),name:'same.png',alt:'Same',type:'image/png'};input.posts[0].media=local;const saved=await store.save(input);const canonical=await client.load();let writes=0;
 const fresh=createTaktStore({timezone:'Europe/Berlin',channels,client:{load:async()=>canonical,resolveTime:(...args)=>client.resolveTime(...args),uploadMedia:async()=>canonical.media[0],save:async()=>{writes++;throw Error('must not save');}}});await fresh.load();
 const candidate=structuredClone(saved);candidate.posts[0].attachments.push(local);await assert.rejects(fresh.save(candidate),e=>e.code==='DUPLICATE_ATTACHMENT');assert.equal(writes,0);assert.equal(candidate.posts[0].attachments.length,2);
});
