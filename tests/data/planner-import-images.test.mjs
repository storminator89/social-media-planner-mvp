import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {CHANNELS} from '../../public/model.js';
import {parsePlanningExport,previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {D1TestAdapter,R2TestAdapter,png} from './support.mjs';
const draft=id=>({id,title:'Original title',tags:['Original label'],text:'Original <b>literal</b> 👩‍💻',variantTexts:{mastodon:''},channels:['mastodon'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'Europe/Berlin',cover:null,media:null,createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'});
async function setup(t,factory){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];t.after(()=>env.DB.sql.close());
 const client=createPlannerClient({fetcher:(path,opts={})=>{calls.push([opts.method||'GET',path]);return handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);}});
 const store=factory({client,timezone:'Europe/Berlin',channels:CHANNELS});await store.save({...await store.load(),posts:[draft('existing-image')]});
 // Seed a synthetic already-owned image directly. No upload, browser or external service is involved.
 const key='synthetic/existing-image';env.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice','existing-image-id',key,'original.png','image/png',png.length,'Original alt','2030-01-01T00:00:00.000Z');env.BUCKET.data.set(key,{value:new Uint8Array(png),opts:{httpMetadata:{contentType:'image/png'}}});
 const canonical=await client.load();canonical.posts[0].variants[0].mediaIds=['existing-image-id'];canonical.posts[0].variants[0].statusNote='Preserved private planning note';await client.save(canonical);
 const current=await store.load();calls.length=0;env.BUCKET.put=()=>assert.fail('Import must not upload media');env.BUCKET.delete=()=>assert.fail('Import must not delete media');return {env,client,store,current,calls};
}
function incoming(current){return parsePlanningExport(JSON.stringify({...current,posts:[{...draft('imported-text'),title:'Imported title',text:'Only imported text',variantTexts:{mastodon:'Imported variant'},status:'scheduled',scheduledAt:'2030-01-15T12:00',scheduledInstant:'2030-01-15T11:00:00.000Z'}]}));}
const stripUpdated=p=>{const result=structuredClone(p);delete result.updatedAt;return result;};
for(const [label,factory] of [['server',serverStore],['browser',browserStore]])test(`${label} text import preserves existing image bytes, media row, ID/alt and canonical post metadata`,async t=>{
 const {env,client,store,current,calls}=await setup(t,factory),before=await client.load(),mediaRows=env.DB.sql.prepare('SELECT * FROM planner_media').all(),objects=structuredClone([...env.BUCKET.data]),original=structuredClone(current),preview=previewPlanningImport(current,incoming(current)),next=applyPlanningImport(current,preview);
 assert.deepEqual(current,original);assert.deepEqual(next.posts[0],original.posts[0]);const saved=await store.save(next,{expectedInstants:preview.expectedInstants}),after=await client.load();
 assert.equal(saved.posts.length,2);assert.deepEqual(saved.posts.find(p=>p.id==='existing-image').media,original.posts[0].media);assert.deepEqual(stripUpdated(after.posts.find(p=>p.id==='existing-image')),stripUpdated(before.posts[0]));assert.deepEqual(after.channels,before.channels);assert.deepEqual(after.settings,before.settings);assert.deepEqual(env.DB.sql.prepare('SELECT * FROM planner_media').all(),mediaRows);assert.deepEqual([...env.BUCKET.data],objects);assert.equal(calls.filter(([method,path])=>method==='PUT'&&path==='/api/planner/state').length,1);assert.equal(calls.filter(([method,path])=>method==='POST'&&path==='/api/planner/media').length,0);
});
test('UTC drift in a new record aborts before writing and leaves existing image and every canonical row unchanged',async t=>{
 const {env,client,store,current,calls}=await setup(t,browserStore),before=await client.load(),rows=env.DB.sql.prepare('SELECT * FROM planner_media').all(),objects=structuredClone([...env.BUCKET.data]),preview=previewPlanningImport(current,incoming(current)),next=applyPlanningImport(current,preview);client.resolveTime=async()=>({scheduledAt:'2030-01-15T12:00:00.000Z'});
 await assert.rejects(store.save(next,{expectedInstants:preview.expectedInstants}),e=>e.code==='IMPORT_TIME_CHANGED');assert.equal(calls.filter(([method])=>method==='PUT'||method==='POST').length,0);assert.deepEqual(await client.load(),before);assert.deepEqual(env.DB.sql.prepare('SELECT * FROM planner_media').all(),rows);assert.deepEqual([...env.BUCKET.data],objects);
});
test('an export containing an existing image is rejected as a whole, never silently reduced to text',async t=>{
 const {client,current,calls}=await setup(t,browserStore),before=await client.load(),fullExport={...current,posts:[...current.posts,draft('otherwise-valid')]};assert.throws(()=>parsePlanningExport(JSON.stringify(fullExport)),/enthält Medien/);assert.equal(calls.filter(([method])=>method==='PUT'||method==='POST').length,0);assert.deepEqual(await client.load(),before);
});
