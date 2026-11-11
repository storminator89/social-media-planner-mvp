import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaktStore} from '../../modules/data/takt-adapter.mjs';
import {createDemoState,normalizeState,normalizeMediaItems} from '../../public/model.js';
import {duplicateTaktDraft} from '../../modules/workflows/queue.mjs';
import {savedImageCatalog} from '../../public/saved-images.js';
import {parsePlanningExport} from '../../public/planner-import.js';
const image=i=>({id:`image-${i}`,url:`/api/planner/media/image-${i}`,alt:`Bild ${i}`,name:`${i}.png`,type:'image/png'});
const local=i=>({dataUrl:'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from(`bytes-${i}`)]).toString('base64'),alt:`Bild ${i}`,name:`${i}.png`,type:'image/png'});
const post=items=>({...createDemoState().posts[1],id:'post',status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,cover:null,mediaItems:items});
function setup(items=[],{variantItems=items,receipt=x=>x}={}){
 let uploads=0,saves=0;
 let state={schemaVersion:3,revision:0,settings:{timezone:'UTC'},channels:createDemoState().channels,media:items.map(m=>({id:m.id,url:m.url,altText:m.alt,filename:m.name,mimeType:m.type})),posts:items.length?[{id:'post',title:'',tags:[],body:'Text',stage:'draft',cover:null,scheduleBinding:null,scheduledAt:null,timezone:'UTC',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',variants:['instagram','linkedin'].map((channelId,i)=>({id:`v${i}`,channelId,body:'Text',inheritsBody:true,status:'draft',format:'post',scheduledAt:null,timezone:'UTC',mediaIds:(i?variantItems:items).map(m=>m.id)}))}]:[]};
 const client={load:async()=>structuredClone(state),uploadMedia:async(file,alt)=>{uploads++;const m={id:`upload-${uploads}`,url:`/api/planner/media/upload-${uploads}`,filename:file.name,mimeType:file.type,altText:alt};state.media.push(m);return structuredClone(m);},save:async next=>{saves++;state={...structuredClone(next),revision:next.revision+1,media:state.media};return receipt(structuredClone(state));}};
 return {store:createTaktStore({client,timezone:'UTC',channels:createDemoState().channels}),counts:()=>({uploads,saves})};
}
for(const count of [0,1,2,10])test(`schema3 preserves ${count} ordered images through normalize/duplicate/save`,async()=>{
 const items=Array.from({length:count},(_,i)=>image(i));const value=createDemoState();value.posts=[post(items)];assert.deepEqual(normalizeState(value).posts[0].mediaItems,items);assert.deepEqual(duplicateTaktDraft(value.posts[0],{id:'copy'}).mediaItems,items);
 const {store}=setup(items);const ui=await store.load();if(!count)ui.posts=[post([])];const saved=await store.save(ui);assert.deepEqual(saved.posts[0].mediaItems,items);assert.equal(saved.schemaVersion,3);assert.equal(Object.hasOwn(saved.posts[0],'media'),false);
});
test('normalizer rejects malformed, missing, duplicate, 11 images and ambiguous legacy fields',()=>{
 for(const items of [undefined,null,Array.from({length:11},(_,i)=>image(i)),[image(1),image(1)],[{...image(1),id:'missing'}],[{...image(1),dataUrl:local(1).dataUrl}]])assert.throws(()=>normalizeMediaItems(items));
 const ui=createDemoState();ui.posts=[post([])];const legacy=structuredClone(ui);legacy.schemaVersion=2;delete legacy.posts[0].mediaItems;legacy.posts[0].media=null;assert.deepEqual(normalizeState(legacy).posts[0].mediaItems,[]);legacy.posts[0].media=image(1);assert.deepEqual(normalizeState(legacy).posts[0].mediaItems,[image(1)]);legacy.posts[0].mediaItems=[];assert.throws(()=>normalizeState(legacy));delete legacy.posts[0].mediaItems;legacy.posts[0].media={url:'https://bad'};assert.throws(()=>normalizeState(legacy));
});
test('adapter preserves channel order divergence and rejects missing referenced media',async()=>{
 const items=[image(1),image(2)];const loaded=await setup(items,{variantItems:[...items].reverse()}).store.load();assert.deepEqual(loaded.posts[0].channelMediaItems.linkedin,[...items].reverse());await assert.rejects(setup(items,{variantItems:[image(3)]}).store.load());
});
test('all metadata and local decoding are checked before any upload',async()=>{
 for(const invalid of [{...local(2),alt:''},{...local(2),dataUrl:'data:image/png;base64,A'},image(99)]){
 const {store,counts}=setup();const ui=await store.load();ui.posts=[post([local(1),invalid])];await assert.rejects(store.save(ui));assert.deepEqual(counts(),{uploads:0,saves:0});
 }
});
test('save refuses omitted list, old schema and mutation of saved shared alt',async()=>{
 const {store,counts}=setup([image(1),image(2)]);const ui=await store.load();const missing=structuredClone(ui);delete missing.posts[0].mediaItems;await assert.rejects(store.save(missing));await assert.rejects(store.save({...ui,schemaVersion:2}));ui.posts[0].mediaItems[1].alt='Changed';await assert.rejects(store.save(ui));assert.deepEqual(counts(),{uploads:0,saves:0});
});
test('catalog includes all ordered images; JSON accepts text schemas only',()=>{
 const ui=createDemoState();ui.posts=[post([image(1),image(2)])];assert.deepEqual(savedImageCatalog(ui).items.map(x=>x.id),['image-1','image-2']);assert.throws(()=>parsePlanningExport(JSON.stringify(ui)));ui.posts[0].mediaItems=[];assert.equal(parsePlanningExport(JSON.stringify(ui)).schemaVersion,3);ui.schemaVersion=2;delete ui.posts[0].mediaItems;ui.posts[0].media=null;assert.equal(parsePlanningExport(JSON.stringify(ui)).schemaVersion,3);
});
test('duplicate byte identities reject before upload even with different base64 encodings',async()=>{
 const {store,counts}=setup();const ui=await store.load();const a={...local(1),dataUrl:'data:image/png;base64,YQ=='};ui.posts=[post([a,{...a,dataUrl:'data:image/png;base64,YR=='}])];await assert.rejects(store.save(ui));assert.deepEqual(counts(),{uploads:0,saves:0});
});
test('preflight reaches later posts before uploading an earlier valid local image',async()=>{
 const {store,counts}=setup();const ui=await store.load();ui.posts=[post([local(1)]),{...post([{...local(2),alt:''}]),id:'later'}];await assert.rejects(store.save(ui));assert.deepEqual(counts(),{uploads:0,saves:0});
});
test('upload cache keeps ordered images reusable without second upload',async()=>{
 const {store,counts}=setup();const ui=await store.load();ui.posts=[post([local(1),local(2)])];const saved=await store.save(ui);assert.deepEqual(saved.posts[0].mediaItems.map(m=>m.name),['1.png','2.png']);await store.save({...ui,revision:saved.revision});assert.deepEqual(counts(),{uploads:2,saves:2});
});

test('save receipt cannot silently reorder images or change their metadata',async()=>{
 for(const receipt of [state=>{for(const v of state.posts[0].variants)v.mediaIds.reverse();return state;},state=>{state.media[1].altText='Changed remotely';return state;}]){
  const {store}=setup([image(1),image(2)],{receipt});const ui=await store.load();await assert.rejects(store.save(ui),e=>e.code==='INVALID_RESPONSE');
 }
});
test('historical blank-alt exception is limited to an entirely unchanged confirmed post',async()=>{
 const blank={...image(1),alt:''};const {store,counts}=setup([blank,image(2)]);const ui=await store.load();
 for(const change of [p=>{p.text+=' edit';},p=>{p.mediaItems.reverse();},p=>{p.mediaItems.push(local(3));}]){const next=structuredClone(ui);change(next.posts[0]);await assert.rejects(store.save(next));}
 const next=structuredClone(ui);next.posts.push({...post([blank]),id:'new'});await assert.rejects(store.save(next));assert.deepEqual(counts(),{uploads:0,saves:0});
});
