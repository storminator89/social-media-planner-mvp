import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {createTaktStore} from '../../public/data-client/takt-adapter.mjs';
import {CHANNELS} from '../../public/model.js';
import {copySavedImage} from '../../public/saved-alt-copy.js';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {D1TestAdapter,R2TestAdapter,png} from './support.mjs';
const draft=id=>({id,title:'Keep title',tags:['Keep label'],text:'Keep text',variantTexts:{mastodon:'Own text'},channels:['mastodon'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'Europe/Berlin',cover:null,mediaItems:[],createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'});
const formats={'image/png':png,'image/jpeg':new Uint8Array([255,216,255,224,0,8,0,5]),'image/webp':new Uint8Array([82,73,70,70,20,0,0,0,87,69,66,80,0,5])};
async function setup(t,blank=false,type='image/png'){
 const bytes=formats[type],name='Original ü.'+type.split('/')[1];
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},calls=[];t.after(()=>env.DB.sql.close());
 const fetcher=(path,opts={})=>{calls.push([opts.method||'GET',path]);return handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'alice'}}),env);};
 const client=createPlannerClient({fetcher}),store=createTaktStore({client,timezone:'Europe/Berlin',channels:CHANNELS});await store.save({...await store.load(),posts:[draft('edit'),draft('shared')]});
 env.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice','image','original-key',name,type,bytes.length,blank?'':'Original alt','2030-01-01T00:00:00.000Z');env.BUCKET.data.set('original-key',{value:new Uint8Array(bytes),opts:{httpMetadata:{contentType:type}}});
 const initial=await client.load();for(const post of initial.posts)post.variants[0].mediaIds=['image'];await client.save(initial);const current=await store.load();calls.length=0;return {env,fetcher,client,store,current,calls,bytes,name};
}
async function stage(h){const file=await copySavedImage(h.current.posts[0].mediaItems[0],'Neue Beschreibung 🦋',{fetcher:h.fetcher});const next=structuredClone(h.current);next.posts[0].mediaItems[0]={dataUrl:'data:'+file.type+';base64,'+Buffer.from(await file.arrayBuffer()).toString('base64'),type:file.type,name:file.name,alt:'Neue Beschreibung 🦋'};return next;}
for(const type of Object.keys(formats))for(const blank of [false,true])test(`explicit save copies exact ${type} bytes and replaces only current reference (blank=${blank})`,async t=>{
 const h=await setup(t,blank,type),before=await h.client.load(),next=await stage(h);assert.equal(h.calls.some(([method])=>method==='POST'),false);assert.deepEqual(await h.client.load(),before);
 const saved=await h.store.save(next),after=await h.client.load(),edited=saved.posts.find(p=>p.id==='edit'),shared=saved.posts.find(p=>p.id==='shared');assert.notEqual(edited.mediaItems[0].id,'image');assert.equal(shared.mediaItems[0].id,'image');assert.equal(shared.mediaItems[0].alt,blank?'':'Original alt');assert.equal(edited.mediaItems[0].alt,'Neue Beschreibung 🦋');assert.equal(edited.mediaItems[0].name,h.name);assert.equal(edited.mediaItems[0].type,type);assert.equal(edited.text,'Keep text');assert.deepEqual(edited.variantTexts,{mastodon:'Own text'});assert.deepEqual(edited.tags,['Keep label']);
 const row=h.env.DB.sql.prepare('SELECT * FROM planner_media WHERE id=?').get(edited.mediaItems[0].id);assert.deepEqual(h.env.BUCKET.data.get(row.object_key).value,h.bytes);assert.deepEqual(h.env.BUCKET.data.get('original-key').value,h.bytes);assert.equal(after.media.length,2);assert.deepEqual(after.media.find(m=>m.id==='image'),before.media[0]);
});
test('full media quota rejects copy save without replacing either post or original bytes',async t=>{
 const h=await setup(t);for(let n=1;n<100;n++)h.env.DB.sql.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run('alice','quota'+n,'quota-key'+n,'q.png','image/png',png.length,'Quota','2030-01-01T00:00:00.000Z');
 const before=await h.client.load(),next=await stage(h);await assert.rejects(h.store.save(next),e=>e.code==='MEDIA_LIMIT');assert.deepEqual(await h.client.load(),before);assert.deepEqual(h.env.BUCKET.data.get('original-key').value,h.bytes);assert.equal(h.env.BUCKET.data.size,1);
});
test('stale revision rejects post changes without retry; uploaded unreferenced copy remains accounted for',async t=>{
 const h=await setup(t),next=await stage(h),newer=await h.client.load();newer.posts[1].body='Other tab';await h.client.save(newer);const before=await h.client.load();h.calls.length=0;await assert.rejects(h.store.save(next));const after=await h.client.load();assert.deepEqual(after.posts,before.posts);assert.equal(after.revision,before.revision);assert.deepEqual(after.media.find(m=>m.id==='image'),before.media[0]);assert.equal(after.media.length,2);assert.equal(h.calls.filter(([method,path])=>method==='POST'&&path==='/api/planner/media').length,1);assert.equal(h.calls.filter(([method,path])=>method==='PUT'&&path==='/api/planner/state').length,1);
});
