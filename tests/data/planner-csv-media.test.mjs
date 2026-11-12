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

const selected=h=>structuredClone(h.current.posts[0].mediaItems[0]);
test('image-only CSV draft references existing owner media with atomic SQL save and reload',async t=>{
 const h=await setup(t),before=await h.client.load(),media=selected(h),incoming=await csvDraftState(h.current,'Text,Tags\n,Image','mastodon',{images:[media]}),preview=previewPlanningImport(h.current,incoming);
 assert.equal(incoming.posts[0].text,'');assert.deepEqual(incoming.posts[0].mediaItems,[media]);
 await h.store.save(applyPlanningImport(h.current,preview));const after=await h.client.load();assert.equal(after.posts.length,2);const added=after.posts.find(p=>p.id!==before.posts[0].id);assert.equal(added.body,'');assert.deepEqual(added.variants[0].mediaIds,[media.id]);assert.equal(h.calls.filter(([method])=>method==='POST').length,0);
 const reloaded=await h.store.load(),retry=previewPlanningImport(reloaded,await csvDraftState(reloaded,'Text,Tags\n,Image','mastodon',{images:[media]}));assert.equal(retry.additions.length,0);assert.equal(retry.duplicates.length,1);
});
test('forged, changed, unreferenced and external images fail before any write',async t=>{
 const h=await setup(t),media=selected(h);for(const patch of [{id:'foreign'},{alt:'Changed'},{url:'https://example.com/image.png'},{type:'video/mp4'}])await assert.rejects(csvDraftState(h.current,'Text\nCaption','mastodon',{images:[{...media,...patch}]}));assert.equal(h.calls.length,0);
});
test('media selection is part of import identity; changed existing image draft conflicts',async t=>{
 const h=await setup(t),media=selected(h),plain=await csvDraftState(h.current,'Text\nCaption','mastodon'),withImage=await csvDraftState(h.current,'Text\nCaption','mastodon',{images:[media]});assert.notEqual(plain.posts[0].id,withImage.posts[0].id);
 const saved=applyPlanningImport(h.current,previewPlanningImport(h.current,withImage));saved.posts.at(-1).text='New edit';assert.throws(()=>previewPlanningImport(saved,withImage),/Konflikt/);
});
test('lost acknowledgement does not duplicate selected-image imports after reload',async t=>{
 const h=await setup(t),media=selected(h),incoming=await csvDraftState(h.current,'Text\n""','mastodon',{images:[media]});h.setLost();await assert.rejects(h.store.save(applyPlanningImport(h.current,previewPlanningImport(h.current,incoming))));const reloaded=await h.store.load();assert.equal(previewPlanningImport(reloaded,await csvDraftState(reloaded,'Text\n""','mastodon',{images:[media]})).additions.length,0);assert.equal(h.calls.filter(([m])=>m==='PUT').length,1);
});
test('CAS conflict with selected media cannot partially append drafts or upload files',async t=>{
 const h=await setup(t),media=selected(h),incoming=await csvDraftState(h.current,'Text\n""','mastodon',{images:[media]}),next=applyPlanningImport(h.current,previewPlanningImport(h.current,incoming));const remote=await h.client.load();remote.posts[0].title='New owner edit';await h.client.save(remote);h.calls.length=0;await assert.rejects(h.store.save(next),e=>e.code==='REVISION_CONFLICT');assert.equal((await h.client.load()).posts.length,1);assert.equal(h.calls.filter(([m])=>m==='POST').length,0);
});
test('empty rows need explicit media; image-only scheduled rows retain existing text requirement',async t=>{
 const h=await setup(t);await assert.rejects(csvDraftState(h.current,'Text\n""','mastodon'),/Text oder gespeichertes Bild/);await assert.rejects(csvDraftState(h.current,'Text,Posting Time\n,2030-04-06 09:00','mastodon',{now:'2030-01-01T00:00:00.000Z',timezone:'UTC',images:[selected(h)]}),/Beitrag/);
});
