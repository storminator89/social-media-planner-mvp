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
function setup(items=[],{variantItems=items,receipt=x=>x,uploadReceipt=x=>x,saveError=null,failUpload=0}={}){
 let uploads=0,saves=0;
 let state={schemaVersion:3,revision:0,settings:{timezone:'UTC'},channels:createDemoState().channels,media:items.map(m=>({id:m.id,url:m.url,altText:m.alt,filename:m.name,mimeType:m.type})),posts:items.length?[{id:'post',title:'',tags:[],body:'Text',stage:'draft',cover:null,scheduleBinding:null,scheduledAt:null,timezone:'UTC',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',variants:['instagram','linkedin'].map((channelId,i)=>({id:`v${i}`,channelId,body:'Text',inheritsBody:true,status:'draft',format:'post',scheduledAt:null,timezone:'UTC',mediaIds:(i?variantItems:items).map(m=>m.id)}))}]:[]};
 const client={load:async()=>structuredClone(state),uploadMedia:async(file,alt)=>{uploads++;if(uploads===failUpload)throw Error('synthetic upload failure');const m={id:`upload-${uploads}`,url:`/api/planner/media/upload-${uploads}`,filename:file.name,mimeType:file.type,altText:alt};const returned=uploadReceipt(m);state.media.push(returned);return structuredClone(returned);},save:async next=>{saves++;if(saveError)throw saveError;state={...structuredClone(next),revision:next.revision+1,media:state.media};return receipt(structuredClone(state));}};
 return {store:createTaktStore({client,timezone:'UTC',channels:createDemoState().channels}),counts:()=>({uploads,saves})};
}

test('adversarial: full carousel receipt rejects changed text',async()=>{
 const {store}=setup([image(1),image(2)],{receipt:s=>{s.posts[0].body='LOST TEXT';for(const v of s.posts[0].variants)v.body='LOST TEXT';return s;}});
 const ui=await store.load();ui.posts[0].text='New intended text';await assert.rejects(store.save(ui));
});
test('adversarial: upload receipt rejects changed requested alt',async()=>{
 const {store,counts}=setup([],{uploadReceipt:m=>({...m,altText:'WRONG ALT'})});const ui=await store.load();ui.posts=[post([local(1),local(2)])];await assert.rejects(store.save(ui));assert.deepEqual(counts(),{uploads:1,saves:0});
});
test('adversarial: receipt rejects extra channel variant',async()=>{
 const {store}=setup([image(1),image(2)],{receipt:s=>{s.posts[0].variants.push({...s.posts[0].variants[0],id:'extra',channelId:'mastodon'});return s;}});const ui=await store.load();await assert.rejects(store.save(ui));
});

test('adversarial: later upload failure leaves canonical save untouched and earlier upload reusable',async()=>{
 const {store,counts}=setup([],{failUpload:2});const ui=await store.load();ui.posts=[post([local(1),local(2)])];const original=structuredClone(ui);await assert.rejects(store.save(ui));assert.deepEqual(ui,original);assert.deepEqual(counts(),{uploads:2,saves:0});const result=await store.save(ui);assert.equal(result.posts[0].mediaItems.length,2);assert.deepEqual(counts(),{uploads:3,saves:1});
});
test('adversarial: CAS failure never mutates submitted local carousel or retries write',async()=>{
 const {store,counts}=setup([],{saveError:Object.assign(Error('conflict'),{status:409,code:'REVISION_CONFLICT'})});const ui=await store.load();ui.posts=[post([local(1),local(2)])];const original=structuredClone(ui);await assert.rejects(store.save(ui));assert.deepEqual(ui,original);assert.equal(store.plannerRevision,0);assert.deepEqual(counts(),{uploads:2,saves:1});
});
test('adversarial: unknown save leaves local carousel intact and never auto retries',async()=>{
 const {store,counts}=setup([],{saveError:Error('response lost')});const ui=await store.load();ui.posts=[post([local(1),local(2)])];const original=structuredClone(ui);await assert.rejects(store.save(ui));assert.deepEqual(ui,original);assert.equal(store.plannerRevision,0);assert.deepEqual(counts(),{uploads:2,saves:1});
});
