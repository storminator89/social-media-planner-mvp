import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore as serverStore} from '../../modules/data/takt-adapter.mjs';
import {createTaktStore as browserStore} from '../../public/data-client/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {normalizeMediaItems} from '../../modules/workflows/media-items.mjs';
import {parsePlanningExport,previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';
import {CHANNELS} from '../../public/model.js';
import {D1TestAdapter,R2TestAdapter,png,request} from './support.mjs';
// Synthetic container signatures, not playable videos. Decode validation belongs to the editor.
const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,1]);
const webm=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x84,0x42,0x82,0x84,119,101,98,109]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const local=(bytes,type='video/mp4',name='original.mp4')=>({dataUrl:`data:${type};base64,${Buffer.from(bytes).toString('base64')}`,type,name,alt:'Beschreibung'});
const draft=(id='draft',mediaItems=[])=>({id,title:'Original',tags:['Video'],text:'Redaktioneller Entwurf',variantTexts:{},channels:['instagram'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'UTC',cover:null,mediaItems,createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'});
function setup(t,factory=serverStore){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];t.after(()=>env.DB.sql.close());
 const client=createPlannerClient({fetcher:(path,opts={})=>{calls.push([opts.method||'GET',path]);return handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);}});
 return {env,client,calls,store:factory({client,timezone:'UTC',channels:CHANNELS})};
}
const writes=calls=>calls.filter(([method])=>method==='POST'||method==='PUT');
for(const [label,factory] of [['server',serverStore],['browser',browserStore]]){
 for(const [type,bytes] of [['video/mp4',mp4],['video/webm',webm]])test(`${label} ${type} upload preserves original bytes, reload and repeated saves reuse ID`,async t=>{
  const {store,client,env,calls}=setup(t,factory),input={...await store.load(),posts:[draft('video',[local(bytes,type)])]};
  const saved=await store.save(input),item=saved.posts[0].mediaItems[0];assert.equal(item.type,type);assert.equal(item.dataUrl,undefined);
  const object=[...env.BUCKET.data.values()][0];assert.equal(hash(object.value),hash(bytes));
  const served=await handlePlannerRequest(request('/media/'+item.id),env);assert.equal(served.status,200);assert.equal(hash(new Uint8Array(await served.arrayBuffer())),hash(bytes));
  assert.equal((await handlePlannerRequest(request('/media/'+item.id,{owner:'bob'}),env)).status,404);
  const repeat=await store.save({...input,revision:saved.revision});await store.save(repeat);await store.save(await store.load());
  assert.equal(calls.filter(([m,p])=>m==='POST'&&p.endsWith('/media')).length,1);assert.equal(env.BUCKET.data.size,1);
  const canonical=await client.load();assert.deepEqual(canonical.posts[0].variants[0].mediaIds,[item.id]);assert.equal(canonical.posts[0].variants[0].format,'post');
 });
 test(`${label} bad MIME, mixed/video lists and oversized decoded media fail before writes`,async t=>{
  const {store,calls}=setup(t,factory),base=await store.load();
  for(const items of [[local(png)],[local(mp4,'video/webm')],[local(mp4),local(png,'image/png','image.png')],[local(mp4),local(webm,'video/webm')],[local(new Uint8Array(8*1024*1024+1))],[local(new Uint8Array(2*1024*1024+1),'image/png')]]){
   calls.length=0;await assert.rejects(store.save({...base,posts:[draft('valid',[local(mp4)]),draft('invalid',items)]}),e=>e.code==='INVALID_MEDIA');assert.deepEqual(writes(calls),[]);
  }
 });
 test(`${label} synthetic existing video survives text import; full JSON export is rejected without loss`,async t=>{
  const {store,client,env,calls}=setup(t,factory);await store.save({...await store.load(),posts:[draft()]});
  const key='synthetic/existing-video';env.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice','existing-video',key,'original.mp4','video/mp4',mp4.length,'Beschreibung','2030-01-01T00:00:00.000Z');env.BUCKET.data.set(key,{value:mp4,opts:{httpMetadata:{contentType:'video/mp4'}}});
  const canonical=await client.load();canonical.posts[0].variants[0].mediaIds=['existing-video'];canonical.posts[0].variants[0].statusNote='Private note';await client.save(canonical);
  const current=await store.load(),rows=env.DB.sql.prepare('SELECT * FROM planner_media').all();calls.length=0;
  assert.throws(()=>parsePlanningExport(JSON.stringify(current)),/enthält Medien/);assert.deepEqual(writes(calls),[]);
  const incoming=parsePlanningExport(JSON.stringify({...current,posts:[draft('incoming')]})),preview=previewPlanningImport(current,incoming);
  const saved=await store.save(applyPlanningImport(current,preview),{expectedInstants:preview.expectedInstants});assert.deepEqual(saved.posts[0].mediaItems,current.posts[0].mediaItems);
  assert.deepEqual(env.DB.sql.prepare('SELECT * FROM planner_media').all(),rows);assert.equal(hash(env.BUCKET.data.get(key).value),hash(mp4));assert.equal((await client.load()).posts[0].variants[0].statusNote,'Private note');assert.equal(calls.filter(([m])=>m==='POST').length,0);
 });
}
test('media contract accepts single saved video and retains ordered ten-image list',()=>{
 const saved=(id,type)=>({id,url:`/api/planner/media/${id}`,alt:'Description',name:id,type});const imageList=Array.from({length:10},(_,i)=>saved(`image-${i}`,'image/png'));
 assert.deepEqual(normalizeMediaItems(imageList),imageList);assert.equal(normalizeMediaItems([saved('video','video/mp4')]).length,1);
 for(const items of [[saved('video','video/mp4'),...imageList],[saved('one','video/mp4'),saved('two','video/webm')]])assert.throws(()=>normalizeMediaItems(items));
});
test('old image bytes remain unchanged alongside separate video post',async t=>{
 const {store,env}=setup(t),input={...await store.load(),posts:[draft('image',[local(png,'image/png','image.png')]),draft('video',[local(mp4)])]};
 const saved=await store.save(input);await store.save(await store.load());assert.equal(saved.posts[0].mediaItems[0].type,'image/png');assert.equal(hash([...env.BUCKET.data.values()][0].value),hash(png));assert.equal(env.BUCKET.data.size,2);
});
test('video larger than image limit is accepted unchanged up to 8 MiB',async t=>{
 const {store,env}=setup(t),bytes=new Uint8Array(8*1024*1024);bytes.set(mp4);
 await store.save({...await store.load(),posts:[draft('large',[local(bytes)])]});assert.equal(hash([...env.BUCKET.data.values()][0].value),hash(bytes));
});
test('uncertain video save is not retried and explicit reload discovers committed reference',async t=>{
 const {store,client,env,calls}=setup(t),input={...await store.load(),posts:[draft('video',[local(mp4)])]},save=client.save;
 client.save=async next=>{await save(next);throw Error('Connection lost after commit');};
 await assert.rejects(store.save(input),/Connection lost/);assert.equal(writes(calls).filter(([m])=>m==='PUT').length,1);assert.equal(env.BUCKET.data.size,1);assert.equal(input.posts[0].mediaItems[0].dataUrl,local(mp4).dataUrl);
 client.save=save;const reloaded=await store.load();assert.equal(reloaded.posts[0].mediaItems[0].type,'video/mp4');await store.save(reloaded);assert.equal(calls.filter(([m,p])=>m==='POST'&&p.endsWith('/media')).length,1);
});
