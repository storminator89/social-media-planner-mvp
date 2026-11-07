import test from 'node:test';
import assert from 'node:assert/strict';
import {createSitesHandler} from '../worker/handler.mjs';
import {createTaktStore} from '../modules/data/takt-adapter.mjs';
import {createPlannerClient} from '../modules/data/client.mjs';
import {findNextPostingSlots,selectPostingSlot,inspectScheduleBinding} from '../modules/workflows/posting-schedules.mjs';
import {D1TestAdapter,fixture} from './data/support.mjs';
import {payload} from './ui/workspace-fixtures.mjs';
const ORIGIN='https://planner.example';
const rules=()=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:30,overlapChoice:'later',slots:[{id:'sunday',weekday:0,time:'02:30'}]});
const NOW='2099-10-01T00:00:00.000Z';
function setup(){const env={DB:new D1TestAdapter(),TAKT_SITE_ID:'fixture-site',TAKT_SITE_ORIGIN:ORIGIN};const handler=createSitesHandler();const request=(owner,path,body,method=body?'PUT':'GET')=>handler.fetch(new Request(ORIGIN+path,{method,headers:{'oai-authenticated-user-id':owner,...(body?{'Content-Type':'application/json','Origin':ORIGIN,'X-Planner-Request':'1'}:{})},body:body?JSON.stringify(body):undefined}),env);return{env,request,client:owner=>createPlannerClient({fetcher:(path,options={})=>handler.fetch(new Request(ORIGIN+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':owner}}),env)})};}
async function configured(s){const state=fixture();state.posts=[];state.channels[0].postingSchedule=rules();return s.client('alice').save(state);}
function queued(state){const found=findNextPostingSlots(state,{postId:'queued',channelIds:['instagram'],after:NOW,displayTimezone:'Asia/Tokyo'});const selected=selectPostingSlot(state,found,found.suggestions[0],{now:NOW});return{id:'queued',title:'Queue',body:'Content',tags:[' Label ','A\r\nB'],stage:'planned',scheduledAt:selected.scheduledAt,timezone:selected.timezone,scheduleBinding:selected.scheduleBinding,variants:[{id:'queued-instagram',channelId:'instagram',body:'Channel text',inheritsBody:false,status:'planned',format:'post',scheduledAt:selected.scheduledAt,timezone:selected.timezone,mediaIds:[],statusNote:'Preserve editorial note'}]};}
test('actual Worker keeps per-channel rules, chosen instant and fixed post unchanged across rule edits and owner isolation',async()=>{
 const s=setup();let state=await configured(s);state.posts=[queued(state),{...fixture().posts[0],id:'fixed',scheduledAt:'2099-12-01T01:30:17.123Z',variants:[{...fixture().posts[0].variants[0],id:'fixed-v',scheduledAt:'2099-12-01T01:30:17.123Z'}]}];state=await s.client('alice').save(state);const stablePosts=posts=>posts.map(({updatedAt,...p})=>p);const before=stablePosts(state.posts);
 const stale=structuredClone(state);state.channels[0].postingSchedule.slots=[];state=await s.client('alice').save(state);assert.deepEqual(stablePosts(state.posts),before);assert.equal(inspectScheduleBinding(state.posts.find(p=>p.id==='queued'),state.channels).state,'needs_review');
 assert.deepEqual((await s.client('bob').load()).posts,[]);await assert.rejects(s.client('alice').save(stale),e=>e.status===409);assert.deepEqual(stablePosts((await s.client('alice').load()).posts),before);assert.equal(state.capabilities.automaticPublishing,false);
});
test('actual API3 adapter plus Worker undo retains exact bound post after rules are paused',async()=>{
 const s=setup();let state=await configured(s);state.posts=[queued(state)];state=await s.client('alice').save(state);state.channels[0].postingSchedule.paused=true;await s.client('alice').save(state);
 const store=createTaktStore({client:s.client('alice'),timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});const ui=await store.load(),original=await s.client('alice').load();const deleted=await store.save({...ui,posts:[]});assert.equal((await s.client('alice').load()).restoreProofs.length,1);await store.save({...deleted,posts:ui.posts});const restored=await s.client('alice').load();
 assert.equal(restored.posts[0].scheduledAt,original.posts[0].scheduledAt);assert.deepEqual(restored.posts[0].scheduleBinding,original.posts[0].scheduleBinding);assert.deepEqual(restored.posts[0].variants,original.posts[0].variants);assert.deepEqual(restored.posts[0].tags,original.posts[0].tags);assert.deepEqual(restored.restoreProofs,[]);
});
test('HTTP workspace preserves raw input and schedule context while legacy downgrade cannot delete it',async()=>{
 const s=setup(),state=await configured(s),post=queued(state);await s.client('alice').save({...state,posts:[post]});const before=await s.client('alice').load();const planning={schemaVersion:1,scheduledInstant:post.scheduledAt,scheduleBinding:post.scheduleBinding};const body={schemaVersion:1,expectedRevision:0,writeId:'schedule-workspace-write1',sourcePostId:'queued',basePlannerRevision:before.revision,payload:payload({text:'Unfinished\nbody',rawTags:'"unfinished',planning})};const path='/api/planner/workspaces/workspace-schedule-00001';
 const saved=await s.request('alice',path,body);assert.equal(saved.status,200);const first=await saved.json();assert.deepEqual(first.workspace.payload.planning,planning);assert.equal(first.workspace.payload.rawTags,'"unfinished');
 const old=structuredClone(body);delete old.payload.planning;old.expectedRevision=1;old.writeId='schedule-workspace-write2';const denied=await s.request('alice',path,old);assert.equal(denied.status,409);assert.equal((await denied.json()).error.code,'WORKSPACE_SCHEMA_CHANGED');
 assert.equal((await s.request('bob',path)).status,404);const read=await(await s.request('alice',path)).json();assert.deepEqual(read.workspace,first.workspace);assert.deepEqual(await s.client('alice').load(),before);
});
for(const kind of ['invalid-json','body-read-failure','invalid-projection',408,425,429,404])test(`uncertain committed delete with ${kind} preserves exact Undo only after matching private server proof`,async()=>{
 const s=setup();let canonical=await configured(s);canonical.posts=[queued(canonical)];await s.client('alice').save(canonical);const original=await s.client('alice').load();let lose=true,writes=0;
 const client=createPlannerClient({fetcher:async(path,options={})=>{
  const request=new Request(ORIGIN+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}});const response=await createSitesHandler().fetch(request,s.env);
  if(options.method==='PUT'){writes++;if(lose){lose=false;if(typeof kind==='number')return Response.json({error:{code:'REQUEST_TIMEOUT'}},{status:kind});if(kind==='invalid-json')return new Response('truncated-json',{status:200});if(kind==='body-read-failure')return new Response(new ReadableStream({start(controller){controller.error(Error('stream lost'))}}),{status:200});return Response.json({schemaVersion:3,revision:original.revision+1,settings:{timezone:'Europe/Berlin'}});}}
  return response;
 }});
 const store=createTaktStore({client,timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});const before=await store.load(),held=structuredClone(before.posts);await assert.rejects(store.save({...before,posts:[]}));assert.equal(writes,1);assert.equal(store.plannerRevision,before.revision);
 const committed=await s.client('alice').load();assert.deepEqual(committed.posts,[]);assert.equal(committed.restoreProofs.length,1);const fresh=await store.load();assert.equal(writes,1);await store.save({...fresh,posts:held});assert.equal(writes,2);
 const restored=await s.client('alice').load();assert.equal(restored.posts[0].scheduledAt,original.posts[0].scheduledAt);assert.deepEqual(restored.posts[0].variants,original.posts[0].variants);assert.deepEqual(restored.posts[0].scheduleBinding,original.posts[0].scheduleBinding);
});
test('same-store stale UI revision is409 and never starts another HTTP write',async()=>{
 const s=setup(),store=createTaktStore({client:s.client('alice'),timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});const initial=await store.load();await store.save(initial);await assert.rejects(store.save(initial),e=>e.code==='REVISION_CONFLICT'&&e.status===409);assert.equal((await s.client('alice').load()).revision,1);
});

test('known server409 does not manufacture a possible-delete origin from an unrelated later deletion',async()=>{
 const s=setup();let canonical=await configured(s);canonical.posts=[queued(canonical)];await s.client('alice').save(canonical);
 const store=createTaktStore({client:s.client('alice'),timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});const held=await store.load();let current=await s.client('alice').load();current.settings.locale='en-US';current=await s.client('alice').save(current);
 await assert.rejects(store.save({...held,posts:[]}),e=>e.status===409&&e.code==='REVISION_CONFLICT');await s.client('alice').save({...current,posts:[]});const fresh=await store.load();
 await assert.rejects(store.save({...fresh,posts:held.posts}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual((await s.client('alice').load()).posts,[]);
});
