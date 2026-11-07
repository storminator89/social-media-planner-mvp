import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore} from '../../modules/data/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {PlannerRepository} from '../../modules/data/repository.mjs';
import {D1TestAdapter,R2TestAdapter,fixture} from './support.mjs';
function setup(){const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};const client=createPlannerClient({fetcher:(path,options={})=>handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env)});const store=createTaktStore({client,timezone:'Europe/Berlin',channels:[{id:'instagram',name:'Instagram'}]});return{env,store,repo:new PlannerRepository(env.DB)};}
async function seeded(){const s=setup(),data=fixture();data.posts[0].title='Redaktioneller Titel';data.posts[0].tags=['Etikett'];data.posts[0].scheduledAt='2026-10-25T01:30:00.000Z';data.posts[0].variants[0].scheduledAt=data.posts[0].scheduledAt;data.posts[0].variants[0].statusNote='Freigegeben am Dienstag';await s.repo.save('alice',data);return s;}

test('confirmed delete and immediate Undo retain variant ID, note, metadata and exact repeated-hour instant',async()=>{
  const {store,repo}=await seeded(),before=await repo.load('alice'),ui=await store.load();const deleted=await store.save({...ui,posts:[]});assert.equal((await repo.load('alice')).posts.length,0);
  await store.save({...deleted,posts:ui.posts});const after=await repo.load('alice');assert.equal(after.posts[0].title,before.posts[0].title);assert.deepEqual(after.posts[0].tags,before.posts[0].tags);assert.equal(after.posts[0].createdAt,before.posts[0].createdAt);assert.equal(after.posts[0].scheduledAt,'2026-10-25T01:30:00.000Z');assert.deepEqual(after.posts[0].variants,before.posts[0].variants);
});

test('failed Undo is not consumed, and successful local changes between delete and Undo stay intact',async()=>{
  const {store,repo,env}=await seeded(),ui=await store.load();let deleted=await store.save({...ui,posts:[]});
  deleted=await store.save({...deleted,settings:{timezone:'Asia/Tokyo'}});
  env.DB.sql.exec("CREATE TRIGGER reject_restore BEFORE INSERT ON planner_posts BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  await assert.rejects(store.save({...deleted,posts:ui.posts}));assert.equal((await repo.load('alice')).posts.length,0);
  env.DB.sql.exec('DROP TRIGGER reject_restore');await store.save({...deleted,posts:ui.posts});const after=await repo.load('alice');assert.equal(after.posts[0].variants[0].id,'variant-1');assert.equal(after.posts[0].variants[0].statusNote,'Freigegeben am Dienstag');assert.equal(after.settings.timezone,'Asia/Tokyo');
});

test('concurrent changes reject Undo, and an explicit fresh load clears its session cache',async()=>{
  const {store,repo}=await seeded(),ui=await store.load();const deleted=await store.save({...ui,posts:[]});const current=await repo.load('alice');await repo.save('alice',{...current,settings:{...current.settings,timezone:'Asia/Tokyo'}});
  await assert.rejects(store.save({...deleted,posts:ui.posts}),e=>e.code==='REVISION_CONFLICT');assert.equal((await repo.load('alice')).posts.length,0);
  const fresh=await store.load();await assert.rejects(store.save({...fresh,posts:ui.posts}),e=>e.code==='DST_AMBIGUOUS');assert.equal((await repo.load('alice')).posts.length,0);
});

test('Undo cache expires without silently choosing a repeated-hour instant',async()=>{
  const {store,repo}=await seeded(),ui=await store.load();const deleted=await store.save({...ui,posts:[]});const real=Date.now;try{Date.now=()=>real()+61000;await assert.rejects(store.save({...deleted,posts:ui.posts}),e=>e.code==='DST_AMBIGUOUS');}finally{Date.now=real;}assert.equal((await repo.load('alice')).posts.length,0);
});

test('Undo cannot silently drop cached independent channel text or convert a deleted post backwards to an idea',async()=>{
  const {store,repo}=await seeded(),ui=await store.load();const deleted=await store.save({...ui,posts:[]});const missing=structuredClone(ui.posts[0]);delete missing.variantTexts;await assert.rejects(store.save({...deleted,posts:[missing]}),e=>e.code==='VARIANT_TEXTS_REQUIRED');
  const backward={...ui.posts[0],status:'idea',channels:[],variantTexts:{},scheduledAt:null,media:null};await assert.rejects(store.save({...deleted,posts:[backward]}),e=>e.code==='IDEA_TRANSITION_UNSUPPORTED');assert.equal((await repo.load('alice')).posts.length,0);
});
