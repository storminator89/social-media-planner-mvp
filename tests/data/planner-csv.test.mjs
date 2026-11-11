import test from 'node:test';import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {CHANNELS} from '../../public/model.js';
import {csvDraftState} from '../../public/planner-csv.js';
import {previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';
import {createPlannerImportUI} from '../../public/planner-import-ui.js';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {D1TestAdapter,R2TestAdapter,png} from './support.mjs';
const draft=id=>({id,title:'Keep title',tags:['Keep label'],text:'Keep body',variantTexts:{mastodon:'Own body'},channels:['mastodon'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'Europe/Berlin',cover:null,mediaItems:[],createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'});
async function setup(t,factory=browserStore){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];let loseResponse=false;t.after(()=>env.DB.sql.close());
 const client=createPlannerClient({fetcher:async(path,opts={})=>{calls.push([opts.method||'GET',path]);const result=await handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);return loseResponse&&opts.method==='PUT'?new Response(JSON.stringify({error:{code:'UNAVAILABLE',message:'Synthetic lost acknowledgement'}}),{status:503}):result;}});
 const store=factory({client,timezone:'Europe/Berlin',channels:CHANNELS});await store.save({...await store.load(),posts:[draft('existing-image')]});
 const key='synthetic/existing-image';env.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice','existing-image-id',key,'original.png','image/png',png.length,'Original alt','2030-01-01T00:00:00.000Z');env.BUCKET.data.set(key,{value:new Uint8Array(png),opts:{httpMetadata:{contentType:'image/png'}}});
 const canonical=await client.load();canonical.posts[0].variants[0].mediaIds=['existing-image-id'];canonical.posts[0].variants[0].statusNote='Keep canonical private note';canonical.posts[0].stage='planned';canonical.posts[0].scheduledAt='2030-10-27T00:30:12.345Z';canonical.posts[0].variants[0].status='planned';canonical.posts[0].variants[0].scheduledAt=canonical.posts[0].scheduledAt;await client.save(canonical);
 const current=await store.load();calls.length=0;env.BUCKET.put=()=>assert.fail('CSV must not upload media');env.BUCKET.delete=()=>assert.fail('CSV must not delete media');return {env,client,store,current,calls,setLost:()=>{loseResponse=true}};
}
const strip=p=>{const r=structuredClone(p);delete r.updatedAt;return r};
for(const [label,factory] of [['browser',browserStore],['server',serverStore]])test(`${label}: actual CSV UI→store→API→SQLite adds drafts, preserves existing image, private metadata and exact UTC fold`,async t=>{
 const h=await setup(t,factory),before=await h.client.load(),images=h.env.DB.sql.prepare('SELECT * FROM planner_media').all(),bytes=structuredClone([...h.env.BUCKET.data]);let state=h.current;h.calls.length=0;
 const el=()=>({value:'',disabled:false,children:[],focus(){},replaceChildren(){this.children=[]},append(x){this.children.push(x)}}),nodes=Object.fromEntries(['input','[data-import-status]','[data-import-list]','[data-import-confirm]','[data-import-close]','[data-csv-options]','[data-csv-channel]'].map(k=>[k,el()]));
 globalThis.document={activeElement:el(),createElement:el};const dialog={open:false,querySelector:s=>nodes[s],addEventListener(){},showModal(){this.open=true},close(){this.open=false}};
 const ui=createPlannerImportUI({dialog,getState:()=>state,canOpen:()=>true,save:async(next,expectedInstants)=>{state=await h.store.save(next,{expectedInstants})}});ui.open();const raw='Text,Tags\n"Literal <script>not code</script>\nSecond line",Tag\nAnother,Other';const data=new TextEncoder().encode(raw);nodes.input.files=[{name:'text.csv',size:data.byteLength,arrayBuffer:async()=>data.buffer}];await nodes.input.onchange();nodes['[data-csv-channel]'].value='mastodon';await nodes['[data-csv-channel]'].onchange();assert.equal(h.calls.length,0);await nodes['[data-import-confirm]'].onclick();await nodes['[data-import-confirm]'].onclick();
 assert.match(nodes['[data-import-status]'].textContent,/Import gespeichert/);const after=await h.client.load();assert.equal(after.posts.length,3);assert.deepEqual(strip(after.posts.find(p=>p.id==='existing-image')),strip(before.posts[0]));assert.deepEqual(after.channels,before.channels);assert.deepEqual(after.settings,before.settings);assert.deepEqual(h.env.DB.sql.prepare('SELECT * FROM planner_media').all(),images);assert.deepEqual([...h.env.BUCKET.data],bytes);
 for(const p of after.posts.filter(p=>p.id!=='existing-image')){assert.equal(p.stage,'draft');assert.equal(p.scheduledAt,null);assert.equal(p.scheduleBinding,null);assert.deepEqual(p.variants[0].mediaIds,[])}
 assert.equal(h.calls.filter(([method,path])=>method==='PUT'&&path==='/api/planner/state').length,1);assert.equal(h.calls.filter(([method])=>method==='POST').length,0);
 const reloaded=await h.store.load(),retry=previewPlanningImport(reloaded,await csvDraftState(reloaded,raw,'mastodon'));assert.equal(retry.duplicates.length,2);assert.equal(retry.additions.length,0);
});
test('actual server CAS conflict blocks entire CSV and preserves another writer plus media',async t=>{
 const h=await setup(t),incoming=await csvDraftState(h.current,'Text\nA\nB','mastodon'),next=applyPlanningImport(h.current,previewPlanningImport(h.current,incoming)),remote=await h.client.load();remote.posts[0].title='Other tab newer title';await h.client.save(remote);const before=await h.client.load();h.calls.length=0;await assert.rejects(h.store.save(next),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(await h.client.load(),before);assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);
});
test('commit followed by lost acknowledgement is not retried and stable CSV IDs prevent duplicates after reload',async t=>{
 const h=await setup(t),raw='Text\nA\nB',incoming=await csvDraftState(h.current,raw,'mastodon'),next=applyPlanningImport(h.current,previewPlanningImport(h.current,incoming));h.setLost();await assert.rejects(h.store.save(next));assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);const reloaded=await h.store.load();assert.equal(reloaded.posts.length,3);const retry=previewPlanningImport(reloaded,await csvDraftState(reloaded,raw,'mastodon'));assert.equal(retry.additions.length,0);assert.equal(retry.duplicates.length,2);assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);
});
test('CSV capacity rejection leaves all existing SQL data and objects unchanged',async t=>{
 const h=await setup(t),before=await h.client.load(),bytes=structuredClone([...h.env.BUCKET.data]);const incoming=await csvDraftState(h.current,'Text\n'+Array.from({length:100},(_,i)=>'Text '+i).join('\n'),'mastodon');h.calls.length=0;assert.throws(()=>previewPlanningImport(h.current,incoming),/Grenze/);assert.equal(h.calls.length,0);assert.deepEqual(await h.client.load(),before);assert.deepEqual([...h.env.BUCKET.data],bytes);
});
