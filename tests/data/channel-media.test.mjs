import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaktStore} from '../../modules/data/takt-adapter.mjs';
import {createDemoState,normalizeState,validatePost} from '../../public/model.js';
import {normalizeChannelMediaItems,allReferencedMediaItems,effectiveMediaItems} from '../../modules/workflows/media-items.mjs';
import {duplicateTaktDraft} from '../../modules/workflows/queue.mjs';
import {savedImageCatalog} from '../../public/saved-images.js';
import {parsePlanningExport} from '../../public/planner-import.js';
const image=i=>({id:`image-${i}`,url:`/api/planner/media/image-${i}`,alt:`Bild ${i}`,name:`${i}.png`,type:'image/png'});
function setup({first=[],second=[image(1)],receipt=x=>x,rejection=null}={}){
 let saves=0,uploads=0;
 const all=Array.from(new Map([...first,...second].map(m=>[m.id,m])).values());
 let state={schemaVersion:3,revision:1,settings:{timezone:'UTC',locale:'de-DE'},channels:createDemoState().channels,media:all.map(m=>({id:m.id,url:m.url,altText:m.alt,filename:m.name,mimeType:m.type})),posts:[{id:'post',title:'',tags:[],body:'Text',stage:'draft',cover:null,scheduleBinding:null,scheduledAt:null,timezone:'UTC',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',variants:['instagram','linkedin'].map((channelId,i)=>({id:i?'a':'z',channelId,body:'Text',inheritsBody:true,status:'draft',statusNote:'Keep '+channelId,publishedAt:null,publishedUrl:null,format:'post',scheduledAt:null,timezone:'UTC',mediaIds:(i?second:first).map(m=>m.id)}))}]};
 const client={load:async()=>structuredClone(state),uploadMedia:async()=>{uploads++;throw Error('No uploads');},save:async next=>{saves++;if(rejection)throw rejection;state={...structuredClone(next),revision:next.revision+1,media:state.media};return receipt(structuredClone(state));}};
 return {store:createTaktStore({client,timezone:'UTC',channels:createDemoState().channels}),counts:()=>({saves,uploads}),canonical:()=>structuredClone(state)};
}
test('first empty, secondary-only references survive normalize, duplicate, catalog and generic save',async()=>{
 const s=setup(),ui=normalizeState(await s.store.load()),p=ui.posts[0];
 assert.deepEqual(p.mediaItems,[]);assert.deepEqual(effectiveMediaItems(p,'linkedin'),[image(1)]);
 assert.deepEqual(allReferencedMediaItems(p),[image(1)]);assert.deepEqual(duplicateTaktDraft(p,{id:'copy'}).channelMediaItems,p.channelMediaItems);
 assert.equal(savedImageCatalog(ui).items[0].usageCount,1);assert.deepEqual(validatePost(p),[]);
 assert.throws(()=>parsePlanningExport(JSON.stringify(ui)),/Kanalmedien/);
 await s.store.save(ui);assert.deepEqual(s.canonical().posts[0].variants.map(v=>v.mediaIds),[[],['image-1']]);
});
test('independent order and up to ten each, greater than ten union',async()=>{
 const s=setup({first:Array.from({length:10},(_,i)=>image(i)),second:Array.from({length:10},(_,i)=>image(i+10))});const ui=await s.store.load();await s.store.save(ui);assert.equal(allReferencedMediaItems(ui.posts[0]).length,20);assert.deepEqual(s.counts(),{saves:1,uploads:0});
});
test('map exact keys, saved-only, projection, counts and secondary metadata are validated before writes',async()=>{
 const mutations=[p=>delete p.channelMediaItems,p=>delete p.channelMediaItems.linkedin,p=>p.channelMediaItems.extra=[],p=>p.channelMediaItems.linkedin.push(image(1)),p=>p.mediaItems.push(image(1)),p=>p.channelMediaItems.linkedin[0].alt='changed',p=>p.channelMediaItems.linkedin[0].url='/other',p=>p.channelMediaItems.linkedin[0].name='other',p=>p.channelMediaItems.linkedin[0].type='image/jpeg',p=>p.channelMediaItems.linkedin=[image(99)],p=>p.channelMediaItems.linkedin=[{dataUrl:'data:image/png;base64,YQ==',alt:'a',name:'a',type:'image/png'}],p=>p.channelMediaItems.linkedin=[{...image(1),type:'video/mp4'}],p=>p.channelMediaItems.linkedin=Array.from({length:11},(_,i)=>image(i))];
 for(const mutate of mutations){const s=setup(),ui=await s.store.load();mutate(ui.posts[0]);await assert.rejects(s.store.save(ui));assert.deepEqual(s.counts(),{saves:0,uploads:0});}
});
test('full equal explicit map clears divergence, never omitted map',async()=>{
 const s=setup(),ui=await s.store.load();ui.posts[0].channelMediaItems={instagram:[],linkedin:[]};const saved=await s.store.save(ui);assert.equal(Object.hasOwn(saved.posts[0],'channelMediaItems'),false);assert.deepEqual(s.canonical().posts[0].variants.map(v=>v.mediaIds),[[],[]]);
});
test('change operation changes IDs only, receipt order projects first canonical variant',async()=>{
 const s=setup({second:[image(1),image(2)],receipt:x=>{x.posts[0].variants.reverse();return x;}}),ui=await s.store.load(),before=s.canonical();
 const result=await s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:{instagram:[image(2),image(1)],linkedin:[]}});
 assert.deepEqual(result.posts[0].channels,['linkedin','instagram']);assert.deepEqual(result.posts[0].mediaItems,[]);assert.deepEqual(result.posts[0].channelMediaItems.instagram,[image(2),image(1)]);
 const after=s.canonical();for(let i=0;i<2;i++){const old=before.posts[0].variants[i],next=after.posts[0].variants[i];assert.deepEqual({...next,mediaIds:old.mediaIds},old);}assert.deepEqual(s.counts(),{saves:1,uploads:0});
});
test('operation rejects changed UI, stale revision and invalid reference before save',async()=>{
 const s=setup(),ui=await s.store.load(),map={instagram:[],linkedin:[image(1)]};
 await assert.rejects(s.store.changeChannelMedia({...ui,revision:0},{postId:'post',channelMediaItems:map}));
 const changed=structuredClone(ui);changed.posts[0].text+='changed';await assert.rejects(s.store.changeChannelMedia(changed,{postId:'post',channelMediaItems:map}));
 await assert.rejects(s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:{...map,linkedin:[image(99)]}}));assert.equal(s.counts().saves,0);
});
for(const receipt of [x=>{x.posts[0].variants[1].statusNote='lost';return x;},x=>{x.media[0].altText='lost';return x;},x=>null])test('uncertain change receipt fences subsequent writes until reload',async()=>{
 const s=setup({receipt}),ui=await s.store.load();await assert.rejects(s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:{instagram:[],linkedin:[image(1)]}}));await assert.rejects(s.store.save(ui),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.counts().saves,1);
});
test('known conflict does not fence or automatically repeat',async()=>{
 const s=setup({rejection:Object.assign(Error('conflict'),{status:409,code:'REVISION_CONFLICT'})}),ui=await s.store.load();await assert.rejects(s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:{instagram:[],linkedin:[image(1)]}}),e=>e.code==='REVISION_CONFLICT');assert.equal(s.counts().saves,1);await assert.rejects(s.store.save(ui),e=>e.code==='REVISION_CONFLICT');
});
test('canonical split, archive, copy retain each channel image set',async()=>{
 const split=setup(),ui=await split.store.load();const divided=await split.store.splitDraft(ui,{postId:'post'});assert.deepEqual(divided.posts.map(p=>p.mediaItems),[[],[image(1)]]);
 const archive=setup();let state=await archive.store.load();state=(await archive.store.archiveAction(state,{postId:'post',action:'archive'})).state;const copied=await archive.store.archiveAction(state,{postId:'post',action:'copy'});assert.deepEqual(copied.state.posts.find(p=>p.id===copied.copyId).channelMediaItems,{instagram:[],linkedin:[image(1)]});
});
test('secondary alt checked and same media counted only once per post',async()=>{
 const s=setup({first:[image(1)],second:[image(1),image(2)]}),ui=await s.store.load();assert.equal(savedImageCatalog(ui).items.find(m=>m.id==='image-1').usageCount,1);ui.posts[0].channelMediaItems.linkedin[1].alt='';assert.ok(validatePost(ui.posts[0]).length);
});
test('generic mapped save checks secondary receipt metadata and fences unknown outcome',async()=>{
 const s=setup({receipt:x=>{x.media[0].filename='changed';return x;}}),ui=await s.store.load();await assert.rejects(s.store.save(ui),e=>e.code==='INVALID_RESPONSE');await assert.rejects(s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:ui.posts[0].channelMediaItems}),e=>e.code==='RELOAD_REQUIRED');assert.equal(s.counts().saves,1);
});
test('delete unrelated draft, timezone change and Undo preserve mapped references',async()=>{
 const s=setup();let ui=await s.store.load();ui.posts.push({...duplicateTaktDraft(ui.posts[0],{id:'unrelated'}),mediaItems:[],channelMediaItems:{instagram:[],linkedin:[]}});ui=await s.store.save(ui);ui.posts=ui.posts.filter(p=>p.id!=='unrelated');ui.settings.timezone='Europe/Berlin';ui=await s.store.save(ui);assert.deepEqual(ui.posts[0].channelMediaItems,{instagram:[],linkedin:[image(1)]});const held=structuredClone(ui.posts[0]);ui.posts=[];ui=await s.store.save(ui);ui.posts.push(held);ui=await s.store.save(ui);assert.deepEqual(ui.posts[0].channelMediaItems,held.channelMediaItems);
});
test('different saved video lists fail closed rather than compacting',async()=>{
 const s=setup({second:[{...image(1),type:'video/mp4'}]});await assert.rejects(s.store.load(),/gespeicherte Bilder/);
});
test('operation validates every secondary metadata field and leaves caller map unchanged',async()=>{
 for(const field of ['id','url','alt','name','type']){const s=setup(),ui=await s.store.load(),map={instagram:[],linkedin:[image(1)]};map.linkedin[0][field]='bad';await assert.rejects(s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:map}));assert.equal(s.counts().saves,0);}
 const s=setup(),ui=await s.store.load(),map={instagram:[image(1)],linkedin:[]},copy=structuredClone(map);await s.store.changeChannelMedia(ui,{postId:'post',channelMediaItems:map});assert.deepEqual(map,copy);
});
test('catalog inspects rich references independently, strips extras and poisons conflicts in either channel order',()=>{
 for(const reverse of [false,true]){const refs=[image(1),{...image(1),url:'/api/planner/media/wrong'}];if(reverse)refs.reverse();const p={title:'Title',text:'Text',mediaItems:[],channelMediaItems:{instagram:[refs[0]],linkedin:[refs[1],{...image(2),secret:'hidden'}]}};const catalog=savedImageCatalog({posts:[p]});assert.deepEqual(catalog.items.map(item=>item.id),['image-2']);assert.equal(catalog.hasUnavailableImages,true);assert.equal(JSON.stringify(catalog).includes('hidden'),false);}
});
