import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {CHANNELS} from '../../public/model.js';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {D1TestAdapter,R2TestAdapter} from './support.mjs';
const {parsePlanningExport,previewPlanningImport,applyPlanningImport}=await import(process.env.IMPORT_MODULE||new URL('../../public/planner-import.js',import.meta.url));
const draft=id=>({id,title:'Import',tags:['B','A'],text:'Basis <b>Klartext</b> 👩‍💻',variantTexts:{mastodon:''},channels:['mastodon','linkedin','bluesky'],status:'draft',scheduleBinding:null,scheduledInstant:null,scheduledAt:null,timeZone:'Europe/Berlin',cover:null,media:null,createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'});
function setup(t,factory){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];t.after(()=>env.DB.sql.close());
 const client=createPlannerClient({fetcher:(path,opts={})=>{calls.push([opts.method||'GET',path]);return handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);}});
 return {env,client,calls,store:factory({client,timezone:'Europe/Berlin',channels:CHANNELS})};
}
const rows=db=>Object.fromEntries(['planner_profiles','planner_channels','planner_posts','planner_variants','planner_media','planner_editor_workspaces'].map(table=>[table,db.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
for(const [label,factory]of [['browser',browserStore],['server',serverStore]])for(const fixed of [false,true])test(`${label} reload repeats unchanged idea/draft/planned file after server timestamps and target ordering (${fixed?'fixed':'resolved'} UTC)`,async t=>{
 const {env,client,store,calls}=setup(t,factory),current=await store.load();
 const file=JSON.stringify({...current,posts:[{...draft('idea'),channels:[],variantTexts:{},status:'idea'},draft('draft'),{...draft('planned'),variantTexts:{mastodon:'Eigene Fassung'},status:'scheduled',scheduledAt:'2030-01-15T12:00',scheduledInstant:fixed?'2030-01-15T11:00:00.000Z':null}]});
 const imported=parsePlanningExport(file),beforeImported=structuredClone(imported),preview=previewPlanningImport(current,imported);
 await store.save(applyPlanningImport(current,preview),{expectedInstants:preview.expectedInstants});
 // Deterministically model the server's generated-ID load order, not a user
 // channel-order edit. Production SELECT orders variants by ID, never input order.
 for(const id of ['draft','planned'])for(const [index,channel]of ['bluesky','linkedin','mastodon'].entries())env.DB.sql.prepare('UPDATE planner_variants SET id=? WHERE owner_id=? AND post_id=? AND channel_id=?').run(`repeat-${id}-${index}`,'alice',id,channel);
 const reloaded=await store.load(),beforeRows=rows(env.DB),beforeCanonical=await client.load(),before=structuredClone(reloaded);calls.length=0;
 assert.notEqual(reloaded.posts[0].updatedAt,imported.posts[0].updatedAt);assert.deepEqual(reloaded.posts.find(p=>p.id==='draft').channels,['bluesky','linkedin','mastodon']);
 const repeated=previewPlanningImport(reloaded,parsePlanningExport(file));assert.equal(repeated.additions.length,0);assert.deepEqual(repeated.duplicates.sort(),['draft','idea','planned']);assert.deepEqual({...repeated.expectedInstants},{});
 assert.deepEqual(applyPlanningImport(reloaded,repeated),reloaded);assert.deepEqual(reloaded,before);assert.deepEqual(imported,beforeImported);assert.deepEqual(rows(env.DB),beforeRows);assert.equal(calls.length,0);assert.deepEqual(await client.load(),beforeCanonical);assert.equal(env.BUCKET.data.size,0);
});
test('changed existing content after import still blocks an unchanged file and any mixed new entry atomically',async t=>{
 const {env,client,store,calls}=setup(t,browserStore),current=await store.load(),file=JSON.stringify({...current,posts:[draft('existing')]});
 let preview=previewPlanningImport(current,parsePlanningExport(file));await store.save(applyPlanningImport(current,preview));const canonical=await client.load();canonical.posts[0].body+=' changed';await client.save(canonical);const reloaded=await store.load(),before=rows(env.DB);calls.length=0;
 const mixed=parsePlanningExport(JSON.stringify({...current,posts:[draft('existing'),draft('new')]}));assert.throws(()=>previewPlanningImport(reloaded,mixed),/Konflikt/);assert.deepEqual(rows(env.DB),before);assert.equal(calls.length,0);
});
